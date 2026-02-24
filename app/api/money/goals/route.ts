import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { SavingsGoalsDB } from "@/lib/db";
import { goalCreateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import { addMonths, differenceInDays } from "date-fns";
import type { SavingsGoal, GoalContribution, ViewMode } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

type StatusColor = "green" | "yellow" | "red";

interface GoalWithProjection extends SavingsGoal {
  projected_date: string | null;
  monthly_rate_cents: number;
  status_color: StatusColor;
}

/**
 * Compute monthly savings rate from contributions over the last 3 months.
 * Returns 0 when there is no data.
 */
function computeMonthlyRate(contributions: GoalContribution[]): number {
  if (contributions.length === 0) return 0;

  const now = new Date();
  const threeMonthsAgo = addMonths(now, -3);

  const recentContribs = contributions.filter(
    (c) => new Date(c.contributed_at) >= threeMonthsAgo
  );

  if (recentContribs.length === 0) return 0;

  const totalCents = recentContribs.reduce((sum, c) => sum + c.amount_cents, 0);

  // Find the earliest contribution in the window to determine actual months of data
  const earliest = new Date(
    Math.min(...recentContribs.map((c) => new Date(c.contributed_at).getTime()))
  );
  const monthsWithData = Math.max(
    1,
    (now.getTime() - earliest.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  );

  return Math.round(totalCents / monthsWithData);
}

/**
 * Determine status color based on projected date vs deadline.
 * green = on track, yellow = slightly behind, red = significantly behind.
 */
function getStatusColor(
  projectedDate: Date | null,
  deadline: string | null
): StatusColor {
  if (!deadline) return "green"; // No deadline means always on track
  if (!projectedDate) return "yellow"; // Can't project, slightly behind

  const deadlineDate = new Date(deadline);
  const daysLate = differenceInDays(projectedDate, deadlineDate);
  if (daysLate <= 0) return "green";
  if (daysLate <= 30) return "yellow";
  return "red";
}

/**
 * Add projection data to a single goal.
 */
function computeProjection(
  goal: SavingsGoal,
  contributions: GoalContribution[]
): GoalWithProjection {
  const monthlyRate = computeMonthlyRate(contributions);

  let projectedDate: Date | null = null;

  if (monthlyRate > 0 && goal.current_cents < goal.target_cents) {
    const remaining = goal.target_cents - goal.current_cents;
    const monthsToGo = remaining / monthlyRate;
    projectedDate = addMonths(new Date(), Math.ceil(monthsToGo));
  } else if (goal.current_cents >= goal.target_cents) {
    // Goal already reached
    projectedDate = new Date();
  }

  return {
    ...goal,
    projected_date: projectedDate ? projectedDate.toISOString().split("T")[0] : null,
    monthly_rate_cents: monthlyRate,
    status_color: getStatusColor(projectedDate, goal.deadline),
  };
}

// ---------------------------------------------------------------------------
// GET /api/money/goals
// ---------------------------------------------------------------------------

/**
 * GET /api/money/goals
 * List goals for the household with projection data.
 * Supports ?view=mine|household (default: 'mine').
 * - view=mine: goals where owner_id = userId AND is_shared = false
 * - view=household: goals where is_shared = true
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
    const goalsDB = new SavingsGoalsDB(supabase);

    const view = (request.nextUrl.searchParams.get("view") || "mine") as ViewMode;
    const goals = await goalsDB.getByHouseholdFiltered(
      householdId,
      user.id,
      view
    );

    // Fetch contributions for all goals to compute projections
    const goalsWithProjections: GoalWithProjection[] = await Promise.all(
      goals.map(async (goal) => {
        const contributions = await goalsDB.getContributions(goal.id);
        return computeProjection(goal, contributions);
      })
    );

    return NextResponse.json({ goals: goalsWithProjections });
  } catch (error) {
    log.error("GET /api/money/goals error", error);
    return NextResponse.json(
      { error: "Failed to fetch goals" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/money/goals
// ---------------------------------------------------------------------------

/**
 * POST /api/money/goals
 * Create a new savings goal.
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
    const parsed = goalCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const goalsDB = new SavingsGoalsDB(supabase);

    const goal = await goalsDB.create({
      household_id: householdId,
      name: parsed.data.name,
      target_cents: toCents(parsed.data.target_amount),
      current_cents: 0,
      deadline: parsed.data.deadline ?? null,
      funding_type: parsed.data.funding_type,
      linked_account_id: parsed.data.linked_account_id ?? null,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color ?? null,
      status: "active",
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/goals error", error);
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
