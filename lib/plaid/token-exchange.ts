import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlaidClient } from "./client";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { AccountType } from "@/lib/db/types";
import type { ExchangeResult, PlaidAccountData } from "./types";

/**
 * Exchange a Plaid public_token for an access_token, store the token
 * in Supabase Vault, and create bank_connection + account records.
 *
 * @param publicToken - Ephemeral public token from Plaid Link onSuccess
 * @param householdId - The household this connection belongs to
 * @param userId - The authenticated user who initiated the connection
 * @param supabaseAdmin - Admin client (service role) for Vault access and RLS bypass
 * @returns Created bank connection ID and account records
 */
export async function exchangeAndStore(
  publicToken: string,
  householdId: string,
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<ExchangeResult> {
  const plaid = createPlaidClient();

  // 1. Exchange public_token for access_token + item_id
  const exchangeResponse = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const { access_token, item_id } = exchangeResponse.data;

  // 2. Get institution info from the item
  const itemResponse = await plaid.itemGet({ access_token });
  const institutionId = itemResponse.data.item.institution_id ?? null;

  let institutionName: string | null = null;
  if (institutionId) {
    try {
      const instResponse = await plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: ["US" as never],
      });
      institutionName = instResponse.data.institution.name;
    } catch (instError) {
      log.warn("Failed to fetch institution name from Plaid", {
        institution_id: institutionId,
        error: instError instanceof Error ? instError.message : String(instError),
      });
      institutionName = null;
    }
  }

  // 3. Get accounts list
  const accountsResponse = await plaid.accountsGet({ access_token });
  const plaidAccounts: PlaidAccountData[] = accountsResponse.data.accounts.map(
    (acc) => ({
      account_id: acc.account_id,
      name: acc.name,
      official_name: acc.official_name ?? null,
      mask: acc.mask ?? null,
      type: acc.type,
      subtype: acc.subtype ?? null,
      balance_current: acc.balances.current,
      balance_available: acc.balances.available,
    })
  );

  // 4. Create bank_connection record first (to get its ID for vault secret naming)
  const { data: bankConnection, error: bcError } = await supabaseAdmin
    .from("bank_connections")
    .insert({
      household_id: householdId,
      provider: "plaid",
      status: "connected",
      plaid_item_id: item_id,
      institution_id: institutionId,
      institution_name: institutionName,
      connected_by: userId,
    })
    .select("id")
    .single();

  if (bcError) throw bcError;
  const bankConnectionId = bankConnection.id;

  // 5. Store access token in Vault
  const secretName = `plaid_access_token_${bankConnectionId}`;
  const { error: vaultError } = await supabaseAdmin.rpc(
    "create_plaid_secret",
    {
      secret_name: secretName,
      secret_value: access_token,
      secret_description: `Plaid access token for bank connection ${bankConnectionId}`,
    }
  );
  if (vaultError) throw vaultError;

  // 6. Update bank_connection with vault_secret_name
  const { error: updateError } = await supabaseAdmin
    .from("bank_connections")
    .update({ vault_secret_name: secretName })
    .eq("id", bankConnectionId);

  if (updateError) throw updateError;

  // 7. Insert account records
  const accountInserts = plaidAccounts.map((acc) => {
    // Convert balance to cents.
    // For liability accounts (credit cards), Plaid reports positive current balance
    // which represents debt — negate to match our convention (negative = money owed).
    const isLiability = acc.type === "credit" || acc.type === "loan";
    const balanceCents =
      acc.balance_current != null
        ? isLiability
          ? toCents(-acc.balance_current)
          : toCents(acc.balance_current)
        : 0;

    return {
      household_id: householdId,
      bank_connection_id: bankConnectionId,
      name: acc.name,
      account_type: (acc.subtype || acc.type) as AccountType,
      balance_cents: balanceCents,
      currency: "USD",
      plaid_account_id: acc.account_id,
      official_name: acc.official_name,
      mask: acc.mask,
      subtype: acc.subtype,
    };
  });

  const { data: accounts, error: accError } = await supabaseAdmin
    .from("accounts")
    .insert(accountInserts)
    .select("id, name, subtype, balance_cents");

  if (accError) throw accError;

  return {
    bankConnectionId,
    accounts: (accounts || []).map((a) => ({
      id: a.id,
      name: a.name,
      subtype: a.subtype,
      balance_cents: a.balance_cents,
    })),
  };
}

/**
 * Retrieve the decrypted Plaid access token for a bank connection from Vault.
 *
 * @param bankConnectionId - The bank connection UUID
 * @param supabaseAdmin - Admin client (service role) for Vault access
 * @returns Decrypted access token string
 */
export async function getAccessToken(
  bankConnectionId: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  // Get the vault secret name from the bank connection
  const { data: conn, error: connError } = await supabaseAdmin
    .from("bank_connections")
    .select("vault_secret_name")
    .eq("id", bankConnectionId)
    .single();

  if (connError || !conn?.vault_secret_name) {
    throw new Error(
      `Vault secret not found for bank connection ${bankConnectionId}`
    );
  }

  // Read decrypted access token from Vault via RPC
  const { data: secret, error: secretError } = await supabaseAdmin.rpc(
    "get_plaid_secret",
    { secret_name: conn.vault_secret_name }
  );

  if (secretError) throw secretError;
  if (!secret) {
    throw new Error(
      `Access token not found in Vault for ${bankConnectionId}`
    );
  }

  return secret;
}

/**
 * Remove the Plaid access token from Vault for a bank connection.
 *
 * @param bankConnectionId - The bank connection UUID
 * @param supabaseAdmin - Admin client (service role) for Vault access
 */
export async function removeAccessToken(
  bankConnectionId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  // Get the vault secret name from the bank connection
  const { data: conn, error: connError } = await supabaseAdmin
    .from("bank_connections")
    .select("vault_secret_name")
    .eq("id", bankConnectionId)
    .single();

  if (connError || !conn?.vault_secret_name) {
    throw new Error(
      `Vault secret not found for bank connection ${bankConnectionId}`
    );
  }

  // Delete from Vault via RPC
  const { error: deleteError } = await supabaseAdmin.rpc(
    "delete_plaid_secret",
    { secret_name: conn.vault_secret_name }
  );

  if (deleteError) throw deleteError;
}
