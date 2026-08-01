import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoutinesDB } from "@/lib/db/routines";
import { mockSupabaseClient } from "../../setup";

describe("RoutinesDB", () => {
  let db: RoutinesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new RoutinesDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getUserRoutines
  // =========================================================================

  describe("getUserRoutines", () => {
    it("returns reshaped routines with nested exercises", async () => {
      const mockRoutines = [
        {
          id: "r1",
          user_id: "u1",
          name: "Push Day",
          routine_exercises: [
            {
              id: "re1",
              routine_id: "r1",
              exercise_id: "e1",
              sort_order: 65536,
              exercise: { id: "e1", name: "Bench Press" },
            },
            {
              id: "re2",
              routine_id: "r1",
              exercise_id: "e2",
              sort_order: 131072,
              exercise: { id: "e2", name: "Overhead Press" },
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockRoutines);

      const result = await db.getUserRoutines("u1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("r1");
      expect(result[0].exercises).toHaveLength(2);
      expect(result[0].exercises[0].exercise).toEqual({
        id: "e1",
        name: "Bench Press",
      });
      expect(result[0].exercises[1].exercise).toEqual({
        id: "e2",
        name: "Overhead Press",
      });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routines");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("updated_at", {
        ascending: false,
      });
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("sort_order", {
        referencedTable: "routine_exercises",
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserRoutines("u1");

      expect(result).toEqual([]);
    });

    it("handles routines with no exercises (null routine_exercises)", async () => {
      mockSupabaseClient.setMockResponse([
        { id: "r1", name: "Empty", routine_exercises: null },
      ]);

      const result = await db.getUserRoutines("u1");

      expect(result[0].exercises).toEqual([]);
    });

    it("handles routines with empty exercises array", async () => {
      mockSupabaseClient.setMockResponse([
        { id: "r1", name: "Empty", routine_exercises: [] },
      ]);

      const result = await db.getUserRoutines("u1");

      expect(result[0].exercises).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getUserRoutines("u1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getRoutine
  // =========================================================================

  describe("getRoutine", () => {
    it("scopes a routine lookup to the trusted user when provided", async () => {
      mockSupabaseClient.setMockResponse({
        id: "r1",
        user_id: "u1",
        name: "Private routine",
        routine_exercises: [],
      });

      await db.getRoutine("r1", "u1");

      mockSupabaseClient.expectQuery({
        table: "routines",
        method: "eq",
        args: ["id", "r1"],
      });
      mockSupabaseClient.expectQuery({
        table: "routines",
        method: "eq",
        args: ["user_id", "u1"],
      });
    });

    it("returns single routine with reshaped exercises", async () => {
      const mockRoutine = {
        id: "r1",
        name: "Leg Day",
        routine_exercises: [
          {
            id: "re1",
            exercise_id: "e1",
            sort_order: 65536,
            exercise: { id: "e1", name: "Squat" },
          },
        ],
      };
      mockSupabaseClient.setMockResponse(mockRoutine);

      const result = await db.getRoutine("r1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("r1");
      expect(result!.exercises).toHaveLength(1);
      expect(result!.exercises[0].exercise).toEqual({
        id: "e1",
        name: "Squat",
      });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routines");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "r1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("sort_order", {
        referencedTable: "routine_exercises",
        ascending: true,
      });
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getRoutine("missing");

      expect(result).toBeNull();
    });

    it("handles null routine_exercises field", async () => {
      mockSupabaseClient.setMockResponse({
        id: "r1",
        name: "Solo",
        routine_exercises: null,
      });

      const result = await db.getRoutine("r1");

      expect(result!.exercises).toEqual([]);
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getRoutine("r1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // getRoutineExercise
  // =========================================================================

  describe("getRoutineExercise", () => {
    it("scopes a routine exercise lookup through its owned routine", async () => {
      const exercise = {
        id: "re1",
        routine_id: "r1",
        exercise_id: "e1",
      };
      mockSupabaseClient.setMockResponse(exercise);

      const result = await db.getRoutineExercise("re1", "u1");

      expect(result).toEqual(exercise);
      mockSupabaseClient.expectQuery({
        table: "routine_exercises",
        method: "eq",
        args: ["id", "re1"],
      });
      mockSupabaseClient.expectQuery({
        table: "routine_exercises",
        method: "eq",
        args: ["routine.user_id", "u1"],
      });
    });

    it("returns null when the routine exercise is not visible to the user", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(db.getRoutineExercise("missing", "u1")).resolves.toBeNull();
    });
  });

  // =========================================================================
  // updateRoutineLastPerformedAt
  // =========================================================================

  describe("updateRoutineLastPerformedAt", () => {
    it("updates only the owned routine's performed timestamp", async () => {
      const performedAt = "2026-08-01T12:05:00.000Z";
      mockSupabaseClient.setMockResponse(null);

      await db.updateRoutineLastPerformedAt("r1", "u1", performedAt);

      mockSupabaseClient.expectQuery({
        table: "routines",
        method: "update",
        args: [{ last_performed_at: performedAt }],
      });
      mockSupabaseClient.expectQuery({
        table: "routines",
        method: "eq",
        args: ["id", "r1"],
      });
      mockSupabaseClient.expectQuery({
        table: "routines",
        method: "eq",
        args: ["user_id", "u1"],
      });
    });

    it("rethrows a timestamp update failure", async () => {
      const databaseError = { code: "42501", message: "not allowed" };
      mockSupabaseClient.setMockResponse(null, databaseError);

      await expect(
        db.updateRoutineLastPerformedAt(
          "r1",
          "u1",
          "2026-08-01T12:05:00.000Z",
        ),
      ).rejects.toBe(databaseError);
    });
  });

  // =========================================================================
  // createRoutine
  // =========================================================================

  describe("createRoutine", () => {
    it("creates routine with notes", async () => {
      const mockRoutine = {
        id: "r1",
        user_id: "u1",
        name: "Push",
        notes: "Heavy day",
      };
      mockSupabaseClient.setMockResponse(mockRoutine);

      const result = await db.createRoutine("u1", {
        name: "Push",
        notes: "Heavy day",
      });

      expect(result).toEqual(mockRoutine);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routines");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        user_id: "u1",
        name: "Push",
        notes: "Heavy day",
      });
    });

    it("defaults notes to null when omitted", async () => {
      mockSupabaseClient.setMockResponse({ id: "r1", name: "Pull" });

      await db.createRoutine("u1", { name: "Pull" });

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        user_id: "u1",
        name: "Pull",
        notes: null,
      });
    });

    it("treats null notes as null", async () => {
      mockSupabaseClient.setMockResponse({ id: "r1" });

      await db.createRoutine("u1", { name: "X", notes: null });

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        user_id: "u1",
        name: "X",
        notes: null,
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.createRoutine("u1", { name: "X" })
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // updateRoutine
  // =========================================================================

  describe("updateRoutine", () => {
    it("updates routine and returns row", async () => {
      const updated = { id: "r1", name: "Renamed", notes: "new" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateRoutine("r1", {
        name: "Renamed",
        notes: "new",
      });

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routines");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        name: "Renamed",
        notes: "new",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "r1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateRoutine("r1", { name: "X" })
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // deleteRoutine
  // =========================================================================

  describe("deleteRoutine", () => {
    it("deletes routine by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteRoutine("r1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routines");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "r1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.deleteRoutine("r1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // addExerciseToRoutine
  // =========================================================================

  describe("addExerciseToRoutine", () => {
    it("computes nextSortOrder as max + 65536 when existing rows", async () => {
      // First .single() = sort query (returns max row); second = insert result
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: { sort_order: 131072 }, error: null })
        .mockResolvedValueOnce({
          data: {
            id: "re1",
            routine_id: "r1",
            exercise_id: "e1",
            sort_order: 196608,
          },
          error: null,
        });

      const result = await db.addExerciseToRoutine("r1", {
        exercise_id: "e1",
      });

      expect(result).toEqual({
        id: "re1",
        routine_id: "r1",
        exercise_id: "e1",
        sort_order: 196608,
      });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routine_exercises");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("routine_id", "r1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("sort_order", {
        ascending: false,
      });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          routine_id: "r1",
          exercise_id: "e1",
          sort_order: 196608.0,
          target_sets: 3,
          target_reps: null,
          target_weight_kg: null,
          target_duration_seconds: null,
          rest_timer_seconds: 90,
          notes: null,
        })
      );
    });

    it("uses 65536 for first exercise (PGRST116 on sort query)", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({
          data: { id: "re1", sort_order: 65536 },
          error: null,
        });

      const result = await db.addExerciseToRoutine("r1", {
        exercise_id: "e1",
      });

      expect(result.sort_order).toBe(65536);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 65536.0 })
      );
    });

    it("uses 65536 when maxRow is null without error", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: { id: "re1", sort_order: 65536 },
          error: null,
        });

      await db.addExerciseToRoutine("r1", { exercise_id: "e1" });

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 65536.0 })
      );
    });

    it("applies all custom target fields", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({ data: { id: "re1" }, error: null });

      await db.addExerciseToRoutine("r1", {
        exercise_id: "e1",
        target_sets: 5,
        target_reps: 8,
        target_weight_kg: 100,
        target_duration_seconds: 60,
        target_distance_meters: 500,
        rest_timer_seconds: 120,
        notes: "form focus",
      });

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        routine_id: "r1",
        exercise_id: "e1",
        sort_order: 65536.0,
        target_sets: 5,
        target_reps: 8,
        target_weight_kg: 100,
        target_duration_seconds: 60,
        target_distance_meters: 500,
        rest_timer_seconds: 120,
        notes: "form focus",
      });
    });

    it("throws when sort-order query fails with non-PGRST116 error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "db down" },
      });

      await expect(
        db.addExerciseToRoutine("r1", { exercise_id: "e1" })
      ).rejects.toEqual({ code: "500", message: "db down" });
    });

    it("throws when insert fails", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({
          data: null,
          error: { code: "23503", message: "fk violation" },
        });

      await expect(
        db.addExerciseToRoutine("r1", { exercise_id: "e1" })
      ).rejects.toEqual({ code: "23503", message: "fk violation" });
    });
  });

  // =========================================================================
  // updateRoutineExercise
  // =========================================================================

  describe("updateRoutineExercise", () => {
    it("updates routine exercise and returns row", async () => {
      const updated = { id: "re1", target_sets: 4, target_reps: 10 };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateRoutineExercise("re1", {
        target_sets: 4,
        target_reps: 10,
      });

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routine_exercises");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        target_sets: 4,
        target_reps: 10,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "re1");
    });

    it("supports sort_order updates (reorder)", async () => {
      mockSupabaseClient.setMockResponse({ id: "re1", sort_order: 98304 });

      await db.updateRoutineExercise("re1", { sort_order: 98304 });

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        sort_order: 98304,
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateRoutineExercise("re1", { target_sets: 4 })
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // removeRoutineExercise
  // =========================================================================

  describe("removeRoutineExercise", () => {
    it("deletes routine exercise by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.removeRoutineExercise("re1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("routine_exercises");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "re1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.removeRoutineExercise("re1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
