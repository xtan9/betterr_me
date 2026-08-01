import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RemindersDB } from "@/lib/db";
import { reminderUpdateSchema } from "@/lib/validations/reminders";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";
import {
  createTaskWrites,
  type TaskReminderInput,
} from "@/lib/tasks/writes";
import { taskReminderConfigurationResponse } from "@/lib/reminders/task-configuration-response";
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

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, reminderUpdateSchema);
    if (!validation.success) return validation.response;

    const remindersDB = new RemindersDB(supabase);
    const existing = await remindersDB.getReminder(userId, id);
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
        userId,
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

    if (existing.source_type === "task" && validation.data.channels !== undefined) {
      const updateKeys = Object.keys(validation.data);
      if (updateKeys.some((key) => ["status", "fire_at", "sent_at"].includes(key))) {
        return NextResponse.json(
          { error: "Task reminder configuration cannot be combined with delivery updates" },
          { status: 400 },
        );
      }
      const reminder = toTaskReminderInput(existing, validation.data.channels);
      if (!reminder) {
        return NextResponse.json(
          { error: "Stored Task reminder configuration is invalid" },
          { status: 500 },
        );
      }
      const outcome = await createTaskWrites(supabase).configureReminders({
        userId,
        taskId: existing.source_id,
        reminders: [reminder],
      });
      return taskReminderConfigurationResponse(outcome);
    }

    // Status, fire_at, and sent_at are Reminder Delivery transitions. They
    // remain on the delivery persistence path and do not alter Task intent.
    const reminder = await remindersDB.updateReminder(
      userId,
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const remindersDB = new RemindersDB(supabase);
    const existing = await remindersDB.getReminder(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }
    if (isCalendarEventReminder(existing.source_type)) {
      return lifecycleConflict();
    }
    if (existing.source_type === "task") {
      const outcome = await createTaskWrites(supabase).configureReminders({
        userId,
        taskId: existing.source_id,
        reminders: [],
      });
      return taskReminderConfigurationResponse(outcome);
    }
    await remindersDB.deleteReminder(userId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/reminders/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}

function toTaskReminderInput(
  reminder: {
    reminder_type: "relative" | "absolute";
    relative_minutes: number | null;
    absolute_time: string | null;
  },
  channels: readonly ("push" | "email")[],
): TaskReminderInput | null {
  if (reminder.reminder_type === "relative") {
    if (reminder.relative_minutes === null) return null;
    return {
      reminderType: "relative",
      relativeMinutes: reminder.relative_minutes,
      channels,
    };
  }
  if (reminder.absolute_time === null) return null;
  return {
    reminderType: "absolute",
    absoluteTime: reminder.absolute_time,
    channels,
  };
}
