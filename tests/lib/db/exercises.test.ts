import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExercisesDB } from "@/lib/db/exercises";
import { mockSupabaseClient } from "../../setup";

describe("ExercisesDB", () => {
  let db: ExercisesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ExercisesDB(mockSupabaseClient as any);
  });

  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // =========================================================================
  // getAllExercises
  // =========================================================================

  describe("getAllExercises", () => {
    it("returns all exercises ordered by name asc with media join", async () => {
      const rows = [
        { id: "e1", name: "Bench Press", exercise_media: { gif_url: "g" } },
        { id: "e2", name: "Squat", exercise_media: null },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getAllExercises();

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercises");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        expect.stringContaining("version::text,exercise_media(")
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getAllExercises();

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getAllExercises()).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getExercise
  // =========================================================================

  describe("getExercise", () => {
    it("returns exercise by id", async () => {
      const row = { id: "e1", name: "Bench Press" };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.getExercise("e1");

      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercises");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "e1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("returns null on PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getExercise("missing");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getExercise("e1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });
});
