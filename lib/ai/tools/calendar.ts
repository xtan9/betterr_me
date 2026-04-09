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
  ];
}
