import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Workout,
  WorkoutWithExercises,
  WorkoutSet,
  ExerciseHistoryEntry,
} from "./types";
import { log } from "@/lib/logger";

/** Input data for starting a new workout. */
export interface StartWorkoutInput {
  title?: string;
  routine_id?: string | null;
}

/** Options for listing completed/discarded workouts. */
export interface GetWorkoutsOptions {
  limit?: number;
}

/** Summary data for a completed workout in the history list. */
export interface WorkoutSummary {
  id: string;
  title: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  exerciseCount: number;
  exerciseNames: string[];
  totalVolume: number;
  totalSets: number;
}

/** Valid workout status transitions. Terminal states have no outgoing edges. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  in_progress: ["completed", "discarded"],
  completed: [],
  discarded: [],
};

/** CRUD for workouts. RLS handles user scoping. */
export class WorkoutsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Start a new workout with status 'in_progress'.
   * Throws a descriptive error on unique constraint violation (23505)
   * when user already has an active workout.
   */
  async startWorkout(userId: string, data: StartWorkoutInput): Promise<Workout> {
    const { data: workout, error } = await this.supabase
      .from("workouts")
      .insert({
        user_id: userId,
        title: data.title ?? "Workout",
        status: "in_progress" as const,
        started_at: new Date().toISOString(),
        routine_id: data.routine_id ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        log.warn("Attempted to start workout while one is active", { userId });
        const err = new Error("You already have an active workout");
        (err as Error & { code: string }).code = "23505";
        throw err;
      }
      log.error("Failed to start workout", error);
      throw error;
    }

    return workout;
  }

  /**
   * Get the user's active (in_progress) workout with nested exercises and sets.
   * Returns null if no active workout exists (PGRST116).
   */
  async getActiveWorkout(userId: string): Promise<WorkoutWithExercises | null> {
    const { data, error } = await this.supabase
      .from("workouts")
      .select(
        `
        *,
        workout_exercises (
          *,
          exercise:exercises (*),
          sets:workout_sets (*)
        )
      `
      )
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .order("sort_order", {
        referencedTable: "workout_exercises",
        ascending: true,
      })
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("Failed to get active workout", error);
      throw error;
    }

    // Reshape nested fields to match TypeScript types
    return {
      ...data,
      exercises: (data.workout_exercises ?? []).map(
        (we: Record<string, unknown>) => ({
          ...we,
          exercise: we.exercise,
          sets: ((we.sets as Record<string, unknown>[]) ?? []).sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
              (a.set_number as number) - (b.set_number as number)
          ),
        })
      ),
    } as WorkoutWithExercises;
  }

  /**
   * Get a workout by ID with nested exercises and sets.
   * Used for both active and completed workouts.
   * Returns null if not found (PGRST116).
   */
  async getWorkoutWithExercises(
    workoutId: string
  ): Promise<WorkoutWithExercises | null> {
    const { data, error } = await this.supabase
      .from("workouts")
      .select(
        `
        *,
        workout_exercises (
          *,
          exercise:exercises (*),
          sets:workout_sets (*)
        )
      `
      )
      .eq("id", workoutId)
      .order("sort_order", {
        referencedTable: "workout_exercises",
        ascending: true,
      })
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("Failed to get workout with exercises", error);
      throw error;
    }

    // Reshape nested fields to match TypeScript types
    return {
      ...data,
      exercises: (data.workout_exercises ?? []).map(
        (we: Record<string, unknown>) => ({
          ...we,
          exercise: we.exercise,
          sets: ((we.sets as Record<string, unknown>[]) ?? []).sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
              (a.set_number as number) - (b.set_number as number)
          ),
        })
      ),
    } as WorkoutWithExercises;
  }

  /**
   * Update a workout row. Handles status transitions:
   * - To 'completed': computes completed_at and duration_seconds.
   * - To 'discarded': just updates status.
   * Validates state transitions — terminal states cannot be changed.
   */
  async updateWorkout(
    workoutId: string,
    updates: {
      title?: string;
      notes?: string | null;
      status?: "in_progress" | "completed" | "discarded";
    }
  ): Promise<Workout> {
    let finalUpdates: Record<string, unknown> = { ...updates };

    // If status change is requested, validate the transition
    if (updates.status) {
      const { data: current, error: fetchError } = await this.supabase
        .from("workouts")
        .select("status, started_at")
        .eq("id", workoutId)
        .single();

      if (fetchError) {
        log.error("Failed to fetch workout for update", fetchError);
        throw fetchError;
      }

      const allowed = VALID_TRANSITIONS[current.status as string] ?? [];
      if (!allowed.includes(updates.status)) {
        throw new Error(
          `Invalid status transition: ${current.status} → ${updates.status}`
        );
      }

      // If completing, compute completed_at and duration_seconds
      if (updates.status === "completed") {
        const completedAt = new Date().toISOString();
        const durationSeconds = Math.floor(
          (new Date(completedAt).getTime() -
            new Date(current.started_at).getTime()) /
            1000
        );

        finalUpdates = {
          ...finalUpdates,
          completed_at: completedAt,
          duration_seconds: durationSeconds,
        };
      }
    }

    const { data, error } = await this.supabase
      .from("workouts")
      .update(finalUpdates)
      .eq("id", workoutId)
      .select()
      .single();

    if (error) {
      log.error("Failed to update workout", error);
      throw error;
    }

    return data;
  }

  /**
   * List completed/discarded workouts for a user (workout history).
   * Does NOT include exercises/sets — use getWorkoutWithExercises for detail.
   */
  async getWorkouts(
    userId: string,
    options?: GetWorkoutsOptions
  ): Promise<Workout[]> {
    const limit = options?.limit ?? 20;

    const { data, error } = await this.supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      log.error("Failed to get workouts", error);
      throw error;
    }

    return data ?? [];
  }

  /**
   * Get previous sets for an exercise from the most recent completed workout.
   * Provides previous workout values alongside active set inputs.
   * Returns empty array if no previous workout found.
   */
  async getPreviousSets(exerciseId: string): Promise<WorkoutSet[]> {
    const { data, error } = await this.supabase
      .from("workout_exercises")
      .select(
        `
        workout_id,
        sets:workout_sets (*),
        workout:workouts!inner (started_at, status)
      `
      )
      .eq("exercise_id", exerciseId)
      .eq("workout.status", "completed")
      .order("started_at", { referencedTable: "workouts", ascending: false })
      .limit(5);

    if (error) {
      log.error("Failed to get previous sets", error);
      throw error;
    }

    if (!data || data.length === 0) return [];

    // Sort by workout started_at descending, take the most recent
    const sorted = [...data].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aWorkout = a.workout as { started_at: string };
        const bWorkout = b.workout as { started_at: string };
        return (
          new Date(bWorkout.started_at).getTime() -
          new Date(aWorkout.started_at).getTime()
        );
      }
    );

    const sets = (sorted[0].sets as WorkoutSet[]) ?? [];
    return sets.sort((a, b) => a.set_number - b.set_number);
  }

  /**
   * Get completed workouts with enriched summary data (exercise names, volume, set count).
   * Uses a single nested Supabase query + app-code aggregation.
   */
  async getWorkoutsWithSummary(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<WorkoutSummary[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const { data, error } = await this.supabase
      .from("workouts")
      .select(
        `
        *,
        workout_exercises (
          id,
          exercise:exercises (name),
          sets:workout_sets (weight_kg, reps, is_completed, set_type)
        )
      `
      )
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error("Failed to get workouts with summary", error);
      throw error;
    }

    return (data ?? []).map((w: Record<string, unknown>) => {
      const exercises = (w.workout_exercises as Record<string, unknown>[]) ?? [];
      return {
        id: w.id as string,
        title: w.title as string,
        notes: w.notes as string | null,
        started_at: w.started_at as string,
        completed_at: w.completed_at as string | null,
        duration_seconds: w.duration_seconds as number | null,
        exerciseCount: exercises.length,
        exerciseNames: exercises
          .map(
            (we) =>
              (we.exercise as { name: string } | null)?.name
          )
          .filter(Boolean) as string[],
        totalVolume: exercises.reduce((sum: number, we) => {
          const sets = (we.sets as Record<string, unknown>[]) ?? [];
          return (
            sum +
            sets
              .filter((s) => s.is_completed)
              .reduce(
                (v: number, s) =>
                  v +
                  ((s.weight_kg as number) ?? 0) *
                    ((s.reps as number) ?? 0),
                0
              )
          );
        }, 0),
        totalSets: exercises.reduce((sum: number, we) => {
          const sets = (we.sets as Record<string, unknown>[]) ?? [];
          return (
            sum + sets.filter((s) => s.is_completed).length
          );
        }, 0),
      };
    });
  }

  /**
   * Get per-workout aggregated stats for a specific exercise across completed workouts.
   * Used for progression charts and personal records computation.
   */
  async getExerciseHistory(
    exerciseId: string,
    userId: string,
    options?: { since?: string }
  ): Promise<ExerciseHistoryEntry[]> {
    let query = this.supabase
      .from("workout_exercises")
      .select(
        `
        workout_id,
        sets:workout_sets (weight_kg, reps, duration_seconds, is_completed, set_type),
        workout:workouts!inner (id, started_at, status, user_id)
      `
      )
      .eq("exercise_id", exerciseId)
      .eq("workout.status", "completed")
      .eq("workout.user_id", userId);

    if (options?.since) {
      query = query.gte("workout.started_at", options.since);
    }

    const { data, error } = await query.order("workout.started_at", {
      referencedTable: "workouts",
      ascending: true,
    });

    if (error) {
      log.error("Failed to get exercise history", error);
      throw error;
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const workout = row.workout as { id: string; started_at: string };
      const sets = (row.sets as Record<string, unknown>[]) ?? [];
      const completedNormal = sets.filter(
        (s) => s.is_completed && s.set_type === "normal"
      );

      // Filter nulls explicitly — avoid `|| null` which treats 0 as falsy
      const weights = completedNormal
        .map((s) => s.weight_kg as number | null)
        .filter((v): v is number => v !== null);
      const reps = completedNormal
        .map((s) => s.reps as number | null)
        .filter((v): v is number => v !== null);
      const volume = completedNormal.reduce(
        (sum: number, s) =>
          sum +
          ((s.weight_kg as number) ?? 0) * ((s.reps as number) ?? 0),
        0
      );

      return {
        started_at: workout.started_at,
        workout_id: workout.id,
        best_set_weight_kg: weights.length > 0 ? Math.max(...weights) : null,
        best_set_reps: reps.length > 0 ? Math.max(...reps) : null,
        total_volume: completedNormal.length > 0 ? volume : null,
        total_sets: completedNormal.length,
      };
    });
  }

  /**
   * Get all sets for an exercise from completed workouts, filtered to
   * completed normal sets in application code. Each set is enriched with
   * the parent workout's started_at. Used by PR computation.
   */
  async getExerciseSets(
    exerciseId: string,
    userId: string
  ): Promise<
    Array<WorkoutSet & { workout_started_at: string }>
  > {
    const { data, error } = await this.supabase
      .from("workout_exercises")
      .select(
        `
        sets:workout_sets (*),
        workout:workouts!inner (started_at, status, user_id)
      `
      )
      .eq("exercise_id", exerciseId)
      .eq("workout.status", "completed")
      .eq("workout.user_id", userId);

    if (error) {
      log.error("Failed to get exercise sets", error);
      throw error;
    }

    const result: Array<WorkoutSet & { workout_started_at: string }> = [];
    for (const row of data ?? []) {
      const workout = (row as Record<string, unknown>).workout as {
        started_at: string;
      };
      const sets = ((row as Record<string, unknown>).sets as WorkoutSet[]) ?? [];
      for (const set of sets) {
        if (set.is_completed && set.set_type === "normal") {
          result.push({ ...set, workout_started_at: workout.started_at });
        }
      }
    }

    return result;
  }

  /**
   * Get the most recent completed_at timestamp for a user's workouts.
   * Returns null if no completed workouts exist.
   */
  async getLastCompletedAt(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("workouts")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.error("Failed to get last completed workout", error);
      throw error;
    }

    return data?.completed_at ?? null;
  }

  /**
   * Count completed workouts for a user since a given date.
   * Uses head-only query for efficiency.
   */
  async getWeekWorkoutCount(
    userId: string,
    weekStartDate: string
  ): Promise<number> {
    // Append time component so Postgres doesn't cast the bare date to midnight UTC.
    // weekStartDate is already the client's local week start (e.g. "2026-02-23"),
    // so comparing as a timestamp avoids a ~timezone-offset-hours window of imprecision.
    const weekStartTimestamp = weekStartDate.includes("T")
      ? weekStartDate
      : `${weekStartDate}T00:00:00`;

    const { count, error } = await this.supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("started_at", weekStartTimestamp);

    if (error) {
      log.error("Failed to get week workout count", error);
      throw error;
    }

    return count ?? 0;
  }
}
