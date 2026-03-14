import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, MoneyAccountsDB } from "@/lib/db";
import { csvImportSchema } from "@/lib/validations/csv-import";
import { toCents } from "@/lib/money/arithmetic";
import { detectDuplicates } from "@/lib/money/csv-import";
import { log } from "@/lib/logger";
import type { TransactionInsert } from "@/lib/db/types";

/**
 * POST /api/money/transactions/import
 * Batch import transactions from CSV data.
 *
 * Accepts: { account_id, rows, skip_duplicates }
 * Returns: { imported, duplicates_skipped, total_rows }
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
    const parsed = csvImportSchema.safeParse(body);

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
    let resolvedAccountId = parsed.data.account_id;
    if (resolvedAccountId === "cash") {
      const cashAccount = await accountsDB.findOrCreateCash(householdId);
      resolvedAccountId = cashAccount.id;
    } else {
      // Verify account belongs to user's household
      const account = await accountsDB.getById(resolvedAccountId);
      if (!account || account.household_id !== householdId) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }
    }

    const { rows, skip_duplicates } = parsed.data;
    let rowsToInsert = rows;
    let skippedCount = 0;

    // Duplicate detection
    if (skip_duplicates) {
      const { transactions: existing } =
        await transactionsDB.getByHousehold(householdId, { limit: 10000 });

      const duplicateIndices = detectDuplicates(
        rows.map((r) => ({
          date: r.transaction_date,
          amountCents: toCents(r.amount),
          description: r.description,
        })),
        existing.map((t) => ({
          transaction_date: t.transaction_date,
          amount_cents: t.amount_cents,
          description: t.description,
        }))
      );

      if (duplicateIndices.size > 0) {
        rowsToInsert = rows.filter((_, i) => !duplicateIndices.has(i));
        skippedCount = duplicateIndices.size;
      }
    }

    // Map validated rows to TransactionInsert[]
    const inserts: TransactionInsert[] = rowsToInsert.map((row) => ({
      household_id: householdId,
      account_id: resolvedAccountId,
      amount_cents: toCents(row.amount),
      description: row.description,
      merchant_name: row.merchant_name || null,
      category: row.category || null,
      category_id: null,
      notes: null,
      transaction_date: row.transaction_date,
      is_pending: false,
      plaid_transaction_id: null,
      plaid_category_primary: null,
      plaid_category_detailed: null,
      source: "manual" as const,
      is_hidden_from_household: false,
      is_shared_to_household: false,
    }));

    const insertedCount = await transactionsDB.createBatch(inserts);

    return NextResponse.json(
      {
        imported: insertedCount,
        duplicates_skipped: skippedCount,
        total_rows: rows.length,
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("POST /api/money/transactions/import error", error);
    return NextResponse.json(
      { error: "Failed to import transactions" },
      { status: 500 }
    );
  }
}
