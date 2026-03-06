import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { SavingsGoalsDB } from "@/lib/db";
import { contributionCreateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/money/goals/[id]/contributions
// ---------------------------------------------------------------------------

/**
 * GET /api/money/goals/[id]/contributions
 * List all contributions for a goal.
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

    // Verify goal belongs to household
    const { error: lookupError } = await supabase
      .from("savings_goals")
      .select("id")
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

    const goalsDB = new SavingsGoalsDB(supabase);
    const contributions = await goalsDB.getContributions(id);

    return NextResponse.json({ contributions });
  } catch (error) {
    log.error("GET /api/money/goals/[id]/contributions error", error);
    return NextResponse.json(
      { error: "Failed to fetch contributions" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/money/goals/[id]/contributions
// ---------------------------------------------------------------------------

/**
 * POST /api/money/goals/[id]/contributions
 * Add a contribution to a savings goal.
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
    const parsed = contributionCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify goal belongs to household
    const { error: lookupError } = await supabase
      .from("savings_goals")
      .select("id")
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

    const goalsDB = new SavingsGoalsDB(supabase);
    const amountCents = toCents(parsed.data.amount);
    const contribution = await goalsDB.addContribution(
      id,
      amountCents,
      parsed.data.note
    );

    return NextResponse.json({ contribution }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/goals/[id]/contributions error", error);
    return NextResponse.json(
      { error: "Failed to add contribution" },
      { status: 500 }
    );
  }
}
