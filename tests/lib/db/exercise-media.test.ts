import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExerciseMediaDB, type UpsertMediaRow } from "@/lib/db/exercise-media";
import { mockSupabaseClient } from "../../setup";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the logger so we can assert on log.error args. Using vi.fn() satisfies
// Rule 4 (mock boundary only) and Rule 2 (error paths covered explicitly).
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

describe("ExerciseMediaDB", () => {
  let db: ExerciseMediaDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ExerciseMediaDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  // ===========================================================================
  // getByExerciseId
  // ===========================================================================
  describe("getByExerciseId", () => {
    const EXERCISE_ID = "exercise-123";

    it("returns media object when found and asserts full SELECT chain", async () => {
      const media = {
        gif_url: "https://v2.exercisedb.io/image/abc.gif",
        thumbnail_url: "https://v2.exercisedb.io/image/abc-thumb.gif",
        instructions: ["Step 1", "Step 2"],
        alternative_names: ["Alt Name"],
        exercisedb_id: "0001",
        media_status: "active",
      };
      mockSupabaseClient.setMockResponse(media);

      const result = await db.getByExerciseId(EXERCISE_ID);

      expect(result).toEqual(media);

      // Full chain: from → select(cols) → eq(col, id) → single()
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "from",
        args: ["exercise_media"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "select",
        args: [
          "gif_url, thumbnail_url, instructions, alternative_names, exercisedb_id, media_status",
        ],
      });
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "eq",
        args: ["exercise_id", EXERCISE_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "single",
        args: [],
      });

      // Happy path must NOT log an error.
      expect(log.error).not.toHaveBeenCalled();
    });

    it("returns null when not found (PGRST116) without logging", async () => {
      const notFoundError = { code: "PGRST116", message: "not found" };
      mockSupabaseClient.setMockResponse(null, notFoundError);

      const result = await db.getByExerciseId("nonexistent");

      expect(result).toBeNull();
      // PGRST116 branch must early-return — no log.
      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs on non-PGRST116 errors", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.getByExerciseId(EXERCISE_ID)).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get exercise media",
        dbError,
      );
    });

    it("throws and logs on errors without a code (treated as non-PGRST116)", async () => {
      // Stryker often mutates the `error.code === "PGRST116"` check; an error
      // whose code is undefined should still take the throw path.
      const dbError = { message: "weird shape" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.getByExerciseId(EXERCISE_ID)).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get exercise media",
        dbError,
      );
    });
  });

  // ===========================================================================
  // upsertMedia
  // ===========================================================================
  describe("upsertMedia", () => {
    const row: UpsertMediaRow = {
      exercise_id: "exercise-123",
      exercisedb_id: "0001",
      gif_url: "https://v2.exercisedb.io/image/abc.gif",
      thumbnail_url: "https://v2.exercisedb.io/image/abc-thumb.gif",
      instructions: ["Step 1"],
      alternative_names: ["Alt"],
    };

    it("upserts a single row on the exercise_media table with onConflict=exercise_id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.upsertMedia(row);

      // Full chain: from(table) → upsert(row, { onConflict })
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "from",
        args: ["exercise_media"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "upsert",
        args: [row, { onConflict: "exercise_id" }],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs when the upsert fails", async () => {
      const dbError = { code: "23505", message: "conflict" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.upsertMedia(row)).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to upsert exercise media",
        dbError,
      );
    });
  });

  // ===========================================================================
  // upsertBatch
  // ===========================================================================
  describe("upsertBatch", () => {
    const rows: UpsertMediaRow[] = [
      {
        exercise_id: "exercise-1",
        exercisedb_id: "0001",
        gif_url: "https://v2.exercisedb.io/image/1.gif",
        thumbnail_url: "https://v2.exercisedb.io/image/1-thumb.gif",
        instructions: ["Step 1"],
        alternative_names: [],
      },
      {
        exercise_id: "exercise-2",
        exercisedb_id: "0002",
        gif_url: "https://v2.exercisedb.io/image/2.gif",
        thumbnail_url: "https://v2.exercisedb.io/image/2-thumb.gif",
        instructions: ["Step A"],
        alternative_names: ["Other"],
      },
    ];

    it("upserts the full array with onConflict=exercise_id (asserts exact args)", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.upsertBatch(rows);

      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "from",
        args: ["exercise_media"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercise_media",
        method: "upsert",
        args: [rows, { onConflict: "exercise_id" }],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("throws and logs when the batch upsert fails", async () => {
      const dbError = { code: "22P02", message: "invalid input" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.upsertBatch(rows)).rejects.toEqual(dbError);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to upsert exercise media batch",
        dbError,
      );
    });
  });
});
