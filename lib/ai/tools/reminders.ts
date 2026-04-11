import { z } from "zod";
import { RemindersDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function reminderTools(): ToolDefinition[] {
  return [
    {
      name: "getUpcomingReminders",
      description: "Get pending reminders that haven't been sent yet",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        const tomorrow = new Date(ctx.date + "T23:59:59");
        tomorrow.setDate(tomorrow.getDate() + 1);
        const all = await db.getPendingReminders(tomorrow.toISOString());
        return all.filter((r) => r.user_id === ctx.userId);
      },
    },
    {
      name: "createReminder",
      description: "Create a standalone reminder at a specific date and time",
      parameters: z.object({
        title: z.string().describe("Reminder title/message"),
        fireAt: z
          .string()
          .describe(
            "When to fire the reminder (ISO datetime, e.g., 2026-04-10T09:00:00)",
          ),
        sourceType: z
          .enum(["calendar_event", "task", "habit", "bill"])
          .optional()
          .describe("What this reminder is for"),
        sourceId: z
          .string()
          .optional()
          .describe("ID of the related item"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        return db.createReminder(ctx.userId, {
          source_type: params.sourceType ?? "task",
          source_id: params.sourceId ?? "",
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
          .optional()
          .describe(
            "If provided, snooze until this ISO datetime instead of dismissing",
          ),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        if (params.snoozeUntil) {
          return db.updateReminder(ctx.userId, params.reminderId, {
            status: "pending",
            fire_at: params.snoozeUntil,
          });
        }
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
        await db.deleteReminder(ctx.userId, params.reminderId);
        return { success: true };
      },
    },
  ];
}
