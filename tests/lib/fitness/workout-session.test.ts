import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveWorkoutToStorage,
  loadWorkoutFromStorage,
  clearWorkoutStorage,
  STORAGE_KEY,
} from "@/lib/fitness/workout-session";
import type { WorkoutWithExercises } from "@/lib/db/types";

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// --- Helpers ---

function makeWorkout(): WorkoutWithExercises {
  return {
    id: "w-1",
    user_id: "user-123",
    title: "Test Workout",
    started_at: "2026-02-28T10:00:00Z",
    completed_at: null,
    duration_seconds: null,
    status: "in_progress",
    notes: null,
    routine_id: null,
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
    exercises: [
      {
        id: "we-1",
        workout_id: "w-1",
        exercise_id: "ex-1",
        sort_order: 1,
        notes: null,
        rest_timer_seconds: 90,
        created_at: "2026-02-28T10:00:00Z",
        exercise: {
          id: "ex-1",
          user_id: null,
          name: "Bench Press",
          muscle_group_primary: "chest",
          muscle_groups_secondary: [],
          equipment: "barbell",
          exercise_type: "weight_reps",
          is_custom: false,
          created_at: "2026-02-28T10:00:00Z",
          updated_at: "2026-02-28T10:00:00Z",
        },
        sets: [
          {
            id: "s-1",
            workout_exercise_id: "we-1",
            set_number: 1,
            set_type: "normal",
            weight_kg: 60,
            reps: 10,
            duration_seconds: null,
            distance_meters: null,
            is_completed: true,
            rpe: null,
            created_at: "2026-02-28T10:00:00Z",
            updated_at: "2026-02-28T10:00:00Z",
          },
        ],
      },
    ],
  };
}

// --- Tests ---

describe("workout-session localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("saveWorkoutToStorage", () => {
    it("stores workout as JSON", () => {
      const workout = makeWorkout();
      saveWorkoutToStorage(workout);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.id).toBe("w-1");
      expect(parsed.exercises).toHaveLength(1);
    });

    it("accepts superset types (e.g. ActiveWorkout with previousSets)", () => {
      const workout = {
        ...makeWorkout(),
        exercises: [
          {
            ...makeWorkout().exercises[0],
            previousSets: [],
          },
        ],
      };
      // Should not throw
      saveWorkoutToStorage(workout as WorkoutWithExercises & Record<string, unknown>);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();
    });
  });

  describe("loadWorkoutFromStorage", () => {
    it("returns parsed workout when valid data exists", () => {
      const workout = makeWorkout();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));

      const loaded = loadWorkoutFromStorage();
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("w-1");
      expect(loaded!.exercises).toHaveLength(1);
    });

    it("returns null when no data stored", () => {
      expect(loadWorkoutFromStorage()).toBeNull();
    });

    it("returns null and clears storage for invalid JSON shape (missing id)", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ exercises: [] }));

      expect(loadWorkoutFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns null and clears storage for invalid JSON shape (missing exercises array)", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "w-1" }));

      expect(loadWorkoutFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns null for corrupt JSON string", () => {
      localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");

      expect(loadWorkoutFromStorage()).toBeNull();
    });

    it("returns null for null value stored", () => {
      localStorage.setItem(STORAGE_KEY, "null");

      expect(loadWorkoutFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns null and clears storage when exercises have invalid structure", () => {
      // Exercises missing required nested fields (exercise.id, exercise.name, sets)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          id: "w-1",
          status: "in_progress",
          exercises: [{ id: "we-1" }],
        })
      );

      expect(loadWorkoutFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns null and clears when missing status field", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ id: "w-1", exercises: [] })
      );

      expect(loadWorkoutFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("clearWorkoutStorage", () => {
    it("removes the storage key", () => {
      localStorage.setItem(STORAGE_KEY, "test");
      clearWorkoutStorage();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not throw when key does not exist", () => {
      expect(() => clearWorkoutStorage()).not.toThrow();
    });
  });
});
