import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, MoneyAccountsDB } from "@/lib/db";
import { manualTransactionSchema } from "@/lib/validations/plaid";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";

/**
 * GET /api/money/transactions
 * List transactions for the authenticated user's household.
 * Supports optional filters: account_id, date_from, date_to, category, search.
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
    const transactions = await transactionsDB.getByHousehold(householdId, {
      accountId: searchParams.get("account_id") || undefined,
      dateFrom: searchParams.get("date_from") || undefined,
      dateTo: searchParams.get("date_to") || undefined,
      category: searchParams.get("category") || undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!, 10)
        : undefined,
      offset: searchParams.get("offset")
        ? parseInt(searchParams.get("offset")!, 10)
        : undefined,
    });

    return NextResponse.json({ transactions });
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

    // Verify account belongs to user's household
    const account = await accountsDB.getById(parsed.data.account_id);
    if (!account || account.household_id !== householdId) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const transaction = await transactionsDB.create({
      household_id: householdId,
      account_id: parsed.data.account_id,
      amount_cents: toCents(parsed.data.amount),
      description: parsed.data.description,
      merchant_name: null,
      category: parsed.data.category || null,
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
