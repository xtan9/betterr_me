import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Routine,
  RoutineUpdate,
  RoutineExercise,
  RoutineWithExercises,
} from "./types";
import { log } from "@/lib/logger";

/** CRUD for routines and routine exercises. RLS handles user scoping. */
export class RoutinesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all routines for a user with nested exercises and exercise details.
   * Ordered by updated_at DESC; exercises ordered by sort_order ASC.
   */
  async getUserRoutines(userId: string): Promise<RoutineWithExercises[]> {
    const { data, error } = await this.supabase
      .from("routines")
      .select(
        `
        *,
        routine_exercises (
          *,
          exercise:exercises (*)
        )
      `
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("sort_order", {
        referencedTable: "routine_exercises",
        ascending: true,
      });

    if (error) {
      log.error("Failed to get user routines", error);
      throw error;
    }

    // Reshape nested fields to match TypeScript types
    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      exercises: (
        (r.routine_exercises as Record<string, unknown>[]) ?? []
      ).map((re: Record<string, unknown>) => ({
        ...re,
        exercise: re.exercise,
      })),
    })) as RoutineWithExercises[];
  }

  /**
   * Get a single routine by ID with nested exercises and exercise details.
   * Returns null if not found (PGRST116).
   */
  async getRoutine(routineId: string): Promise<RoutineWithExercises | null> {
    const { data, error } = await this.supabase
      .from("routines")
      .select(
        `
        *,
        routine_exercises (
          *,
          exercise:exercises (*)
        )
      `
      )
      .eq("id", routineId)
      .order("sort_order", {
        referencedTable: "routine_exercises",
        ascending: true,
      })
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("Failed to get routine", error);
      throw error;
    }

    // Reshape nested fields to match TypeScript types
    return {
      ...data,
      exercises: (
        (data.routine_exercises as Record<string, unknown>[]) ?? []
      ).map((re: Record<string, unknown>) => ({
        ...re,
        exercise: re.exercise,
      })),
    } as RoutineWithExercises;
  }

  /**
   * Create a new routine.
   */
  async createRoutine(
    userId: string,
    data: { name: string; notes?: string | null }
  ): Promise<Routine> {
    const { data: routine, error } = await this.supabase
      .from("routines")
      .insert({
        user_id: userId,
        name: data.name,
        notes: data.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      log.error("Failed to create routine", error);
      throw error;
    }

    return routine;
  }

  /**
   * Update a routine by ID. Throws if not found.
   */
  async updateRoutine(
    routineId: string,
    updates: RoutineUpdate
  ): Promise<Routine> {
    const { data, error } = await this.supabase
      .from("routines")
      .update(updates)
      .eq("id", routineId)
      .select()
      .single();

    if (error) {
      log.error("Failed to update routine", error);
      throw error;
    }

    return data;
  }

  /**
   * Delete a routine by ID. CASCADE handles routine_exercises cleanup.
   */
  async deleteRoutine(routineId: string): Promise<void> {
    const { error } = await this.supabase
      .from("routines")
      .delete()
      .eq("id", routineId);

    if (error) {
      log.error("Failed to delete routine", error);
      throw error;
    }
  }

  /**
   * Add an exercise to a routine. Computes sort_order as max + 65536
   * (same gap pattern as workout exercises).
   */
  async addExerciseToRoutine(
    routineId: string,
    data: {
      exercise_id: string;
      target_sets?: number;
      target_reps?: number | null;
      target_weight_kg?: number | null;
      target_duration_seconds?: number | null;
      rest_timer_seconds?: number;
      notes?: string | null;
    }
  ): Promise<RoutineExercise> {
    // Compute next sort_order
    const { data: maxRow } = await this.supabase
      .from("routine_exercises")
      .select("sort_order")
      .eq("routine_id", routineId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    // 65536 (2^16) gap allows ~52 bisection levels for drag-and-drop reordering without renumbering
    const nextSortOrder = maxRow
      ? (maxRow.sort_order as number) + 65536.0
      : 65536.0;

    const { data: routineExercise, error } = await this.supabase
      .from("routine_exercises")
      .insert({
        routine_id: routineId,
        exercise_id: data.exercise_id,
        sort_order: nextSortOrder,
        target_sets: data.target_sets ?? 3,
        target_reps: data.target_reps ?? null,
        target_weight_kg: data.target_weight_kg ?? null,
        target_duration_seconds: data.target_duration_seconds ?? null,
        rest_timer_seconds: data.rest_timer_seconds ?? 90,
        notes: data.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      log.error("Failed to add exercise to routine", error);
      throw error;
    }

    return routineExercise;
  }

  /**
   * Update a routine exercise's fields.
   */
  async updateRoutineExercise(
    routineExerciseId: string,
    updates: {
      target_sets?: number;
      target_reps?: number | null;
      target_weight_kg?: number | null;
      target_duration_seconds?: number | null;
      rest_timer_seconds?: number;
      notes?: string | null;
      sort_order?: number;
    }
  ): Promise<RoutineExercise> {
    const { data, error } = await this.supabase
      .from("routine_exercises")
      .update(updates)
      .eq("id", routineExerciseId)
      .select()
      .single();

    if (error) {
      log.error("Failed to update routine exercise", error);
      throw error;
    }

    return data;
  }

  /**
   * Remove an exercise from a routine.
   */
  async removeRoutineExercise(routineExerciseId: string): Promise<void> {
    const { error } = await this.supabase
      .from("routine_exercises")
      .delete()
      .eq("id", routineExerciseId);

    if (error) {
      log.error("Failed to remove routine exercise", error);
      throw error;
    }
  }
}
