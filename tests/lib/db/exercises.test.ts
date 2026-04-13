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
        "*, exercise_media(gif_url, thumbnail_url, instructions, alternative_names, exercisedb_id, media_status)"
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

  // =========================================================================
  // createExercise
  // =========================================================================

  describe("createExercise", () => {
    it("creates exercise with defaults for secondary muscle groups", async () => {
      const row = { id: "e1", name: "Curl" };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.createExercise("user-1", {
        name: "Curl",
        muscle_group_primary: "biceps",
        equipment: "dumbbell",
        exercise_type: "reps",
      } as any);

      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercises");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        name: "Curl",
        muscle_group_primary: "biceps",
        muscle_groups_secondary: [],
        equipment: "dumbbell",
        exercise_type: "reps",
        user_id: "user-1",
        is_custom: true,
      });
    });

    it("preserves provided secondary muscle groups", async () => {
      mockSupabaseClient.setMockResponse({ id: "e1" });

      await db.createExercise("user-1", {
        name: "Row",
        muscle_group_primary: "back",
        muscle_groups_secondary: ["biceps", "shoulders"],
        equipment: "barbell",
        exercise_type: "reps",
      } as any);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          muscle_groups_secondary: ["biceps", "shoulders"],
          is_custom: true,
          user_id: "user-1",
        })
      );
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "nope",
      });

      await expect(
        db.createExercise("user-1", {
          name: "X",
          muscle_group_primary: "chest",
          equipment: "barbell",
          exercise_type: "reps",
        } as any)
      ).rejects.toEqual({ code: "500", message: "nope" });
    });
  });

  // =========================================================================
  // updateExercise
  // =========================================================================

  describe("updateExercise", () => {
    it("updates and returns exercise", async () => {
      const row = { id: "e1", name: "Renamed" };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.updateExercise("e1", { name: "Renamed" } as any);

      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercises");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        name: "Renamed",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "e1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateExercise("e1", { name: "x" } as any)
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // deleteExercise
  // =========================================================================

  describe("deleteExercise", () => {
    it("deletes exercise", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteExercise("e1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("exercises");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "e1");
    });

    it("throws friendly error on FK violation (23503)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "23503" });

      await expect(db.deleteExercise("e1")).rejects.toThrow(
        "This exercise has been used in workouts and cannot be deleted."
      );
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.deleteExercise("e1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });
});
