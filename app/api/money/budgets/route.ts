import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { BudgetsDB } from "@/lib/db";
import { budgetCreateSchema } from "@/lib/validations/budget";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { ViewMode } from "@/lib/db/types";

/**
 * GET /api/money/budgets?month=YYYY-MM&view=mine|household
 * Get budget for a specific month with category spending data.
 * - view=mine: budget where owner_id = userId AND is_shared = false
 * - view=household: budget where is_shared = true
 * Default: 'mine' for backward compatibility.
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
    const budgetsDB = new BudgetsDB(supabase);

    const month = request.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month query param required (YYYY-MM format)" },
        { status: 400 }
      );
    }

    const view = (request.nextUrl.searchParams.get("view") || "mine") as ViewMode;

    // Convert YYYY-MM to YYYY-MM-01 for DB query
    const monthDate = `${month}-01`;
    const budget = await budgetsDB.getByMonthFiltered(
      householdId,
      user.id,
      view,
      monthDate
    );

    return NextResponse.json({ budget });
  } catch (error) {
    log.error("GET /api/money/budgets error", error);
    return NextResponse.json(
      { error: "Failed to fetch budget" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/budgets
 * Create a new budget for a month.
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
    const parsed = budgetCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const budgetsDB = new BudgetsDB(supabase);

    // Convert dollar amounts to cents
    const totalCents = toCents(parsed.data.total);
    const categoryRows = parsed.data.categories.map((c) => ({
      category_id: c.category_id,
      allocated_cents: toCents(c.amount),
    }));

    const budget = await budgetsDB.create(
      {
        household_id: householdId,
        month: parsed.data.month,
        total_cents: totalCents,
        rollover_enabled: parsed.data.rollover_enabled,
      },
      categoryRows
    );

    return NextResponse.json({ budget }, { status: 201 });
  } catch (error) {
    // Handle UNIQUE constraint violation (budget already exists for this month)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "A budget already exists for this month" },
        { status: 409 }
      );
    }

    log.error("POST /api/money/budgets error", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 }
    );
  }
}
