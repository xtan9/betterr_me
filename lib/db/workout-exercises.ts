import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutExercise, WorkoutSet, SetType } from "./types";
import { log } from "@/lib/logger";

/** CRUD for exercises and sets within a workout. RLS handles user scoping. */
export class WorkoutExercisesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Add an exercise to a workout. Computes sort_order as max + 65536
   * (same gap pattern as task sort_order).
   */
  async addExercise(
    workoutId: string,
    exerciseId: string,
    restTimerSeconds?: number
  ): Promise<WorkoutExercise> {
    // Compute next sort_order
    const { data: maxRow } = await this.supabase
      .from("workout_exercises")
      .select("sort_order")
      .eq("workout_id", workoutId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextSortOrder = maxRow ? (maxRow.sort_order as number) + 65536.0 : 65536.0;

    const { data, error } = await this.supabase
      .from("workout_exercises")
      .insert({
        workout_id: workoutId,
        exercise_id: exerciseId,
        sort_order: nextSortOrder,
        rest_timer_seconds: restTimerSeconds ?? 90,
      })
      .select()
      .single();

    if (error) {
      log.error("Failed to add exercise to workout", error);
      throw error;
    }

    return data;
  }

  /**
   * Remove an exercise from a workout. CASCADE deletes related sets.
   */
  async removeExercise(workoutExerciseId: string): Promise<void> {
    const { error } = await this.supabase
      .from("workout_exercises")
      .delete()
      .eq("id", workoutExerciseId);

    if (error) {
      log.error("Failed to remove exercise from workout", error);
      throw error;
    }
  }

  /**
   * Update a workout exercise (notes, rest_timer_seconds).
   */
  async updateExercise(
    workoutExerciseId: string,
    updates: { notes?: string | null; rest_timer_seconds?: number }
  ): Promise<WorkoutExercise> {
    const { data, error } = await this.supabase
      .from("workout_exercises")
      .update(updates)
      .eq("id", workoutExerciseId)
      .select()
      .single();

    if (error) {
      log.error("Failed to update workout exercise", error);
      throw error;
    }

    return data;
  }

  /**
   * Add a set to a workout exercise. Computes set_number as max + 1.
   * Defaults set_type to 'normal'.
   */
  async addSet(
    workoutExerciseId: string,
    data: {
      set_type?: SetType;
      weight_kg?: number | null;
      reps?: number | null;
      duration_seconds?: number | null;
      distance_meters?: number | null;
      is_completed?: boolean;
    }
  ): Promise<WorkoutSet> {
    // Compute next set_number
    const { data: maxRow } = await this.supabase
      .from("workout_sets")
      .select("set_number")
      .eq("workout_exercise_id", workoutExerciseId)
      .order("set_number", { ascending: false })
      .limit(1)
      .single();

    const nextSetNumber = maxRow ? (maxRow.set_number as number) + 1 : 1;

    const { data: setData, error } = await this.supabase
      .from("workout_sets")
      .insert({
        workout_exercise_id: workoutExerciseId,
        set_number: nextSetNumber,
        set_type: data.set_type ?? "normal",
        weight_kg: data.weight_kg ?? null,
        reps: data.reps ?? null,
        duration_seconds: data.duration_seconds ?? null,
        distance_meters: data.distance_meters ?? null,
        is_completed: data.is_completed ?? false,
      })
      .select()
      .single();

    if (error) {
      log.error("Failed to add set", error);
      throw error;
    }

    return setData;
  }

  /**
   * Update a workout set.
   */
  async updateSet(
    setId: string,
    updates: {
      weight_kg?: number | null;
      reps?: number | null;
      duration_seconds?: number | null;
      distance_meters?: number | null;
      is_completed?: boolean;
      set_type?: SetType;
    }
  ): Promise<WorkoutSet> {
    const { data, error } = await this.supabase
      .from("workout_sets")
      .update(updates)
      .eq("id", setId)
      .select()
      .single();

    if (error) {
      log.error("Failed to update set", error);
      throw error;
    }

    return data;
  }

  /**
   * Delete a workout set.
   */
  async deleteSet(setId: string): Promise<void> {
    const { error } = await this.supabase
      .from("workout_sets")
      .delete()
      .eq("id", setId);

    if (error) {
      log.error("Failed to delete set", error);
      throw error;
    }
  }
}
