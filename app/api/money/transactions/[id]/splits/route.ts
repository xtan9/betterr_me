import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, TransactionSplitsDB } from "@/lib/db";
import { transactionSplitSchema } from "@/lib/validations/money";
import { log } from "@/lib/logger";

/**
 * GET /api/money/transactions/[id]/splits
 * Get all splits for a transaction.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await resolveHousehold(supabase, user.id);
    const splitsDB = new TransactionSplitsDB(supabase);
    const splits = await splitsDB.getByTransaction(id);

    return NextResponse.json({ splits });
  } catch (error) {
    log.error("GET /api/money/transactions/[id]/splits error", error);
    return NextResponse.json(
      { error: "Failed to fetch splits" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/transactions/[id]/splits
 * Create splits for a transaction. Validates that split amounts sum to the transaction total.
 * Replaces any existing splits (delete + re-create).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = transactionSplitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await resolveHousehold(supabase, user.id);

    // Verify transaction exists
    const transactionsDB = new TransactionsDB(supabase);
    const transaction = await transactionsDB.getById(id);

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Validate split amounts sum to transaction total
    const splitTotal = parsed.data.splits.reduce(
      (sum, s) => sum + s.amount_cents,
      0
    );

    if (Math.abs(splitTotal) !== Math.abs(transaction.amount_cents)) {
      return NextResponse.json(
        { error: "Split amounts must equal transaction total" },
        { status: 400 }
      );
    }

    const splitsDB = new TransactionSplitsDB(supabase);

    // Delete existing splits and create new ones
    await splitsDB.deleteByTransaction(id);
    const splits = await splitsDB.create(
      parsed.data.splits.map((s) => ({
        category_id: s.category_id,
        amount_cents: s.amount_cents,
        notes: s.notes ?? null,
        transaction_id: id,
      }))
    );

    return NextResponse.json({ splits }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/transactions/[id]/splits error", error);
    return NextResponse.json(
      { error: "Failed to create splits" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/money/transactions/[id]/splits
 * Delete all splits for a transaction.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await resolveHousehold(supabase, user.id);
    const splitsDB = new TransactionSplitsDB(supabase);
    await splitsDB.deleteByTransaction(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/money/transactions/[id]/splits error", error);
    return NextResponse.json(
      { error: "Failed to delete splits" },
      { status: 500 }
    );
  }
}
