import { z } from "zod";
import { RemindersDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";
import {
  CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR,
  isCalendarEventReminder,
} from "@/lib/reminders/lifecycle-policy";

const lifecycleConflict = { error: CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR };

export function reminderTools(): ToolDefinition[] {
  return [
    {
      name: "getUpcomingReminders",
      description: "Get pending reminders that haven't been sent yet",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        // Security: filter by userId since getPendingReminders is unscoped (designed for cron dispatcher)
        const tomorrow = new Date(ctx.date + "T23:59:59");
        tomorrow.setDate(tomorrow.getDate() + 1);
        const all = await db.getPendingReminders(tomorrow.toISOString());
        return all.filter((r) => r.user_id === ctx.userId);
      },
    },
    {
      name: "createReminder",
      description:
        "Create a reminder linked to an existing task or habit. Calendar reminders are edited with updateEvent.",
      parameters: z.object({
        sourceType: z
          .enum(["task", "habit"])
          .describe("Type of item this reminder is for"),
        sourceId: z.string().describe("ID of the task, event, or habit"),
        fireAt: z
          .string()
          .describe(
            "When to fire the reminder (ISO datetime, e.g., 2026-04-10T09:00:00)",
          ),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        return db.createReminder(ctx.userId, {
          source_type: params.sourceType,
          source_id: params.sourceId,
          reminder_type: "absolute",
          relative_minutes: null,
          absolute_time: params.fireAt,
          channels: ["push"],
          fire_at: params.fireAt,
        });
      },
    },
    {
      name: "dismissReminder",
      description: "Dismiss a reminder or snooze it to a later time",
      parameters: z.object({
        reminderId: z.string().describe("The reminder ID"),
        snoozeUntil: z
          .string()
          .datetime()
          .optional()
          .describe(
            "If provided, snooze until this ISO datetime instead of dismissing",
          ),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        const reminder = await db.getReminder(ctx.userId, params.reminderId);
        if (!reminder) return { error: "Reminder not found" };
        if (isCalendarEventReminder(reminder.source_type)) {
          return db.transitionCalendarEventReminder(
            ctx.userId,
            params.reminderId,
            params.snoozeUntil
              ? { status: "pending", fire_at: params.snoozeUntil }
              : { status: "sent" },
          );
        }
        if (params.snoozeUntil) {
          return db.updateReminder(ctx.userId, params.reminderId, {
            status: "pending",
            fire_at: params.snoozeUntil,
          });
        }
        // Schema has no "dismissed" status — "sent" is the terminal state
        // that marks a reminder as no longer pending.
        return db.updateReminderStatus(
          ctx.userId,
          params.reminderId,
          "sent",
        );
      },
    },
    {
      name: "deleteReminder",
      description: "Delete a reminder permanently",
      parameters: z.object({
        reminderId: z.string().describe("The reminder ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        const reminder = await db.getReminder(ctx.userId, params.reminderId);
        if (!reminder) return { error: "Reminder not found" };
        if (isCalendarEventReminder(reminder.source_type)) {
          return lifecycleConflict;
        }
        await db.deleteReminder(ctx.userId, params.reminderId);
        return { success: true };
      },
    },
  ];
}
