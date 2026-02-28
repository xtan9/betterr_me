import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Exercise,
  ExerciseUpdate,
  MuscleGroup,
  Equipment,
  ExerciseType,
} from "./types";

/** Fields required to create a custom exercise (user_id and is_custom set by DB class). */
export interface CreateExerciseInput {
  name: string;
  muscle_group_primary: MuscleGroup;
  muscle_groups_secondary?: MuscleGroup[];
  equipment: Equipment;
  exercise_type: ExerciseType;
}

/** CRUD for exercises (preset + user custom). RLS handles visibility. */
export class ExercisesDB {
  constructor(private supabase: SupabaseClient) {}

  /** Get all exercises visible to the user (presets + custom). RLS handles visibility. */
  async getAllExercises(): Promise<Exercise[]> {
    const { data, error } = await this.supabase
      .from("exercises")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Get a single exercise by id. Returns null if not found or not visible (PGRST116). */
  async getExercise(id: string): Promise<Exercise | null> {
    const { data, error } = await this.supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /** Create a custom exercise. Sets user_id and is_custom = true. */
  async createExercise(
    userId: string,
    exercise: CreateExerciseInput
  ): Promise<Exercise> {
    const { data, error } = await this.supabase
      .from("exercises")
      .insert({
        ...exercise,
        muscle_groups_secondary: exercise.muscle_groups_secondary ?? [],
        user_id: userId,
        is_custom: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Update a custom exercise. RLS enforces ownership + is_custom. */
  async updateExercise(id: string, updates: ExerciseUpdate): Promise<Exercise> {
    const { data, error } = await this.supabase
      .from("exercises")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Delete a custom exercise. RLS enforces ownership.
   * Throws user-friendly error on FK violation (exercise used in workouts).
   */
  async deleteExercise(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("exercises")
      .delete()
      .eq("id", id);
    if (error) {
      if (error.code === "23503") {
        throw new Error(
          "This exercise has been used in workouts and cannot be deleted."
        );
      }
      throw error;
    }
  }
}
