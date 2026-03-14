import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { SavingsGoalsDB } from "@/lib/db";
import { goalCreateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import { computeProjection } from "@/lib/money/goal-projections";
import type { GoalWithProjection } from "@/lib/money/goal-projections";

// ---------------------------------------------------------------------------
// GET /api/money/goals
// ---------------------------------------------------------------------------

/**
 * GET /api/money/goals
 * List all goals for the household with projection data.
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
    const goalsDB = new SavingsGoalsDB(supabase);

    const goals = await goalsDB.getByHousehold(householdId);

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
