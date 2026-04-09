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
        startTime: z.string().describe("Start time in ISO 8601 format"),
        endTime: z
          .string()
          .optional()
          .describe("End time in ISO 8601 format"),
        allDay: z
          .boolean()
          .optional()
          .describe("Whether this is an all-day event"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        return db.createEvent(ctx.userId, {
          title: params.title,
          start_time: params.startTime,
          end_time: params.endTime ?? null,
          all_day: params.allDay ?? false,
        });
      },
    },
  ];
}
