import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { BudgetsDB } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * POST /api/money/budgets/[id]/rollover
 * Confirm rollover from the budget identified by [id] (source/previous month)
 * to the next month's budget (target).
 *
 * Computes rollover amounts per category from the source budget and writes
 * rollover_cents to the target budget's matching categories.
 *
 * Requires: The target (next month) budget must already exist.
 */
export async function POST(
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

    const { id: fromBudgetId } = await params;

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify source budget belongs to this household and get its month
    const { data: sourceBudget, error: lookupError } = await supabase
      .from("budgets")
      .select("id, month, household_id, rollover_enabled")
      .eq("id", fromBudgetId)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Source budget not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    if (!sourceBudget.rollover_enabled) {
      return NextResponse.json(
        { error: "Rollover is not enabled for this budget" },
        { status: 400 }
      );
    }

    // Compute next month from source budget's month
    const sourceDate = new Date(sourceBudget.month + "T00:00:00");
    const nextMonth = new Date(
      sourceDate.getFullYear(),
      sourceDate.getMonth() + 1,
      1
    );
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    // Find the target budget (next month)
    const { data: targetBudget, error: targetError } = await supabase
      .from("budgets")
      .select("id")
      .eq("household_id", householdId)
      .eq("month", nextMonthStr)
      .single();

    if (targetError) {
      if (targetError.code === "PGRST116") {
        return NextResponse.json(
          {
            error:
              "Target budget for next month does not exist. Create it first.",
          },
          { status: 400 }
        );
      }
      throw targetError;
    }

    const budgetsDB = new BudgetsDB(supabase);

    // Compute rollover amounts from the source budget
    const rollovers = await budgetsDB.computeRollover(
      fromBudgetId,
      householdId
    );

    // Write rollover amounts to the target budget's categories
    await budgetsDB.confirmRollover(
      fromBudgetId,
      targetBudget.id,
      rollovers
    );

    return NextResponse.json({ rollovers });
  } catch (error) {
    log.error("POST /api/money/budgets/[id]/rollover error", error);
    return NextResponse.json(
      { error: "Failed to confirm rollover" },
      { status: 500 }
    );
  }
}
