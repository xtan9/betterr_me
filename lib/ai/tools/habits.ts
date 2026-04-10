import { z } from "zod";
import { HabitsDB, HabitLogsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function habitTools(): ToolDefinition[] {
  return [
    {
      name: "getHabitsToday",
      description:
        "Get all habits with today's completion status and monthly completion rate",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.getHabitsWithTodayStatus(ctx.userId, params.date);
      },
    },
    {
      name: "getHabitStats",
      description: "Get completion statistics for a specific habit",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        days: z
          .number()
          .optional()
          .describe("Number of days to calculate stats for (default 30)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitLogsDB(ctx.supabase);
        return db.getHabitStats(params.habitId, ctx.userId, params.days);
      },
    },
    {
      name: "logHabit",
      description: "Toggle a habit's completion status for a given date",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitLogsDB(ctx.supabase);
        return db.toggleLog(params.habitId, ctx.userId, params.date);
      },
    },
  ];
}
