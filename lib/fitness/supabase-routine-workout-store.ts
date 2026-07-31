import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "@/lib/constants/enums";
import type {
  RoutineWithExercises,
  WorkoutWithExercises,
} from "@/lib/db/types";
import type {
  RoutineWorkoutSessionInput,
  RoutineWorkoutStore,
  WorkoutRoutineInput,
  WorkoutRoutineStore,
} from "@/lib/fitness/routine-workout-conversion";

const exerciseSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  name: z.string(),
  muscle_group_primary: z.enum(MUSCLE_GROUPS),
  muscle_groups_secondary: z.array(z.enum(MUSCLE_GROUPS)),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_custom: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  exercise_media: z
    .object({
      gif_url: z.string().nullable(),
      thumbnail_url: z.string().nullable(),
      instructions: z.array(z.string()).nullable(),
      alternative_names: z.array(z.string()).nullable(),
      exercisedb_id: z.string().nullable(),
      media_status: z.enum(["active", "broken", "fallback"]),
    })
    .nullable()
    .default(null),
});

const routineWithExercisesSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  last_performed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  exercises: z.array(
    z.object({
      id: z.string(),
      routine_id: z.string(),
      exercise_id: z.string(),
      sort_order: z.number(),
      target_sets: z.number(),
      target_reps: z.number().nullable(),
      target_weight_kg: z.number().nullable(),
      target_duration_seconds: z.number().nullable(),
      target_distance_meters: z.number().nullable(),
      rest_timer_seconds: z.number(),
      notes: z.string().nullable(),
      created_at: z.string(),
      exercise: exerciseSchema,
    }),
  ),
});

/**
 * Uses one PostgreSQL function call as the transaction boundary for the
 * complete workout session.
 */
export class SupabaseRoutineWorkoutStore
  implements RoutineWorkoutStore, WorkoutRoutineStore
{
  constructor(private supabase: SupabaseClient) {}

  async createSession(
    userId: string,
    input: RoutineWorkoutSessionInput,
  ): Promise<WorkoutWithExercises> {
    const { data, error } = await this.supabase.rpc(
      "start_workout_from_routine",
      {
        p_user_id: userId,
        p_workout: {
          title: input.title,
          routine_id: input.routine_id,
        },
        p_exercises: input.exercises,
      },
    );

    if (error) throw error;
    return data as WorkoutWithExercises;
  }

  async createRoutine(
    userId: string,
    input: WorkoutRoutineInput,
  ): Promise<RoutineWithExercises> {
    const { data, error } = await this.supabase.rpc(
      "save_workout_as_routine",
      {
        p_user_id: userId,
        p_routine: {
          name: input.name,
          notes: input.notes,
        },
        p_exercises: input.exercises,
      },
    );

    if (error) throw error;

    const result = routineWithExercisesSchema.safeParse(data);
    if (!result.success) {
      throw new Error("Invalid routine returned by save_workout_as_routine");
    }

    return result.data;
  }
}
