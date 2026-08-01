import { z } from "zod";
import { CalendarEventsDB } from "@/lib/db";
import { SchedulingLifecycle } from "@/lib/scheduling/lifecycle";
import {
  createSchedulingWrites,
  toCalendarEventResponse,
} from "@/lib/scheduling/writes";
import type { ToolDefinition, ToolContext } from "./types";

type AiEventReminder =
  | {
      reminderType: "relative";
      relativeMinutes: number;
      channels: Array<"push" | "email">;
    }
  | {
      reminderType: "absolute";
      absoluteTime: string;
      channels: Array<"push" | "email">;
    };

export function calendarTools(): ToolDefinition[] {
  return [
    {
      name: "getUpcomingEvents",
      description: "Get calendar events within a date range",
      parameters: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        return db.getUserEvents(ctx.userId, params.startDate, params.endDate);
      },
    },
    {
      name: "createEvent",
      description: "Create a new calendar event",
      parameters: z.object({
        title: z.string().describe("Event title"),
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        startTime: z.string().optional().describe("Start time in HH:MM format (omit for all-day event)"),
        endDate: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to start date)"),
        endTime: z.string().optional().describe("End time in HH:MM format"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        color: z.string().optional().describe("Event color"),
        categoryId: z.string().optional().describe("Calendar category ID"),
        isRecurring: z.boolean().optional().describe("Whether this event repeats"),
        recurrenceRule: z
          .union([
            z.object({ frequency: z.literal("daily"), interval: z.number().int().positive() }),
            z.object({ frequency: z.literal("weekly"), interval: z.number().int().positive(), daysOfWeek: z.array(z.number().int()) }),
            z.object({ frequency: z.literal("monthly"), interval: z.number().int().positive(), dayOfMonth: z.number().int().positive() }),
            z.object({ frequency: z.literal("monthly"), interval: z.number().int().positive(), weekPosition: z.enum(["first", "second", "third", "fourth", "last"]), dayOfWeekMonthly: z.number().int() }),
            z.object({ frequency: z.literal("yearly"), interval: z.number().int().positive(), monthOfYear: z.number().int().positive(), dayOfMonth: z.number().int().positive() }),
          ])
          .optional()
          .describe("Recurrence rule"),
        endType: z.enum(["never", "after_count", "on_date"]).optional(),
        endDateRecurrence: z.string().optional(),
        endCount: z.number().int().positive().optional(),
        reminders: z
          .array(
            z.discriminatedUnion("reminderType", [
              z.object({
                reminderType: z.literal("relative"),
                relativeMinutes: z.number().int().nonnegative(),
                channels: z.array(z.enum(["push", "email"])).min(1),
              }),
              z.object({
                reminderType: z.literal("absolute"),
                absoluteTime: z.string().datetime(),
                channels: z.array(z.enum(["push", "email"])).min(1),
              }),
            ]),
          )
          .optional()
          .describe("Optional reminder configuration"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createSchedulingWrites(ctx.supabase).create({
          userId: ctx.userId,
          event: {
            title: params.title,
            startDate: params.startDate,
            startTime: params.startTime ?? null,
            endDate: params.endDate ?? params.startDate,
            endTime: params.endTime ?? null,
            description: params.description ?? null,
            location: params.location ?? null,
            color: params.color ?? null,
            categoryId: params.categoryId ?? null,
            isRecurring: params.isRecurring ?? false,
            recurrenceRule: params.recurrenceRule ?? null,
            endType: params.endType ?? null,
            endDateRecurrence: params.endDateRecurrence ?? null,
            endCount: params.endCount ?? null,
            recurringEventId: null,
            originalDate: null,
            isException: false,
          },
          reminders: params.reminders?.map((reminder: AiEventReminder) =>
            reminder.reminderType === "relative"
              ? {
                  reminderType: "relative" as const,
                  relativeMinutes: reminder.relativeMinutes,
                  channels: reminder.channels,
                }
              : {
                  reminderType: "absolute" as const,
                  absoluteTime: reminder.absoluteTime,
                  channels: reminder.channels,
                },
          ),
        });

        if (outcome.type === "created") return toCalendarEventResponse(outcome.event);
        if (outcome.type === "not-found") {
          return { error: "Calendar related entity not found" };
        }
        if (outcome.type === "conflict") {
          return { error: "Calendar event creation conflicted" };
        }
        return { error: outcome.message, field: outcome.field };
      },
    },
    {
      name: "updateEvent",
      description: "Update a calendar event's details",
      parameters: z.object({
        eventId: z.string().describe("The event ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        startDate: z
          .string()
          .optional()
          .describe("New start date in YYYY-MM-DD format"),
        endDate: z
          .string()
          .optional()
          .describe("New end date in YYYY-MM-DD format"),
        startTime: z
          .string()
          .optional()
          .describe("New start time in HH:MM format"),
        endTime: z
          .string()
          .optional()
          .describe("New end time in HH:MM format"),
        location: z.string().optional().describe("New location"),
        reminders: z
          .array(
            z.discriminatedUnion("reminderType", [
              z.object({
                reminderType: z.literal("relative"),
                relativeMinutes: z.number().int().nonnegative(),
                channels: z.array(z.enum(["push", "email"])).min(1),
              }),
              z.object({
                reminderType: z.literal("absolute"),
                absoluteTime: z.string().datetime(),
                channels: z.array(z.enum(["push", "email"])).min(1),
              }),
            ]),
          )
          .optional()
          .describe("Complete desired reminder intent; omit to preserve existing reminders"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const lifecycle = new SchedulingLifecycle(ctx.supabase);
        const { eventId, startDate, endDate, startTime, endTime, reminders, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (startDate !== undefined) updates.start_date = startDate;
        if (endDate !== undefined) updates.end_date = endDate;
        if (startTime !== undefined) updates.start_time = startTime;
        if (endTime !== undefined) updates.end_time = endTime;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return lifecycle.update(ctx.userId, eventId, {
          event: updates,
          ...(reminders === undefined
            ? {}
            : {
                reminders: reminders.map((reminder: AiEventReminder) => ({
                  reminder_type: reminder.reminderType,
                  relative_minutes:
                    reminder.reminderType === "relative"
                      ? reminder.relativeMinutes
                      : null,
                  absolute_time:
                    reminder.reminderType === "absolute"
                      ? reminder.absoluteTime
                      : null,
                  channels: reminder.channels,
                })),
              }),
        });
      },
    },
    {
      name: "deleteEvent",
      description:
        "Delete a calendar event. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        eventId: z.string().describe("The event ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const lifecycle = new SchedulingLifecycle(ctx.supabase);
        return lifecycle.delete(ctx.userId, params.eventId);
      },
    },
  ];
}
