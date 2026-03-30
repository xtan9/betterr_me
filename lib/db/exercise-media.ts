import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExerciseMedia } from "./types";
import { log } from "@/lib/logger";

export interface UpsertMediaRow {
  exercise_id: string;
  exercisedb_id: string;
  gif_url: string;
  thumbnail_url: string;
  instructions: string[];
  alternative_names: string[];
  media_status?: string;
  source?: string;
}

/** Read/write for exercise_media cache. Reads via RLS, writes via admin client. */
export class ExerciseMediaDB {
  constructor(private supabase: SupabaseClient) {}

  /** Get cached media for an exercise. Returns null if not found. */
  async getByExerciseId(exerciseId: string): Promise<ExerciseMedia | null> {
    const { data, error } = await this.supabase
      .from("exercise_media")
      .select(
        "gif_url, thumbnail_url, instructions, alternative_names, exercisedb_id, media_status"
      )
      .eq("exercise_id", exerciseId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("Failed to get exercise media", error);
      throw error;
    }
    return data;
  }

  /** Upsert a single media row (uses onConflict exercise_id). */
  async upsertMedia(row: UpsertMediaRow): Promise<void> {
    const { error } = await this.supabase
      .from("exercise_media")
      .upsert(row, { onConflict: "exercise_id" });

    if (error) {
      log.error("Failed to upsert exercise media", error);
      throw error;
    }
  }

  /** Upsert multiple media rows in a single call. */
  async upsertBatch(rows: UpsertMediaRow[]): Promise<void> {
    const { error } = await this.supabase
      .from("exercise_media")
      .upsert(rows, { onConflict: "exercise_id" });

    if (error) {
      log.error("Failed to upsert exercise media batch", error);
      throw error;
    }
  }
}
