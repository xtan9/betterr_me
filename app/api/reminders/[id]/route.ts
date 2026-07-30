import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RemindersDB } from "@/lib/db";
import { reminderUpdateSchema } from "@/lib/validations/reminders";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";
import {
  CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR,
  isCalendarEventReminder,
} from "@/lib/reminders/lifecycle-policy";

function lifecycleConflict() {
  return NextResponse.json(
    { error: CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR },
    { status: 409 },
  );
}

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
    const existing = await remindersDB.getReminder(user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }
    if (isCalendarEventReminder(existing.source_type)) {
      const update = validation.data;
      const keys = Object.keys(update);
      if (
        (update.status === "pending" || update.status === "snoozed") &&
        update.sent_at !== undefined &&
        update.sent_at !== null
      ) {
        return NextResponse.json(
          { error: "A snoozed reminder cannot set sent_at" },
          { status: 400 },
        );
      }
      const isTerminalTransition =
        (update.status === "sent" || update.status === "failed") &&
        keys.every((key) => ["status", "sent_at"].includes(key));
      const isSnoozeTransition =
        update.status === "pending" &&
        typeof update.fire_at === "string" &&
        keys.every((key) => ["status", "fire_at", "sent_at"].includes(key));
      const isLegacySnoozeTransition =
        update.status === "snoozed" &&
        keys.every((key) => ["status", "sent_at"].includes(key));
      if (!isTerminalTransition && !isSnoozeTransition && !isLegacySnoozeTransition) {
        return lifecycleConflict();
      }
      const reminder = await remindersDB.transitionCalendarEventReminder(
        user.id,
        id,
        isSnoozeTransition
          ? { status: "pending", fire_at: update.fire_at, sent_at: update.sent_at }
          : {
              status: update.status as "sent" | "failed" | "snoozed",
              sent_at: update.sent_at,
            },
      );
      return NextResponse.json({ reminder });
    }
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
    const existing = await remindersDB.getReminder(user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }
    if (isCalendarEventReminder(existing.source_type)) {
      return lifecycleConflict();
    }
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
