import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { BudgetsDB } from "@/lib/db";
import { budgetUpdateSchema } from "@/lib/validations/budget";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";

/**
 * GET /api/money/budgets/[id]
 * Get a budget by ID with category spending data.
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
    const budgetsDB = new BudgetsDB(supabase);

    // Look up the budget to get its month, then use getByMonth for full data
    const { data: budgetRow, error: lookupError } = await supabase
      .from("budgets")
      .select("month")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Budget not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    const budget = await budgetsDB.getByMonth(householdId, budgetRow.month);

    return NextResponse.json({ budget });
  } catch (error) {
    log.error("GET /api/money/budgets/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch budget" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/money/budgets/[id]
 * Update a budget's total, rollover setting, and/or category allocations.
 * Owner-only: only the budget creator can edit (shared budgets are read-only for non-creators).
 */
export async function PUT(
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
    const parsed = budgetUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify budget belongs to this household and check ownership
    const { data: budgetData, error: lookupError } = await supabase
      .from("budgets")
      .select("id, owner_id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Budget not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    // Owner-only write protection
    if (budgetData.owner_id && budgetData.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the budget creator can edit shared budgets" },
        { status: 403 }
      );
    }

    const budgetsDB = new BudgetsDB(supabase);

    // Build update fields
    const updates: { total_cents?: number; rollover_enabled?: boolean } = {};
    if (parsed.data.total !== undefined) {
      updates.total_cents = toCents(parsed.data.total);
    }
    if (parsed.data.rollover_enabled !== undefined) {
      updates.rollover_enabled = parsed.data.rollover_enabled;
    }

    // Convert category amounts to cents if provided
    const categories = parsed.data.categories?.map((c) => ({
      category_id: c.category_id,
      allocated_cents: toCents(c.amount),
    }));

    const budget = await budgetsDB.update(id, updates, categories);

    return NextResponse.json({ budget });
  } catch (error) {
    log.error("PUT /api/money/budgets/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/money/budgets/[id]
 * Delete a budget and its category allocations.
 * Owner-only: only the budget creator can delete.
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

    // Verify budget belongs to this household and check ownership
    const { data: budgetData, error: lookupError } = await supabase
      .from("budgets")
      .select("id, owner_id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Budget not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    // Owner-only write protection
    if (budgetData.owner_id && budgetData.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the budget creator can delete shared budgets" },
        { status: 403 }
      );
    }

    const budgetsDB = new BudgetsDB(supabase);
    await budgetsDB.delete(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/money/budgets/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}
