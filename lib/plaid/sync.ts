import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlaidClient } from "./client";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { SyncResult } from "./types";

/**
 * Perform a cursor-based transaction sync for a bank connection.
 *
 * Loops /transactions/sync until has_more === false, collecting added/modified/removed
 * transactions. Converts Plaid amounts to our sign convention (negative = outflow).
 *
 * @param accessToken - Decrypted Plaid access token
 * @param cursor - Previous sync cursor (null for initial sync)
 * @param bankConnectionId - Our bank connection UUID (for updating cursor)
 * @param householdId - Household ID for new transaction records
 * @param supabaseAdmin - Admin client for DB writes (bypasses RLS)
 * @returns Count of processed transactions and new cursor
 */
export async function syncTransactions(
  accessToken: string,
  cursor: string | null,
  bankConnectionId: string,
  householdId: string,
  supabaseAdmin: SupabaseClient
): Promise<SyncResult> {
  const plaid = createPlaidClient();

  // Collect all changes across paginated responses
  const allAdded: Array<{
    plaid_transaction_id: string;
    account_id: string;
    plaid_account_id: string;
    amount_cents: number;
    description: string;
    merchant_name: string | null;
    category: string | null;
    plaid_category_primary: string | null;
    plaid_category_detailed: string | null;
    transaction_date: string;
    is_pending: boolean;
    source: "plaid";
  }> = [];

  const allModified: typeof allAdded = [];
  const allRemovedIds: string[] = [];

  let hasMore = true;
  let nextCursor = cursor;

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor ?? undefined,
    });

    const { added, modified, removed, has_more, next_cursor } = response.data;

    // Convert added transactions
    for (const txn of added) {
      allAdded.push({
        plaid_transaction_id: txn.transaction_id,
        account_id: "", // Resolved below from plaid_account_id
        plaid_account_id: txn.account_id,
        // Invert Plaid sign: Plaid positive = outflow, our positive = inflow
        amount_cents: toCents(-txn.amount),
        description: txn.name,
        merchant_name: txn.merchant_name ?? null,
        category: txn.personal_finance_category?.primary ?? null,
        plaid_category_primary:
          txn.personal_finance_category?.primary ?? null,
        plaid_category_detailed:
          txn.personal_finance_category?.detailed ?? null,
        transaction_date: txn.date,
        is_pending: txn.pending,
        source: "plaid",
      });
    }

    // Convert modified transactions
    for (const txn of modified) {
      allModified.push({
        plaid_transaction_id: txn.transaction_id,
        account_id: "",
        plaid_account_id: txn.account_id,
        amount_cents: toCents(-txn.amount),
        description: txn.name,
        merchant_name: txn.merchant_name ?? null,
        category: txn.personal_finance_category?.primary ?? null,
        plaid_category_primary:
          txn.personal_finance_category?.primary ?? null,
        plaid_category_detailed:
          txn.personal_finance_category?.detailed ?? null,
        transaction_date: txn.date,
        is_pending: txn.pending,
        source: "plaid",
      });
    }

    // Collect removed transaction IDs
    for (const txn of removed) {
      allRemovedIds.push(txn.transaction_id);
    }

    hasMore = has_more;
    nextCursor = next_cursor;
  }

  // Resolve plaid_account_id -> our account_id
  if (allAdded.length > 0 || allModified.length > 0) {
    const plaidAccountIds = [
      ...new Set([
        ...allAdded.map((t) => t.plaid_account_id),
        ...allModified.map((t) => t.plaid_account_id),
      ]),
    ];

    const { data: accounts, error: accError } = await supabaseAdmin
      .from("accounts")
      .select("id, plaid_account_id")
      .eq("bank_connection_id", bankConnectionId)
      .in("plaid_account_id", plaidAccountIds);

    if (accError) throw accError;

    const accountMap = new Map(
      (accounts || []).map((a) => [a.plaid_account_id, a.id])
    );

    // Map plaid_account_id to our account_id
    for (const txn of allAdded) {
      const ourAccountId = accountMap.get(txn.plaid_account_id);
      if (!ourAccountId) {
        log.warn("Skipping transaction: no account found for plaid_account_id", {
          plaid_account_id: txn.plaid_account_id,
        });
        continue;
      }
      txn.account_id = ourAccountId;
    }

    for (const txn of allModified) {
      const ourAccountId = accountMap.get(txn.plaid_account_id);
      if (!ourAccountId) {
        log.warn("Skipping modified transaction: no account found for plaid_account_id", {
          plaid_account_id: txn.plaid_account_id,
        });
        continue;
      }
      txn.account_id = ourAccountId;
    }
  }

  // Filter out transactions without a resolved account_id
  const validAdded = allAdded.filter((t) => t.account_id);
  const validModified = allModified.filter((t) => t.account_id);

  // Upsert added transactions
  if (validAdded.length > 0) {
    const inserts = validAdded.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ plaid_account_id, ...rest }) => ({
        ...rest,
        household_id: householdId,
      })
    );

    const { error: insertError } = await supabaseAdmin
      .from("transactions")
      .upsert(inserts, { onConflict: "plaid_transaction_id" });

    if (insertError) throw insertError;
  }

  // Upsert modified transactions
  if (validModified.length > 0) {
    const upserts = validModified.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ plaid_account_id, ...rest }) => ({
        ...rest,
        household_id: householdId,
      })
    );

    const { error: upsertError } = await supabaseAdmin
      .from("transactions")
      .upsert(upserts, { onConflict: "plaid_transaction_id" });

    if (upsertError) throw upsertError;
  }

  // Delete removed transactions
  if (allRemovedIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("transactions")
      .delete()
      .in("plaid_transaction_id", allRemovedIds);

    if (deleteError) throw deleteError;
  }

  // Update bank_connection with new cursor and last_synced_at
  const { error: cursorError } = await supabaseAdmin
    .from("bank_connections")
    .update({
      sync_cursor: nextCursor,
      last_synced_at: new Date().toISOString(),
      status: "connected",
      error_code: null,
      error_message: null,
    })
    .eq("id", bankConnectionId);

  if (cursorError) throw cursorError;

  return {
    added: validAdded.length,
    modified: validModified.length,
    removed: allRemovedIds.length,
    cursor: nextCursor!,
  };
}
