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
  // getWorkoutWithExercises — reshape + sort
  // ===========================================================================
  describe("getWorkoutWithExercises", () => {
    it("should reshape nested workout_exercises into exercises with sorted sets", async () => {
      const mockData = {
        id: "w-1",
        title: "Pull Day",
        status: "completed",
        workout_exercises: [
          {
            id: "we-1",
            sort_order: 0,
            exercise: { id: "ex-1", name: "Deadlift" },
            sets: [
              { id: "s-2", set_number: 2, weight_kg: 100 },
              { id: "s-1", set_number: 1, weight_kg: 80 },
              { id: "s-3", set_number: 3, weight_kg: 120 },
            ],
          },
        ],
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockData,
        error: null,
      });

      const result = await workoutsDB.getWorkoutWithExercises("w-1");
      expect(result).not.toBeNull();
      expect(result!.exercises).toHaveLength(1);
      expect(result!.exercises[0].exercise.name).toBe("Deadlift");
      // Sets should be sorted by set_number ascending
      expect(result!.exercises[0].sets[0].set_number).toBe(1);
      expect(result!.exercises[0].sets[1].set_number).toBe(2);
      expect(result!.exercises[0].sets[2].set_number).toBe(3);
    });

    it("should return null when workout not found (PGRST116)", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await workoutsDB.getWorkoutWithExercises("w-nonexistent");
      expect(result).toBeNull();
    });

    it("should throw on non-PGRST116 errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST301", message: "internal error" },
      });

      await expect(
        workoutsDB.getWorkoutWithExercises("w-1")
      ).rejects.toEqual({ code: "PGRST301", message: "internal error" });
    });

    it("should handle workout_exercises being empty", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: "w-1",
          title: "Empty Workout",
          workout_exercises: [],
        },
        error: null,
      });

      const result = await workoutsDB.getWorkoutWithExercises("w-1");
      expect(result!.exercises).toEqual([]);
    });
  });

  // ===========================================================================
  // getWorkoutsWithSummary — volume/set aggregation
  // ===========================================================================
  describe("getWorkoutsWithSummary", () => {
    it("should compute correct totalVolume from completed sets only", async () => {
      const mockData = [
        {
          id: "w-1",
          title: "Push Day",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: { name: "Bench Press" },
              sets: [
                { weight_kg: 80, reps: 10, is_completed: true, set_type: "normal" },
                { weight_kg: 60, reps: 8, is_completed: true, set_type: "normal" },
                { weight_kg: 100, reps: 5, is_completed: false, set_type: "normal" },
              ],
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getWorkoutsWithSummary(userId);
      expect(result).toHaveLength(1);
      // Only completed sets: 80*10 + 60*8 = 1280
      expect(result[0].totalVolume).toBe(1280);
      // Only 2 completed sets
      expect(result[0].totalSets).toBe(2);
      expect(result[0].exerciseCount).toBe(1);
      expect(result[0].exerciseNames).toEqual(["Bench Press"]);
    });

    it("should handle exercises with null names gracefully", async () => {
      const mockData = [
        {
          id: "w-1",
          title: "Workout",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: null,
              sets: [],
            },
            {
              id: "we-2",
              exercise: { name: "Squat" },
              sets: [],
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getWorkoutsWithSummary(userId);
      // Null exercise should be filtered out
      expect(result[0].exerciseNames).toEqual(["Squat"]);
      expect(result[0].exerciseCount).toBe(2);
    });

    it("should return 0 totalVolume when no completed sets", async () => {
      const mockData = [
        {
          id: "w-1",
          title: "Empty",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: { name: "Curl" },
              sets: [
                { weight_kg: 20, reps: 10, is_completed: false, set_type: "normal" },
              ],
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getWorkoutsWithSummary(userId);
      expect(result[0].totalVolume).toBe(0);
      expect(result[0].totalSets).toBe(0);
    });

    it("should handle null weight/reps in volume calculation", async () => {
      const mockData = [
        {
          id: "w-1",
          title: "Cardio",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: { name: "Running" },
              sets: [
                { weight_kg: null, reps: null, is_completed: true, set_type: "normal" },
              ],
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getWorkoutsWithSummary(userId);
      // null weight and reps should default to 0 => 0*0 = 0
      expect(result[0].totalVolume).toBe(0);
      expect(result[0].totalSets).toBe(1);
    });
  });

  // ===========================================================================
  // getPreviousSets — most-recent workout sort
  // ===========================================================================
  describe("getPreviousSets", () => {
    it("should return sets from the most recent completed workout", async () => {
      const mockData = [
        {
          workout_id: "w-older",
          workout: { started_at: "2026-02-20T10:00:00Z", status: "completed" },
          sets: [
            { id: "s-old-1", set_number: 1, weight_kg: 60 },
          ],
        },
        {
          workout_id: "w-newest",
          workout: { started_at: "2026-02-28T10:00:00Z", status: "completed" },
          sets: [
            { id: "s-new-2", set_number: 2, weight_kg: 85 },
            { id: "s-new-1", set_number: 1, weight_kg: 80 },
          ],
        },
        {
          workout_id: "w-middle",
          workout: { started_at: "2026-02-24T10:00:00Z", status: "completed" },
          sets: [
            { id: "s-mid-1", set_number: 1, weight_kg: 70 },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getPreviousSets("ex-1");
      // Should return sets from w-newest (most recent by started_at)
      expect(result).toHaveLength(2);
      // Sets should be sorted by set_number
      expect(result[0].set_number).toBe(1);
      expect(result[1].set_number).toBe(2);
    });

    it("should return empty array when no previous completed workouts exist", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await workoutsDB.getPreviousSets("ex-1");
      expect(result).toEqual([]);
    });

    it("should throw on database error", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getPreviousSets("ex-1")).rejects.toEqual(dbError);
    });
  });

  // ===========================================================================
  // getExerciseSets — completed normal filter
  // ===========================================================================
  describe("getExerciseSets", () => {
    it("should return only completed normal sets with workout_started_at", async () => {
      const mockData = [
        {
          workout: { started_at: "2026-02-28T10:00:00Z", status: "completed", user_id: userId },
          sets: [
            { id: "s-1", is_completed: true, set_type: "normal", weight_kg: 80, reps: 10 },
            { id: "s-2", is_completed: true, set_type: "warmup", weight_kg: 40, reps: 10 },
            { id: "s-3", is_completed: false, set_type: "normal", weight_kg: 100, reps: 5 },
            { id: "s-4", is_completed: true, set_type: "drop", weight_kg: 60, reps: 12 },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getExerciseSets("ex-1", userId);
      // Only s-1 is completed + normal
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("s-1");
      expect(result[0].workout_started_at).toBe("2026-02-28T10:00:00Z");
    });

    it("should aggregate sets from multiple workouts", async () => {
      const mockData = [
        {
          workout: { started_at: "2026-02-20T10:00:00Z", status: "completed", user_id: userId },
          sets: [
            { id: "s-1", is_completed: true, set_type: "normal", weight_kg: 80, reps: 10 },
          ],
        },
        {
          workout: { started_at: "2026-02-28T10:00:00Z", status: "completed", user_id: userId },
          sets: [
            { id: "s-2", is_completed: true, set_type: "normal", weight_kg: 90, reps: 8 },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getExerciseSets("ex-1", userId);
      expect(result).toHaveLength(2);
      expect(result[0].workout_started_at).toBe("2026-02-20T10:00:00Z");
      expect(result[1].workout_started_at).toBe("2026-02-28T10:00:00Z");
    });

    it("should return empty array when no sets exist", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await workoutsDB.getExerciseSets("ex-1", userId);
      expect(result).toEqual([]);
    });

    it("should throw on database error", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getExerciseSets("ex-1", userId)).rejects.toEqual(dbError);
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
