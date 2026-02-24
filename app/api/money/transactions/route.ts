import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, MoneyAccountsDB } from "@/lib/db";
import { manualTransactionSchema } from "@/lib/validations/plaid";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { Transaction, ViewMode } from "@/lib/db/types";

/**
 * Redact transaction details for household view.
 * LOCKED DECISION: In shared views, partners see transactions as category + amount only.
 * Strips: description, merchant_name, notes, plaid_category_detailed.
 * Keeps: id, account_id, amount_cents, category, category_id, transaction_date, is_pending.
 */
function redactForHousehold(tx: Transaction): Partial<Transaction> {
  return {
    id: tx.id,
    household_id: tx.household_id,
    account_id: tx.account_id,
    amount_cents: tx.amount_cents,
    description: "", // redacted
    merchant_name: null, // redacted
    category: tx.category,
    category_id: tx.category_id,
    notes: null, // redacted
    transaction_date: tx.transaction_date,
    is_pending: tx.is_pending,
    is_hidden_from_household: tx.is_hidden_from_household,
    is_shared_to_household: tx.is_shared_to_household,
    plaid_transaction_id: tx.plaid_transaction_id,
    plaid_category_primary: tx.plaid_category_primary,
    plaid_category_detailed: null, // redacted
    source: tx.source,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
  };
}

/**
 * GET /api/money/transactions
 * List transactions for the authenticated user's household.
 * Supports optional filters: account_id, date_from, date_to, category, search.
 * Supports ?view=mine|household for view-mode filtering (default: 'mine').
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const transactionsDB = new TransactionsDB(supabase);

    const searchParams = request.nextUrl.searchParams;
    const view = (searchParams.get("view") || "mine") as ViewMode;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : undefined;

    const queryOptions = {
      accountId: searchParams.get("account_id") || undefined,
      dateFrom: searchParams.get("date_from") || undefined,
      dateTo: searchParams.get("date_to") || undefined,
      category: searchParams.get("category") || undefined,
      categoryId: searchParams.get("category_id") || undefined,
      search: searchParams.get("search") || undefined,
      amountMin: searchParams.get("amount_min")
        ? parseInt(searchParams.get("amount_min")!, 10)
        : undefined,
      amountMax: searchParams.get("amount_max")
        ? parseInt(searchParams.get("amount_max")!, 10)
        : undefined,
      limit,
      offset,
    };

    // Use filtered query for view-mode support
    const { transactions, total } =
      await transactionsDB.getByHouseholdFiltered(
        householdId,
        user.id,
        view,
        queryOptions
      );

    // Redact transaction details in household view
    const result =
      view === "household"
        ? transactions.map(redactForHousehold)
        : transactions;

    const effectiveOffset = offset ?? 0;
    return NextResponse.json({
      transactions: result,
      total,
      hasMore: effectiveOffset + transactions.length < total,
    });
  } catch (error) {
    log.error("GET /api/money/transactions error", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/transactions
 * Create a manual transaction entry.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = manualTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const accountsDB = new MoneyAccountsDB(supabase);
    const transactionsDB = new TransactionsDB(supabase);

    // Resolve account ID — auto-create Cash account if "cash" is selected
    let accountId = parsed.data.account_id;
    if (accountId === "cash") {
      const cashAccount = await accountsDB.findOrCreateCash(householdId);
      accountId = cashAccount.id;
    } else {
      // Verify account belongs to user's household
      const account = await accountsDB.getById(accountId);
      if (!account || account.household_id !== householdId) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }
    }

    const transaction = await transactionsDB.create({
      household_id: householdId,
      account_id: accountId,
      amount_cents: toCents(parsed.data.amount),
      description: parsed.data.description,
      merchant_name: null,
      category: parsed.data.category || null,
      category_id: null,
      notes: null,
      transaction_date: parsed.data.transaction_date,
      is_pending: false,
      plaid_transaction_id: null,
      plaid_category_primary: null,
      plaid_category_detailed: null,
      source: "manual",
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/transactions error", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
