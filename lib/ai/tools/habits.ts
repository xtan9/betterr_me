import { z } from "zod";
import { HabitsDB, HabitLogsDB } from "@/lib/db";
import { createHabitCompletion } from "@/lib/habits/completion";
import { createHabitWrites, toHabitResponse } from "@/lib/habits/writes";
import type { HabitCreationFrequency } from "@/lib/habits/writes";
import type { ToolDefinition, ToolContext } from "./types";

const createHabitParameters = z.object({
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
});

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
      description: "Set a habit's completion status for a given date",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
        completed: z.boolean().describe("The desired completion state"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const completion = createHabitCompletion(ctx.supabase);
        const intent = {
          habitId: params.habitId,
          userId: ctx.userId,
          date: params.date,
        };
        return params.completed
          ? completion.complete(intent)
          : completion.uncomplete(intent);
      },
    },
    {
      name: "createHabit",
      description: "Create a new habit with a tracking frequency",
      parameters: createHabitParameters,
      execute: async (
        params: z.infer<typeof createHabitParameters>,
        ctx: ToolContext,
      ) => {
        const outcome = await createHabitWrites(ctx.supabase).create({
          userId: ctx.userId,
          name: params.name,
          description: params.description ?? null,
          frequency: params.frequency as HabitCreationFrequency,
          categoryId: params.categoryId ?? null,
        });

        if (outcome.type === "created") {
          return toHabitResponse(outcome.habit);
        }
        if (outcome.type === "limit-reached") {
          return {
            error: `You have ${outcome.activeCount}/${outcome.limit} habits. Remove one before adding another.`,
          };
        }
        return { error: outcome.message, field: outcome.field };
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
      name: "graduateHabit",
      description:
        "Graduate a habit — mark it as formed/habitual. Moves it to the Formed gallery. Use when a habit has become automatic and the user wants to mark it as successfully built.",
      parameters: z.object({
        habitId: z.string().describe("The habit ID to graduate"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.graduateHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "reactivateHabit",
      description:
        "Reactivate a previously graduated (formed) habit — moves it back to Active. Resets current_streak to 0 but preserves best_streak. Use when a user wants to rebuild a habit they had let graduate.",
      parameters: z.object({
        habitId: z.string().describe("The habit ID to reactivate"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.reactivateHabit(params.habitId, ctx.userId);
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
        const habit = await db.getHabit(params.habitId, ctx.userId);
        if (!habit) return { error: "Habit not found" };
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
