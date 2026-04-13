import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { mockSupabaseClient } from "../../setup";

describe("WorkoutExercisesDB", () => {
  let db: WorkoutExercisesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new WorkoutExercisesDB(mockSupabaseClient as any);
  });

  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // =========================================================================
  // addExercise
  // =========================================================================

  describe("addExercise", () => {
    it("inserts with sort_order = max + 65536 when existing rows", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: { sort_order: 65536 }, error: null })
        .mockResolvedValueOnce({
          data: { id: "we-1", workout_id: "w-1" },
          error: null,
        });

      const result = await db.addExercise("w-1", "ex-1", 120);

      expect(result).toEqual({ id: "we-1", workout_id: "w-1" });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "workout_exercises"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("workout_id", "w-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("sort_order", {
        ascending: false,
      });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        workout_id: "w-1",
        exercise_id: "ex-1",
        sort_order: 131072,
        rest_timer_seconds: 120,
      });
    });

    it("defaults rest_timer_seconds to 90 and sort_order to 65536 on empty workout (PGRST116)", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({ data: { id: "we-1" }, error: null });

      const result = await db.addExercise("w-1", "ex-1");

      expect(result).toEqual({ id: "we-1" });
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        workout_id: "w-1",
        exercise_id: "ex-1",
        sort_order: 65536,
        rest_timer_seconds: 90,
      });
    });

    it("throws on non-PGRST116 sort-query error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fail" },
      });

      await expect(db.addExercise("w-1", "ex-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });

    it("throws when insert fails", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({
          data: null,
          error: { code: "23505", message: "dup" },
        });

      await expect(db.addExercise("w-1", "ex-1")).rejects.toEqual({
        code: "23505",
        message: "dup",
      });
    });
  });

  // =========================================================================
  // removeExercise
  // =========================================================================

  describe("removeExercise", () => {
    it("deletes by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.removeExercise("we-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "workout_exercises"
      );
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "we-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.removeExercise("we-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // updateExercise
  // =========================================================================

  describe("updateExercise", () => {
    it("updates and returns row", async () => {
      const row = { id: "we-1", notes: "hello" };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.updateExercise("we-1", {
        notes: "hello",
        rest_timer_seconds: 60,
      });

      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "workout_exercises"
      );
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        notes: "hello",
        rest_timer_seconds: 60,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "we-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateExercise("we-1", { notes: "x" })
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // addSet
  // =========================================================================

  describe("addSet", () => {
    it("inserts with set_number = max + 1 using provided fields", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: { set_number: 2 }, error: null })
        .mockResolvedValueOnce({ data: { id: "s-1" }, error: null });

      const result = await db.addSet("we-1", {
        set_type: "warmup",
        weight_kg: 40,
        reps: 10,
        duration_seconds: 30,
        distance_meters: 100,
        is_completed: true,
      } as any);

      expect(result).toEqual({ id: "s-1" });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("workout_sets");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "workout_exercise_id",
        "we-1"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("set_number", {
        ascending: false,
      });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        workout_exercise_id: "we-1",
        set_number: 3,
        set_type: "warmup",
        weight_kg: 40,
        reps: 10,
        duration_seconds: 30,
        distance_meters: 100,
        is_completed: true,
      });
    });

    it("defaults set_number to 1 and fields on PGRST116 + no args", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({ data: { id: "s-1" }, error: null });

      const result = await db.addSet("we-1", {});

      expect(result).toEqual({ id: "s-1" });
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        workout_exercise_id: "we-1",
        set_number: 1,
        set_type: "normal",
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        distance_meters: null,
        is_completed: false,
      });
    });

    it("throws on non-PGRST116 set-number lookup error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fail" },
      });

      await expect(db.addSet("we-1", {})).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });

    it("throws when insert fails", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({
          data: null,
          error: { code: "500", message: "nope" },
        });

      await expect(db.addSet("we-1", {})).rejects.toEqual({
        code: "500",
        message: "nope",
      });
    });
  });

  // =========================================================================
  // updateSet
  // =========================================================================

  describe("updateSet", () => {
    it("updates and returns row", async () => {
      const row = { id: "s-1", reps: 12 };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.updateSet("s-1", { reps: 12, is_completed: true });

      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("workout_sets");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        reps: 12,
        is_completed: true,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "s-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.updateSet("s-1", { reps: 1 })).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // deleteSet
  // =========================================================================

  describe("deleteSet", () => {
    it("deletes by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteSet("s-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("workout_sets");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "s-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.deleteSet("s-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
