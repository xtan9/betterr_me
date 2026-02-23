import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { RecurringBillsDB } from "@/lib/db";
import { billCreateSchema } from "@/lib/validations/bills";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { RecurringBill } from "@/lib/db/types";

/**
 * Frequency multipliers to normalize any bill frequency to monthly cost.
 * WEEKLY * ~4.33, BIWEEKLY * ~2.17, SEMI_MONTHLY * 2, MONTHLY * 1, ANNUALLY / 12
 */
const MONTHLY_MULTIPLIER: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
  ANNUALLY: 1 / 12,
};

/**
 * Compute summary stats from bills array.
 */
function computeSummary(bills: RecurringBill[]) {
  let totalMonthlyCents = 0;
  let billCount = 0;
  let pendingCount = 0;

  for (const bill of bills) {
    if (bill.user_status !== "dismissed" && bill.is_active) {
      const multiplier = MONTHLY_MULTIPLIER[bill.frequency] ?? 1;
      // Bills are stored as negative cents (expenses), use Math.abs for monthly total
      totalMonthlyCents += Math.abs(bill.amount_cents) * multiplier;
      billCount++;
    }
    if (bill.user_status === "auto") {
      pendingCount++;
    }
  }

  return {
    total_monthly_cents: Math.round(totalMonthlyCents),
    bill_count: billCount,
    pending_count: pendingCount,
  };
}

/**
 * GET /api/money/bills
 * Get all recurring bills for the household with summary stats.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const billsDB = new RecurringBillsDB(supabase);

    const bills = await billsDB.getByHousehold(householdId);
    const summary = computeSummary(bills);

    return NextResponse.json({ bills, summary });
  } catch (error) {
    log.error("GET /api/money/bills error", error);
    return NextResponse.json(
      { error: "Failed to fetch bills" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/bills
 * Create a new manual recurring bill.
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
    const parsed = billCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const billsDB = new RecurringBillsDB(supabase);

    // Convert dollar amount to negative cents (bills are expenses)
    const amountCents = toCents(-parsed.data.amount);

    const bill = await billsDB.create({
      household_id: householdId,
      name: parsed.data.name,
      description: null,
      amount_cents: amountCents,
      frequency: parsed.data.frequency,
      next_due_date: parsed.data.next_due_date ?? null,
      source: "manual",
      user_status: "confirmed",
      is_active: true,
      plaid_stream_id: null,
      account_id: null,
      plaid_status: null,
      category_primary: null,
      previous_amount_cents: null,
    });

    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/bills error", error);
    return NextResponse.json(
      { error: "Failed to create bill" },
      { status: 500 }
    );
  }
}
