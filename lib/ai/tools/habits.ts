import { z } from "zod";
import { HabitsDB, HabitLogsDB } from "@/lib/db";
import type { HabitFrequency } from "@/lib/db";
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
    {
      name: "createHabit",
      description: "Create a new habit with a tracking frequency",
      parameters: z.object({
        name: z.string().describe("Habit name"),
        description: z.string().optional().describe("Habit description"),
        frequency: z
          .object({
            type: z
              .enum(["daily", "weekdays", "weekly", "times_per_week", "custom"])
              .describe("Frequency type"),
            count: z
              .number()
              .optional()
              .describe("Times per week (only for times_per_week)"),
            days: z
              .array(z.number())
              .optional()
              .describe("Custom days (0=Sun, 6=Sat, only for custom)"),
          })
          .describe("How often to track this habit"),
        categoryId: z.string().optional().describe("Category ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.createHabit({
          user_id: ctx.userId,
          name: params.name,
          description: params.description ?? null,
          frequency: params.frequency as HabitFrequency,
          category_id: params.categoryId ?? null,
        });
      },
    },
    {
      name: "updateHabit",
      description:
        "Update an existing habit's name, description, frequency, or category",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        frequency: z
          .object({
            type: z.enum([
              "daily",
              "weekdays",
              "weekly",
              "times_per_week",
              "custom",
            ]),
            count: z.number().optional(),
            days: z.array(z.number()).optional(),
          })
          .optional()
          .describe("New frequency"),
        categoryId: z.string().optional().describe("New category ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        const { habitId, categoryId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (categoryId !== undefined) updates.category_id = categoryId;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateHabit(habitId, ctx.userId, updates);
      },
    },
    {
      name: "pauseHabit",
      description: "Pause a habit to temporarily stop tracking it",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.pauseHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "resumeHabit",
      description: "Resume a paused habit",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.resumeHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "archiveHabit",
      description: "Archive a habit (soft delete, can be restored later)",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.archiveHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "deleteHabit",
      description:
        "Permanently delete a habit and all its logs. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        await db.deleteHabit(params.habitId, ctx.userId);
        return { success: true };
      },
    },
    {
      name: "getDetailedHabitStats",
      description:
        "Get detailed habit completion stats broken down by this week, this month, and all time",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const habitsDB = new HabitsDB(ctx.supabase);
        const habit = await habitsDB.getHabit(params.habitId, ctx.userId);
        if (!habit) return { error: "Habit not found" };
        const logsDB = new HabitLogsDB(ctx.supabase);
        return logsDB.getDetailedHabitStats(
          params.habitId,
          ctx.userId,
          habit.frequency,
          habit.created_at,
        );
      },
    },
  ];
}
