import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RemindersDB } from "@/lib/db";
import { reminderUpdateSchema } from "@/lib/validations/reminders";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";

/**
 * PATCH /api/reminders/[id]
 * Update a reminder's status, fire_at, channels, or sent_at.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, reminderUpdateSchema);
    if (!validation.success) return validation.response;

    const remindersDB = new RemindersDB(supabase);
    const reminder = await remindersDB.updateReminder(
      user.id,
      id,
      validation.data
    );

    return NextResponse.json({ reminder });
  } catch (error) {
    log.error("PATCH /api/reminders/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reminders/[id]
 * Delete a single reminder by ID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const remindersDB = new RemindersDB(supabase);
    await remindersDB.deleteReminder(user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/reminders/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
