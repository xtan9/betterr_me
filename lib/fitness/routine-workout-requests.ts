import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoutineWithExercises, WorkoutWithExercises } from "@/lib/db/types";
import { WorkoutsDB } from "@/lib/db/workouts";
import {
  WorkoutToRoutineConversion,
} from "@/lib/fitness/routine-workout-conversion";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";

interface WorkoutSource {
  getWorkoutWithExercises(
    workoutId: string,
  ): Promise<WorkoutWithExercises | null>;
}

interface WorkoutSaver {
  save(
    userId: string,
    name: string,
    workout: WorkoutWithExercises,
  ): Promise<RoutineWithExercises>;
}

export class RoutineWorkoutRequests {
  constructor(
    private workouts: WorkoutSource,
    private workoutSaver: WorkoutSaver,
  ) {}

  async save(userId: string, workoutId: string, name: string) {
    const workout = await this.workouts.getWorkoutWithExercises(workoutId);
    if (!workout) return null;
    return this.workoutSaver.save(userId, name, workout);
  }
}

export function createRoutineWorkoutRequests(supabase: SupabaseClient) {
  const store = new SupabaseRoutineWorkoutStore(supabase);
  return new RoutineWorkoutRequests(
    new WorkoutsDB(supabase),
    new WorkoutToRoutineConversion(store),
  );
}
