import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB, TransactionSplitsDB } from "@/lib/db";
import { transactionUpdateSchema } from "@/lib/validations/money";
import { log } from "@/lib/logger";

/**
 * GET /api/money/transactions/[id]
 * Get a single transaction with its splits.
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
    const transactionsDB = new TransactionsDB(supabase);
    const transaction = await transactionsDB.getById(id);

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const splitsDB = new TransactionSplitsDB(supabase);
    const splits = await splitsDB.getByTransaction(id);

    return NextResponse.json({ transaction, splits });
  } catch (error) {
    log.error("GET /api/money/transactions/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/money/transactions/[id]
 * Update transaction fields (category_id, notes).
 */
export async function PATCH(
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
    const parsed = transactionUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await resolveHousehold(supabase, user.id);
    const transactionsDB = new TransactionsDB(supabase);
    const transaction = await transactionsDB.update(id, parsed.data);

    return NextResponse.json({ transaction });
  } catch (error) {
    log.error("PATCH /api/money/transactions/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}
