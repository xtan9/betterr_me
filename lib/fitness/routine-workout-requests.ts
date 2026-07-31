import type { SupabaseClient } from "@supabase/supabase-js";
import { RoutinesDB } from "@/lib/db/routines";
import type { RoutineWithExercises, WorkoutWithExercises } from "@/lib/db/types";
import { WorkoutsDB } from "@/lib/db/workouts";
import {
  RoutineToWorkoutConversion,
  WorkoutToRoutineConversion,
} from "@/lib/fitness/routine-workout-conversion";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import { log } from "@/lib/logger";

interface RoutineSource {
  getRoutine(routineId: string): Promise<RoutineWithExercises | null>;
  updateRoutine(
    routineId: string,
    values: { last_performed_at: string },
  ): Promise<unknown>;
}

interface WorkoutSource {
  getWorkoutWithExercises(
    workoutId: string,
  ): Promise<WorkoutWithExercises | null>;
}

interface RoutineStarter {
  start(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutWithExercises>;
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
    private routines: RoutineSource,
    private workouts: WorkoutSource,
    private routineStarter: RoutineStarter,
    private workoutSaver: WorkoutSaver,
  ) {}

  async start(userId: string, routineId: string) {
    const routine = await this.routines.getRoutine(routineId);
    if (!routine) return null;

    const workout = await this.routineStarter.start(userId, routine);
    try {
      await this.routines.updateRoutine(routineId, {
        last_performed_at: new Date().toISOString(),
      });
    } catch (error) {
      log.error("Failed to update routine last_performed_at", error, {
        routineId,
      });
    }
    return workout;
  }

  async save(userId: string, workoutId: string, name: string) {
    const workout = await this.workouts.getWorkoutWithExercises(workoutId);
    if (!workout) return null;
    return this.workoutSaver.save(userId, name, workout);
  }
}

export function createRoutineWorkoutRequests(supabase: SupabaseClient) {
  const store = new SupabaseRoutineWorkoutStore(supabase);
  return new RoutineWorkoutRequests(
    new RoutinesDB(supabase),
    new WorkoutsDB(supabase),
    new RoutineToWorkoutConversion(store),
    new WorkoutToRoutineConversion(store),
  );
}
