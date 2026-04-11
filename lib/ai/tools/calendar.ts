import { z } from "zod";
import { CalendarEventsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

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
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        return db.createEvent(ctx.userId, {
          title: params.title,
          description: null,
          start_date: params.startDate,
          start_time: params.startTime ?? null,
          end_date: params.endDate ?? params.startDate,
          end_time: params.endTime ?? null,
          location: null,
          color: null,
          category_id: null,
          is_recurring: false,
          recurrence_rule: null,
          end_type: null,
          end_date_recurrence: null,
          end_count: null,
          recurring_event_id: null,
          original_date: null,
          is_exception: false,
        });
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
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        const { eventId, startDate, endDate, startTime, endTime, ...rest } =
          params;
        const updates: Record<string, unknown> = { ...rest };
        if (startDate !== undefined) updates.start_date = startDate;
        if (endDate !== undefined) updates.end_date = endDate;
        if (startTime !== undefined) updates.start_time = startTime;
        if (endTime !== undefined) updates.end_time = endTime;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateEvent(eventId, ctx.userId, updates);
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
        const db = new CalendarEventsDB(ctx.supabase);
        const event = await db.getEvent(params.eventId, ctx.userId);
        if (!event) return { error: "Event not found" };
        await db.deleteEvent(params.eventId, ctx.userId);
        return { success: true };
      },
    },
  ];
}
