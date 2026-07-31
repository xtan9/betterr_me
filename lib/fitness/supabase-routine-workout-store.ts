import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutWithExercises } from "@/lib/db/types";
import type {
  RoutineWorkoutSessionInput,
  RoutineWorkoutStore,
} from "@/lib/fitness/routine-to-workout";

/**
 * Uses one PostgreSQL function call as the transaction boundary for the
 * complete workout session.
 */
export class SupabaseRoutineWorkoutStore implements RoutineWorkoutStore {
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
}
