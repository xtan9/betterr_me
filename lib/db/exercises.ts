import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise } from "./types";
import { log } from "@/lib/logger";

// Cast the SQL bigint before JSON decoding; Number cannot carry large versions.
const EXERCISE_COLUMNS =
  "id,user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom,created_at,updated_at,catalog_key,archived_at,measurement_convention,version::text,exercise_media(gif_url,thumbnail_url,instructions,alternative_names,exercisedb_id,media_status)";

/** Owner-scoped reads; all custom writes use the shared command boundary. */
export class ExercisesDB {
  constructor(private supabase: SupabaseClient) {}

  /** Get all exercises visible to the user (presets + custom). RLS handles visibility. */
  async getAllExercises(
    userId?: string,
    includeArchived = false,
  ): Promise<Exercise[]> {
    let query = this.supabase
      .from("exercises")
      .select(EXERCISE_COLUMNS)
      .order("name", { ascending: true });
    if (userId) query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) {
      log.error("Failed to get exercises", error);
      throw error;
    }
    // exercise_media.exercise_id is unique: PostgREST returns this join as an
    // object, while the ungenerated client infers an array for explicit selects.
    return (data ?? []) as unknown as Exercise[];
  }

  /** Get a single exercise by id. Returns null if not found or not visible (PGRST116). */
  async getExercise(id: string, userId?: string): Promise<Exercise | null> {
    let query = this.supabase
      .from("exercises")
      .select(EXERCISE_COLUMNS)
      .eq("id", id);
    if (userId) query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    const { data, error } = await query.single();
    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("Failed to get exercise", error);
      throw error;
    }
    return data as unknown as Exercise;
  }
}
