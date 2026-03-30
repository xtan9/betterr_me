import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExerciseMediaDB } from "@/lib/db/exercise-media";
import { mockSupabaseClient } from "../../setup";

describe("ExerciseMediaDB", () => {
  let exerciseMediaDB: ExerciseMediaDB;

  beforeEach(() => {
    vi.clearAllMocks();
    exerciseMediaDB = new ExerciseMediaDB(mockSupabaseClient as any);
  });

  // ===========================================================================
  // getByExerciseId
  // ===========================================================================
  describe("getByExerciseId", () => {
    it("should return media object when found", async () => {
      const media = {
        gif_url: "https://v2.exercisedb.io/image/abc.gif",
        thumbnail_url: "https://v2.exercisedb.io/image/abc-thumb.gif",
        instructions: ["Step 1", "Step 2"],
        alternative_names: ["Alt Name"],
        exercisedb_id: "0001",
        media_status: "active",
      };
      mockSupabaseClient.setMockResponse(media);

      const result = await exerciseMediaDB.getByExerciseId("exercise-123");
      expect(result).toEqual(media);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercise_media");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "exercise_id",
        "exercise-123"
      );
    });

    it("should return null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "PGRST116",
        message: "not found",
      });

      const result = await exerciseMediaDB.getByExerciseId("nonexistent");
      expect(result).toBeNull();
    });

    it("should throw and log on other errors", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        exerciseMediaDB.getByExerciseId("exercise-123")
      ).rejects.toEqual(dbError);
    });
  });

  // ===========================================================================
  // upsertMedia
  // ===========================================================================
  describe("upsertMedia", () => {
    it("should upsert a single row with onConflict exercise_id", async () => {
      mockSupabaseClient.setMockResponse(null);

      const row = {
        exercise_id: "exercise-123",
        exercisedb_id: "0001",
        gif_url: "https://v2.exercisedb.io/image/abc.gif",
        thumbnail_url: "https://v2.exercisedb.io/image/abc-thumb.gif",
        instructions: ["Step 1"],
        alternative_names: ["Alt"],
      };

      await exerciseMediaDB.upsertMedia(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercise_media");
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // upsertBatch
  // ===========================================================================
  describe("upsertBatch", () => {
    it("should upsert multiple rows", async () => {
      mockSupabaseClient.setMockResponse(null);

      const rows = [
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

      await exerciseMediaDB.upsertBatch(rows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercise_media");
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });
  });
});
