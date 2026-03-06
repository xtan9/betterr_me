import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { RecurringBillsDB } from "@/lib/db";
import { billUpdateSchema } from "@/lib/validations/bills";
import { toCents } from "@/lib/money/arithmetic";
import { log } from "@/lib/logger";
import type { RecurringBillUpdate } from "@/lib/db/types";

/**
 * PATCH /api/money/bills/[id]
 * Update a recurring bill (name, amount, frequency, next_due_date, user_status).
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
    const parsed = billUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify bill belongs to this household
    const { error: lookupError } = await supabase
      .from("recurring_bills")
      .select("id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Bill not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    const billsDB = new RecurringBillsDB(supabase);

    // Build update object
    const updates: RecurringBillUpdate = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.frequency !== undefined)
      updates.frequency = parsed.data.frequency;
    if (parsed.data.next_due_date !== undefined)
      updates.next_due_date = parsed.data.next_due_date;
    if (parsed.data.user_status !== undefined)
      updates.user_status = parsed.data.user_status;

    // Convert dollar amount to negative cents if provided
    if (parsed.data.amount !== undefined) {
      updates.amount_cents = toCents(-parsed.data.amount);
    }

    const bill = await billsDB.update(id, updates);

    return NextResponse.json({ bill });
  } catch (error) {
    log.error("PATCH /api/money/bills/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update bill" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/money/bills/[id]
 * Delete a recurring bill.
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

    // Verify bill belongs to this household
    const { error: lookupError } = await supabase
      .from("recurring_bills")
      .select("id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Bill not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    const billsDB = new RecurringBillsDB(supabase);
    await billsDB.delete(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/money/bills/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete bill" },
      { status: 500 }
    );
  }
}
