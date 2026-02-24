import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, MoneyAccountsDB } from "@/lib/db";
import { transactionsToCsv } from "@/lib/money/csv-export";
import { exportTransactionsSchema } from "@/lib/validations/data-management";
import { log } from "@/lib/logger";

/**
 * GET /api/money/export
 * Export transactions as a downloadable CSV file.
 *
 * Query params:
 *   - date_from (optional, YYYY-MM-DD): start of date range
 *   - date_to (optional, YYYY-MM-DD): end of date range
 *
 * Returns text/csv with Content-Disposition attachment header.
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

    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams;
    const rawParams: Record<string, string> = {};
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    if (dateFrom) rawParams.date_from = dateFrom;
    if (dateTo) rawParams.date_to = dateTo;

    const parsed = exportTransactionsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Resolve household
    const householdId = await resolveHousehold(supabase, user.id);

    // Build account name map
    const accountsDB = new MoneyAccountsDB(supabase);
    const accounts = await accountsDB.getByHousehold(householdId);
    const accountNameMap: Record<string, string> = {};
    for (const a of accounts) {
      accountNameMap[a.id] = a.name || a.official_name || a.plaid_account_id || a.id;
    }

    // Fetch transactions (user's own, up to 10000)
    const transactionsDB = new TransactionsDB(supabase);
    const { transactions } = await transactionsDB.getByHouseholdFiltered(
      householdId,
      user.id,
      "mine",
      {
        dateFrom: parsed.data.date_from,
        dateTo: parsed.data.date_to,
        limit: 10000,
        offset: 0,
      }
    );

    // Generate CSV
    const csv = transactionsToCsv(transactions, accountNameMap);

    // Build filename with date range
    const fromLabel = parsed.data.date_from || "all";
    const toLabel = parsed.data.date_to || "all";
    const filename = `betterrme-transactions-${fromLabel}-to-${toLabel}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    log.error("GET /api/money/export error", error);
    return NextResponse.json(
      { error: "Failed to export" },
      { status: 500 }
    );
  }
}
