import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkoutsDB } from "@/lib/db/workouts";
import { mockSupabaseClient } from "../../setup";

describe("WorkoutsDB", () => {
  let workoutsDB: WorkoutsDB;
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    workoutsDB = new WorkoutsDB(mockSupabaseClient as any);
  });

  // ===========================================================================
  // startWorkout
  // ===========================================================================
  describe("startWorkout", () => {
    it("should create a new in_progress workout", async () => {
      const workout = {
        id: "w-1",
        user_id: userId,
        title: "Workout",
        status: "in_progress",
        started_at: expect.any(String),
      };
      mockSupabaseClient.setMockResponse(workout);

      const result = await workoutsDB.startWorkout(userId, {});
      expect(result).toEqual(workout);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("workouts");
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it("should use provided title", async () => {
      mockSupabaseClient.setMockResponse({ id: "w-1", title: "Leg Day" });

      const result = await workoutsDB.startWorkout(userId, {
        title: "Leg Day",
      });
      expect(result.title).toBe("Leg Day");
    });

    it("should throw descriptive error with code 23505 on duplicate active workout", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "23505", message: "duplicate" });

      await expect(workoutsDB.startWorkout(userId, {})).rejects.toThrow(
        "You already have an active workout"
      );

      try {
        mockSupabaseClient.setMockResponse(null, { code: "23505", message: "duplicate" });
        await workoutsDB.startWorkout(userId, {});
      } catch (err: any) {
        expect(err.code).toBe("23505");
      }
    });

    it("should throw original error for non-23505 errors", async () => {
      const dbError = { code: "42P01", message: "table not found" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.startWorkout(userId, {})).rejects.toEqual(dbError);
    });
  });

  // ===========================================================================
  // getActiveWorkout
  // ===========================================================================
  describe("getActiveWorkout", () => {
    it("should return null when no active workout (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await workoutsDB.getActiveWorkout(userId);
      expect(result).toBeNull();
    });

    it("should throw on non-PGRST116 errors", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getActiveWorkout(userId)).rejects.toEqual(dbError);
    });
  });

  // ===========================================================================
  // updateWorkout — status transitions (CRITICAL)
  // ===========================================================================
  describe("updateWorkout", () => {
    it("should allow in_progress -> completed and compute duration", async () => {
      // First call: fetch current status
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { status: "in_progress", started_at: "2026-02-28T10:00:00Z" },
          error: null,
        })
        // Second call: update returns the workout
        .mockResolvedValueOnce({
          data: {
            id: "w-1",
            status: "completed",
            completed_at: expect.any(String),
            duration_seconds: expect.any(Number),
          },
          error: null,
        });

      const result = await workoutsDB.updateWorkout("w-1", {
        status: "completed",
      });
      expect(result.status).toBe("completed");
      expect(result.completed_at).toBeDefined();
      expect(result.duration_seconds).toBeDefined();

      // Verify update was called with completed_at and duration_seconds
      const updateCall = mockSupabaseClient.update.mock.calls[0][0];
      expect(updateCall.status).toBe("completed");
      expect(updateCall.completed_at).toBeDefined();
      expect(typeof updateCall.duration_seconds).toBe("number");
      expect(updateCall.duration_seconds).toBeGreaterThanOrEqual(0);
    });

    it("should allow in_progress -> discarded", async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: { status: "in_progress", started_at: "2026-02-28T10:00:00Z" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: "w-1", status: "discarded" },
          error: null,
        });

      const result = await workoutsDB.updateWorkout("w-1", {
        status: "discarded",
      });
      expect(result.status).toBe("discarded");
    });

    it("should reject completed -> completed", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { status: "completed", started_at: "2026-02-28T10:00:00Z" },
        error: null,
      });

      await expect(
        workoutsDB.updateWorkout("w-1", { status: "completed" })
      ).rejects.toThrow("Invalid status transition: completed → completed");
    });

    it("should reject completed -> in_progress", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { status: "completed", started_at: "2026-02-28T10:00:00Z" },
        error: null,
      });

      await expect(
        workoutsDB.updateWorkout("w-1", { status: "in_progress" })
      ).rejects.toThrow("Invalid status transition: completed → in_progress");
    });

    it("should reject discarded -> completed", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { status: "discarded", started_at: "2026-02-28T10:00:00Z" },
        error: null,
      });

      await expect(
        workoutsDB.updateWorkout("w-1", { status: "completed" })
      ).rejects.toThrow("Invalid status transition: discarded → completed");
    });

    it("should reject discarded -> in_progress", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { status: "discarded", started_at: "2026-02-28T10:00:00Z" },
        error: null,
      });

      await expect(
        workoutsDB.updateWorkout("w-1", { status: "in_progress" })
      ).rejects.toThrow("Invalid status transition: discarded → in_progress");
    });

    it("should allow title/notes update without status change", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "w-1", title: "New Title", notes: "Notes" },
        error: null,
      });

      const result = await workoutsDB.updateWorkout("w-1", {
        title: "New Title",
        notes: "Notes",
      });
      expect(result.title).toBe("New Title");
      // Should not fetch current status when no status change
      expect(mockSupabaseClient.single).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // getLastCompletedAt
  // ===========================================================================
  describe("getLastCompletedAt", () => {
    it("should return null when no completed workouts", async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await workoutsDB.getLastCompletedAt(userId);
      expect(result).toBeNull();
    });

    it("should return the completed_at timestamp", async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { completed_at: "2026-02-28T12:00:00Z" },
        error: null,
      });

      const result = await workoutsDB.getLastCompletedAt(userId);
      expect(result).toBe("2026-02-28T12:00:00Z");
    });
  });

  // ===========================================================================
  // getWeekWorkoutCount
  // ===========================================================================
  describe("getWeekWorkoutCount", () => {
    it("should return count", async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      const result = await workoutsDB.getWeekWorkoutCount(userId, "2026-02-23");
      expect(result).toBe(3);
      // Should append T00:00:00 to bare date
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "started_at",
        "2026-02-23T00:00:00"
      );
    });

    it("should not append T00:00:00 if date already has time component", async () => {
      mockSupabaseClient.setMockResponse(null, null, 5);

      await workoutsDB.getWeekWorkoutCount(userId, "2026-02-23T06:00:00");
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "started_at",
        "2026-02-23T06:00:00"
      );
    });

    it("should return 0 when count is null", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const result = await workoutsDB.getWeekWorkoutCount(userId, "2026-02-23");
      expect(result).toBe(0);
    });
  });

  // ===========================================================================
  // getExerciseHistory — zero weight fix verification
  // ===========================================================================
  describe("getExerciseHistory", () => {
    it("should preserve zero weight values (not nullify them)", async () => {
      // Simulate completed normal sets with 0 weight (bodyweight exercises)
      const mockData = [
        {
          workout_id: "w-1",
          sets: [
            { weight_kg: 0, reps: 10, duration_seconds: null, is_completed: true, set_type: "normal" },
            { weight_kg: 0, reps: 12, duration_seconds: null, is_completed: true, set_type: "normal" },
          ],
          workout: { id: "w-1", started_at: "2026-02-28T10:00:00Z" },
        },
      ];

      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getExerciseHistory("ex-1", userId);
      // After the falsy bug fix, 0 weight should NOT be null
      expect(result[0].best_set_weight_kg).toBe(0);
      expect(result[0].best_set_reps).toBe(12);
      expect(result[0].total_volume).toBe(0); // 0 * 10 + 0 * 12 = 0, but should not be null
    });

    it("should return null for weight when all sets have null weight", async () => {
      const mockData = [
        {
          workout_id: "w-1",
          sets: [
            { weight_kg: null, reps: 10, duration_seconds: 60, is_completed: true, set_type: "normal" },
          ],
          workout: { id: "w-1", started_at: "2026-02-28T10:00:00Z" },
        },
      ];

      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getExerciseHistory("ex-1", userId);
      expect(result[0].best_set_weight_kg).toBeNull();
      expect(result[0].best_set_reps).toBe(10);
    });

    it("should only count completed normal sets", async () => {
      const mockData = [
        {
          workout_id: "w-1",
          sets: [
            { weight_kg: 100, reps: 5, duration_seconds: null, is_completed: true, set_type: "warmup" },
            { weight_kg: 80, reps: 8, duration_seconds: null, is_completed: true, set_type: "normal" },
            { weight_kg: 90, reps: 6, duration_seconds: null, is_completed: false, set_type: "normal" },
          ],
          workout: { id: "w-1", started_at: "2026-02-28T10:00:00Z" },
        },
      ];

      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getExerciseHistory("ex-1", userId);
      // Only the one completed normal set (80kg x 8) should count
      expect(result[0].best_set_weight_kg).toBe(80);
      expect(result[0].best_set_reps).toBe(8);
      expect(result[0].total_sets).toBe(1);
    });
  });
});
