import { assistantWorkouts,assistantHistoryCommand } from '@/lib/fitness/assistant-history';
import { historyId,historyRevision,historyPatchSchema } from '@/lib/validations/train-history';
import { assistantTemplates } from '@/lib/fitness/assistant-templates';
import { assistantWorkoutWrites } from "@/lib/fitness/assistant-workouts";
import { z } from "zod";
import { ExercisesDB } from "@/lib/db";
import {
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
        const db = assistantWorkouts(ctx);
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
        const db = assistantWorkouts(ctx);
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
        const outcome = await assistantWorkoutWrites(ctx).start({
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
        const outcome = await assistantWorkoutWrites(ctx).complete({
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
        const db = assistantWorkouts(ctx);
        const workout = await db.getWorkoutWithExercises(params.workoutId, ctx.userId);
        if (!workout) return { error: "Workout not found" };
        if (workout.recordedStatus === "unsupported") return {
          id: workout.id, recordedStatus: "unsupported",
          error: "This recorded workout format cannot be read by this version. Update before interpreting its exercises or sets.",
        };
        return workout;
      },
    },
    {
      name:'correctWorkoutHistory',
      description:'Correct explicitly supplied completed measurements or timing only after user review. Supply the current revision and a stable operation ID; retain and show conflicts for review instead of silently retrying under a new revision.',
      parameters:z.object({operationId:historyId,workoutId:historyId,expectedRevision:historyRevision,patch:historyPatchSchema}).strict(),
      execute:async(params,ctx:ToolContext)=>assistantHistoryCommand(ctx,params.operationId,{kind:'correct-workout',workoutId:params.workoutId,expectedRevision:params.expectedRevision,patch:params.patch}),
    },
    {
      name:'deleteWorkoutHistory',
      description:'Delete a completed workout only after explicit user confirmation of the reviewed current revision. Reuse the stable operation ID on uncertain retry; a conflict requires new explicit review. This never reopens its plan.',
      parameters:z.object({operationId:historyId,workoutId:historyId,expectedRevision:historyRevision}).strict(),
      execute:async(params,ctx:ToolContext)=>assistantHistoryCommand(ctx,params.operationId,{kind:'delete-workout',workoutId:params.workoutId,expectedRevision:params.expectedRevision}),
    },
    {
      name: "getExercises",
      description: "List all available exercises (presets and custom)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new ExercisesDB(ctx.supabase);
        return db.getAllExercises(ctx.userId);
      },
    },
    {
      name: "getRoutines",
      description: "List the user's workout routines with exercises",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        return assistantTemplates(ctx);
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
        const db = assistantWorkouts(ctx);
        return db.getExerciseHistory(params.exerciseId, ctx.userId);
      },
    },
  ];
}
