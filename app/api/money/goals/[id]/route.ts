import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { SavingsGoalsDB } from "@/lib/db";
import { goalUpdateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import { addMonths, differenceInDays } from "date-fns";
import type { SavingsGoal, GoalContribution } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Projection helpers (same as goals/route.ts)
// ---------------------------------------------------------------------------

type StatusColor = "green" | "yellow" | "red";

interface GoalWithProjection extends SavingsGoal {
  projected_date: string | null;
  monthly_rate_cents: number;
  status_color: StatusColor;
}

function computeMonthlyRate(contributions: GoalContribution[]): number {
  if (contributions.length === 0) return 0;

  const now = new Date();
  const threeMonthsAgo = addMonths(now, -3);

  const recentContribs = contributions.filter(
    (c) => new Date(c.contributed_at) >= threeMonthsAgo
  );

  if (recentContribs.length === 0) return 0;

  const totalCents = recentContribs.reduce((sum, c) => sum + c.amount_cents, 0);
  const earliest = new Date(
    Math.min(...recentContribs.map((c) => new Date(c.contributed_at).getTime()))
  );
  const monthsWithData = Math.max(
    1,
    (now.getTime() - earliest.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  );

  return Math.round(totalCents / monthsWithData);
}

function getStatusColor(
  projectedDate: Date | null,
  deadline: string | null
): StatusColor {
  if (!deadline) return "green";
  if (!projectedDate) return "yellow";

  const deadlineDate = new Date(deadline);
  const daysLate = differenceInDays(projectedDate, deadlineDate);
  if (daysLate <= 0) return "green";
  if (daysLate <= 30) return "yellow";
  return "red";
}

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
// GET /api/money/goals/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/money/goals/[id]
 * Get a single goal with projection data.
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
    const householdId = await resolveHousehold(supabase, user.id);

    // Fetch goal and verify ownership
    const { data: goal, error: goalError } = await supabase
      .from("savings_goals")
      .select("*")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (goalError) {
      if (goalError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Goal not found" },
          { status: 404 }
        );
      }
      throw goalError;
    }

    const goalsDB = new SavingsGoalsDB(supabase);
    const contributions = await goalsDB.getContributions(id);
    const goalWithProjection = computeProjection(goal, contributions);

    return NextResponse.json({ goal: goalWithProjection });
  } catch (error) {
    log.error("GET /api/money/goals/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch goal" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/money/goals/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/money/goals/[id]
 * Update a savings goal.
 * Owner-only: only the goal creator can edit (shared goals are read-only for non-creators).
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
    const parsed = goalUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify ownership and check creator
    const { data: goalData, error: lookupError } = await supabase
      .from("savings_goals")
      .select("id, owner_id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Goal not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    // Owner-only write protection
    if (goalData.owner_id && goalData.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the goal creator can edit shared goals" },
        { status: 403 }
      );
    }

    const goalsDB = new SavingsGoalsDB(supabase);

    // Build update payload, converting amounts if present
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.target_amount !== undefined)
      updates.target_cents = toCents(parsed.data.target_amount);
    if (parsed.data.deadline !== undefined) updates.deadline = parsed.data.deadline;
    if (parsed.data.funding_type !== undefined)
      updates.funding_type = parsed.data.funding_type;
    if (parsed.data.linked_account_id !== undefined)
      updates.linked_account_id = parsed.data.linked_account_id;
    if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;
    if (parsed.data.color !== undefined) updates.color = parsed.data.color;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const goal = await goalsDB.update(id, updates);

    return NextResponse.json({ goal });
  } catch (error) {
    log.error("PATCH /api/money/goals/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/money/goals/[id]
// ---------------------------------------------------------------------------

/**
 * DELETE /api/money/goals/[id]
 * Delete a savings goal (cascades to contributions).
 * Owner-only: only the goal creator can delete.
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
    const householdId = await resolveHousehold(supabase, user.id);

    // Verify ownership and check creator
    const { data: goalData, error: lookupError } = await supabase
      .from("savings_goals")
      .select("id, owner_id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Goal not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    // Owner-only write protection
    if (goalData.owner_id && goalData.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the goal creator can delete shared goals" },
        { status: 403 }
      );
    }

    const goalsDB = new SavingsGoalsDB(supabase);
    await goalsDB.delete(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/money/goals/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}
