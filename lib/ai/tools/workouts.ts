import { z } from "zod";
import { WorkoutsDB, ExercisesDB, RoutinesDB } from "@/lib/db";
import {
  createWorkoutWrites,
  toWorkoutResponse,
  type WorkoutStartOutcome,
  type WorkoutStartSource,
} from "@/lib/fitness/writes";
import type { ToolDefinition, ToolContext } from "./types";

function workoutStartToolResult(outcome: WorkoutStartOutcome) {
  if (outcome.type === "started") return outcome.workout;
  if (outcome.type === "conflict") {
    return { error: "You already have an active workout" };
  }
  if (outcome.type === "not-found") return { error: "Routine not found" };
  return { error: outcome.message };
}

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
        const source: WorkoutStartSource = params.routineId === undefined
          ? { type: "blank", title: params.name }
          : { type: "routine", routineId: params.routineId };
        const outcome = await createWorkoutWrites(ctx.supabase).start({
          userId: ctx.userId,
          source,
        });
        return workoutStartToolResult(outcome);
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
        const outcome = await createWorkoutWrites(ctx.supabase).complete({
          userId: ctx.userId,
          workoutId: params.workoutId,
          notes: params.notes ?? null,
        });
        if (outcome.type === "not-found") return { error: "Workout not found" };
        if (outcome.type === "invalid-transition") {
          return { error: "Workout is no longer editable" };
        }
        if (outcome.type === "invalid") return { error: outcome.message };
        return toWorkoutResponse(outcome.workout);
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
        const workout = await db.getWorkoutWithExercises(params.workoutId);
        if (!workout) return { error: "Workout not found" };
        return workout;
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
