import { z } from "zod";
import { WorkoutsDB, ExercisesDB, RoutinesDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function workoutTools(): ToolDefinition[] {
  return [
    {
      name: "getRecentWorkouts",
      description: "Get recent completed workouts with exercise summaries",
      parameters: z.object({
        limit: z
          .number()
          .optional()
          .describe("Number of workouts to return (default 5)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getWorkoutsWithSummary(ctx.userId, {
          limit: params.limit ?? 5,
        });
      },
    },
    {
      name: "getActiveWorkout",
      description: "Get the user's currently active (in-progress) workout",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getActiveWorkout(ctx.userId);
      },
    },
    {
      name: "startWorkout",
      description:
        "Start a new workout session. Only one active workout is allowed at a time. Always confirm with the user first.",
      parameters: z.object({
        name: z
          .string()
          .optional()
          .describe("Workout name (default: 'Workout')"),
        routineId: z
          .string()
          .optional()
          .describe("Start from a routine template"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.startWorkout(ctx.userId, {
          title: params.name,
          routine_id: params.routineId,
        });
      },
    },
    {
      name: "completeWorkout",
      description: "Complete an active workout",
      parameters: z.object({
        workoutId: z.string().describe("The workout ID"),
        notes: z.string().optional().describe("Notes about the workout"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.updateWorkout(params.workoutId, {
          status: "completed",
          notes: params.notes ?? null,
        });
      },
    },
    {
      name: "getWorkoutDetails",
      description: "Get full workout details with all exercises and sets",
      parameters: z.object({
        workoutId: z.string().describe("The workout ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getWorkoutWithExercises(params.workoutId);
      },
    },
    {
      name: "getExercises",
      description: "List all available exercises (presets and custom)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new ExercisesDB(ctx.supabase);
        return db.getAllExercises();
      },
    },
    {
      name: "getRoutines",
      description: "List the user's workout routines with exercises",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RoutinesDB(ctx.supabase);
        return db.getUserRoutines(ctx.userId);
      },
    },
    {
      name: "getExerciseHistory",
      description:
        "Get performance history for a specific exercise across past workouts",
      parameters: z.object({
        exerciseId: z.string().describe("The exercise ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getExerciseHistory(params.exerciseId, ctx.userId);
      },
    },
  ];
}
