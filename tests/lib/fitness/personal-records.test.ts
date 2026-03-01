import { describe, it, expect } from "vitest";
import {
  computePersonalRecords,
  isNewPR,
} from "@/lib/fitness/personal-records";
import type { WorkoutSet } from "@/lib/db/types";

const makeSet = (
  overrides: Partial<WorkoutSet & { workout_started_at: string }> = {}
): WorkoutSet & { workout_started_at: string } => ({
  id: "set-1",
  workout_exercise_id: "we-1",
  set_number: 1,
  set_type: "normal",
  weight_kg: null,
  reps: null,
  duration_seconds: null,
  distance_meters: null,
  rpe: null,
  is_completed: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  workout_started_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("computePersonalRecords", () => {
  describe("empty sets", () => {
    it("returns all-null PRs when given an empty array", () => {
      const result = computePersonalRecords("ex-1", []);
      expect(result).toEqual({
        exercise_id: "ex-1",
        best_weight_kg: null,
        best_reps: null,
        best_volume: null,
        best_duration_seconds: null,
        achieved_at: null,
      });
    });
  });

  describe("filtering: only completed normal sets count", () => {
    it("ignores warmup sets", () => {
      const sets = [
        makeSet({ set_type: "warmup", weight_kg: 100, reps: 5, is_completed: true }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBeNull();
      expect(result.best_reps).toBeNull();
      expect(result.best_volume).toBeNull();
      expect(result.achieved_at).toBeNull();
    });

    it("ignores drop sets", () => {
      const sets = [
        makeSet({ set_type: "drop", weight_kg: 80, reps: 10, is_completed: true }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBeNull();
      expect(result.best_reps).toBeNull();
      expect(result.achieved_at).toBeNull();
    });

    it("ignores failure sets", () => {
      const sets = [
        makeSet({ set_type: "failure", weight_kg: 120, reps: 3, is_completed: true }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBeNull();
      expect(result.best_reps).toBeNull();
      expect(result.achieved_at).toBeNull();
    });

    it("ignores non-completed sets", () => {
      const sets = [
        makeSet({ set_type: "normal", weight_kg: 100, reps: 5, is_completed: false }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBeNull();
      expect(result.best_reps).toBeNull();
      expect(result.achieved_at).toBeNull();
    });

    it("ignores non-completed normal sets but counts completed normal sets", () => {
      const sets = [
        makeSet({
          id: "set-1",
          set_type: "normal",
          weight_kg: 200,
          reps: 1,
          is_completed: false,
          workout_started_at: "2026-01-02T00:00:00Z",
        }),
        makeSet({
          id: "set-2",
          set_type: "normal",
          weight_kg: 100,
          reps: 5,
          is_completed: true,
          workout_started_at: "2026-01-01T00:00:00Z",
        }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBe(100);
      expect(result.best_reps).toBe(5);
    });
  });

  describe("single set", () => {
    it("returns correct best values from a single completed normal set with weight and reps", () => {
      const sets = [
        makeSet({
          weight_kg: 80,
          reps: 10,
          workout_started_at: "2026-01-15T10:00:00Z",
        }),
      ];
      const result = computePersonalRecords("ex-2", sets);
      expect(result.exercise_id).toBe("ex-2");
      expect(result.best_weight_kg).toBe(80);
      expect(result.best_reps).toBe(10);
      expect(result.best_volume).toBe(800); // 80 * 10
      expect(result.best_duration_seconds).toBeNull();
      expect(result.achieved_at).toBe("2026-01-15T10:00:00Z");
    });

    it("returns correct best_duration_seconds from a single completed normal duration set", () => {
      const sets = [
        makeSet({
          duration_seconds: 120,
          workout_started_at: "2026-02-01T08:00:00Z",
        }),
      ];
      const result = computePersonalRecords("ex-3", sets);
      expect(result.best_duration_seconds).toBe(120);
      expect(result.achieved_at).toBe("2026-02-01T08:00:00Z");
    });

    it("returns null volume when only reps is set but weight is null", () => {
      const sets = [
        makeSet({ reps: 20, weight_kg: null }),
      ];
      const result = computePersonalRecords("ex-4", sets);
      expect(result.best_reps).toBe(20);
      expect(result.best_volume).toBeNull();
    });

    it("returns null volume when only weight is set but reps is null", () => {
      const sets = [
        makeSet({ weight_kg: 60, reps: null }),
      ];
      const result = computePersonalRecords("ex-5", sets);
      expect(result.best_weight_kg).toBe(60);
      expect(result.best_volume).toBeNull();
    });
  });

  describe("multiple sets", () => {
    it("picks max weight_kg across multiple sets", () => {
      const sets = [
        makeSet({ id: "set-1", weight_kg: 60, reps: 8, workout_started_at: "2026-01-01T00:00:00Z" }),
        makeSet({ id: "set-2", weight_kg: 100, reps: 5, workout_started_at: "2026-01-02T00:00:00Z" }),
        makeSet({ id: "set-3", weight_kg: 80, reps: 6, workout_started_at: "2026-01-03T00:00:00Z" }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBe(100);
    });

    it("picks max reps across multiple sets", () => {
      const sets = [
        makeSet({ id: "set-1", reps: 5, weight_kg: 100, workout_started_at: "2026-01-01T00:00:00Z" }),
        makeSet({ id: "set-2", reps: 20, weight_kg: 40, workout_started_at: "2026-01-02T00:00:00Z" }),
        makeSet({ id: "set-3", reps: 12, weight_kg: 70, workout_started_at: "2026-01-03T00:00:00Z" }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_reps).toBe(20);
    });

    it("picks max volume across multiple sets", () => {
      const sets = [
        makeSet({ id: "set-1", weight_kg: 100, reps: 5, workout_started_at: "2026-01-01T00:00:00Z" }),  // vol = 500
        makeSet({ id: "set-2", weight_kg: 60, reps: 12, workout_started_at: "2026-01-02T00:00:00Z" }),  // vol = 720
        makeSet({ id: "set-3", weight_kg: 80, reps: 8, workout_started_at: "2026-01-03T00:00:00Z" }),   // vol = 640
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_volume).toBe(720);
    });

    it("picks max duration_seconds across multiple sets", () => {
      const sets = [
        makeSet({ id: "set-1", duration_seconds: 30, workout_started_at: "2026-01-01T00:00:00Z" }),
        makeSet({ id: "set-2", duration_seconds: 90, workout_started_at: "2026-01-02T00:00:00Z" }),
        makeSet({ id: "set-3", duration_seconds: 60, workout_started_at: "2026-01-03T00:00:00Z" }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_duration_seconds).toBe(90);
    });

    it("achieved_at comes from the set with the best value (not necessarily the most recent)", () => {
      const sets = [
        makeSet({ id: "set-1", weight_kg: 100, reps: 5, workout_started_at: "2026-01-10T00:00:00Z" }),
        makeSet({ id: "set-2", weight_kg: 120, reps: 3, workout_started_at: "2026-01-05T00:00:00Z" }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBe(120);
      expect(result.achieved_at).toBe("2026-01-05T00:00:00Z");
    });

    it("mixed valid and invalid sets: only counts completed normal sets", () => {
      const sets = [
        makeSet({ id: "set-1", set_type: "warmup", weight_kg: 200, reps: 1, is_completed: true }),
        makeSet({ id: "set-2", set_type: "normal", weight_kg: 80, reps: 8, is_completed: true }),
        makeSet({ id: "set-3", set_type: "normal", weight_kg: 90, reps: 5, is_completed: false }),
        makeSet({ id: "set-4", set_type: "drop", weight_kg: 150, reps: 3, is_completed: true }),
        makeSet({ id: "set-5", set_type: "failure", weight_kg: 100, reps: 2, is_completed: true }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_weight_kg).toBe(80);
      expect(result.best_reps).toBe(8);
    });
  });

  describe("volume calculation", () => {
    it("computes volume as weight_kg * reps", () => {
      const sets = [
        makeSet({ weight_kg: 75, reps: 8 }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_volume).toBe(600); // 75 * 8
    });

    it("returns null volume when both weight and reps are null", () => {
      const sets = [
        makeSet({ duration_seconds: 60 }),
      ];
      const result = computePersonalRecords("ex-1", sets);
      expect(result.best_volume).toBeNull();
    });
  });
});

describe("isNewPR", () => {
  const makeWorkoutSet = (overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
    id: "set-1",
    workout_exercise_id: "we-1",
    set_number: 1,
    set_type: "normal",
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    is_completed: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  const makeCurrentPR = (overrides: Partial<{
    exercise_id: string;
    best_weight_kg: number | null;
    best_reps: number | null;
    best_volume: number | null;
    best_duration_seconds: number | null;
    achieved_at: string | null;
  }> = {}) => ({
    exercise_id: "ex-1",
    best_weight_kg: null,
    best_reps: null,
    best_volume: null,
    best_duration_seconds: null,
    achieved_at: null,
    ...overrides,
  });

  describe("non-completed set → no PRs", () => {
    it("returns all false for a non-completed set regardless of type", () => {
      const set = makeWorkoutSet({ weight_kg: 200, reps: 10, is_completed: false });
      const result = isNewPR(set, "weight_reps", null);
      expect(result.isWeightPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
      expect(result.isRepsPR).toBe(false);
      expect(result.isDurationPR).toBe(false);
    });

    it("returns all false for non-completed duration set", () => {
      const set = makeWorkoutSet({ duration_seconds: 300, is_completed: false });
      const result = isNewPR(set, "duration", null);
      expect(result.isDurationPR).toBe(false);
    });
  });

  describe("null currentPR (first-ever set) → all relevant fields are true", () => {
    it("weight_reps type with null currentPR: weight, volume, reps all true", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 10, is_completed: true });
      const result = isNewPR(set, "weight_reps", null);
      expect(result.isWeightPR).toBe(true);
      expect(result.isVolumePR).toBe(true);
      expect(result.isRepsPR).toBe(true);
      expect(result.isDurationPR).toBe(false);
    });

    it("bodyweight_reps type with null currentPR: only reps true", () => {
      const set = makeWorkoutSet({ reps: 15, is_completed: true });
      const result = isNewPR(set, "bodyweight_reps", null);
      expect(result.isRepsPR).toBe(true);
      expect(result.isWeightPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
      expect(result.isDurationPR).toBe(false);
    });

    it("duration type with null currentPR: only duration true", () => {
      const set = makeWorkoutSet({ duration_seconds: 120, is_completed: true });
      const result = isNewPR(set, "duration", null);
      expect(result.isDurationPR).toBe(true);
      expect(result.isWeightPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
      expect(result.isRepsPR).toBe(false);
    });

    it("duration_weight type with null currentPR: weight and duration true", () => {
      const set = makeWorkoutSet({ weight_kg: 20, duration_seconds: 60, is_completed: true });
      const result = isNewPR(set, "duration_weight", null);
      expect(result.isWeightPR).toBe(true);
      expect(result.isDurationPR).toBe(true);
      expect(result.isRepsPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
    });

    it("weighted_bodyweight type with null currentPR: weight, volume, reps all true", () => {
      const set = makeWorkoutSet({ weight_kg: 20, reps: 10, is_completed: true });
      const result = isNewPR(set, "weighted_bodyweight", null);
      expect(result.isWeightPR).toBe(true);
      expect(result.isVolumePR).toBe(true);
      expect(result.isRepsPR).toBe(true);
      expect(result.isDurationPR).toBe(false);
    });

    it("assisted_bodyweight type with null currentPR: weight and reps true", () => {
      const set = makeWorkoutSet({ weight_kg: 10, reps: 8, is_completed: true });
      const result = isNewPR(set, "assisted_bodyweight", null);
      expect(result.isRepsPR).toBe(true);
    });

    it("distance_duration type with null currentPR: duration true", () => {
      const set = makeWorkoutSet({ duration_seconds: 180, distance_meters: 1000, is_completed: true });
      const result = isNewPR(set, "distance_duration", null);
      expect(result.isDurationPR).toBe(true);
    });
  });

  describe("weight_reps exercise type", () => {
    it("detects new weight PR when set weight exceeds current best", () => {
      const set = makeWorkoutSet({ weight_kg: 110, reps: 5 });
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 8, best_volume: 800 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isWeightPR).toBe(true);
    });

    it("does NOT detect weight PR when set weight equals current best (uses >)", () => {
      const set = makeWorkoutSet({ weight_kg: 100, reps: 5 });
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 8, best_volume: 800 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isWeightPR).toBe(false);
    });

    it("does NOT detect weight PR when set weight is below current best", () => {
      const set = makeWorkoutSet({ weight_kg: 90, reps: 5 });
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 3, best_volume: 300 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isWeightPR).toBe(false);
    });

    it("detects new reps PR when set reps exceeds current best", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 15 });
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 12, best_volume: 960 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isRepsPR).toBe(true);
    });

    it("does NOT detect reps PR when set reps equals current best (uses >)", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 12 });
      const pr = makeCurrentPR({ best_reps: 12 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isRepsPR).toBe(false);
    });

    it("detects new volume PR when set volume (weight*reps) exceeds current best volume", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 10 }); // volume = 800
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 5, best_volume: 700 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isVolumePR).toBe(true);
    });

    it("does NOT detect volume PR when set volume equals current best (uses >)", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 10 }); // volume = 800
      const pr = makeCurrentPR({ best_volume: 800 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isVolumePR).toBe(false);
    });

    it("does NOT check duration for weight_reps type", () => {
      const set = makeWorkoutSet({ weight_kg: 80, reps: 10, duration_seconds: 999 });
      const pr = makeCurrentPR({ best_duration_seconds: 10 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isDurationPR).toBe(false);
    });

    it("returns all false when set has null weight and reps against existing PRs", () => {
      const set = makeWorkoutSet({ weight_kg: null, reps: null });
      const pr = makeCurrentPR({ best_weight_kg: 100, best_reps: 5, best_volume: 500 });
      const result = isNewPR(set, "weight_reps", pr);
      expect(result.isWeightPR).toBe(false);
      expect(result.isRepsPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
    });
  });

  describe("bodyweight_reps exercise type", () => {
    it("detects new reps PR when set reps exceeds current best", () => {
      const set = makeWorkoutSet({ reps: 25 });
      const pr = makeCurrentPR({ best_reps: 20 });
      const result = isNewPR(set, "bodyweight_reps", pr);
      expect(result.isRepsPR).toBe(true);
    });

    it("does NOT check weight for bodyweight_reps type", () => {
      const set = makeWorkoutSet({ reps: 25, weight_kg: 999 });
      const pr = makeCurrentPR({ best_reps: 20, best_weight_kg: 10 });
      const result = isNewPR(set, "bodyweight_reps", pr);
      expect(result.isWeightPR).toBe(false);
    });

    it("does NOT check volume for bodyweight_reps type", () => {
      const set = makeWorkoutSet({ reps: 25 });
      const pr = makeCurrentPR({ best_reps: 20, best_volume: 100 });
      const result = isNewPR(set, "bodyweight_reps", pr);
      expect(result.isVolumePR).toBe(false);
    });

    it("does NOT check duration for bodyweight_reps type", () => {
      const set = makeWorkoutSet({ reps: 25, duration_seconds: 999 });
      const pr = makeCurrentPR({ best_reps: 20, best_duration_seconds: 10 });
      const result = isNewPR(set, "bodyweight_reps", pr);
      expect(result.isDurationPR).toBe(false);
    });

    it("does NOT detect reps PR when equal (uses >)", () => {
      const set = makeWorkoutSet({ reps: 20 });
      const pr = makeCurrentPR({ best_reps: 20 });
      const result = isNewPR(set, "bodyweight_reps", pr);
      expect(result.isRepsPR).toBe(false);
    });
  });

  describe("duration exercise type", () => {
    it("detects new duration PR when set duration exceeds current best", () => {
      const set = makeWorkoutSet({ duration_seconds: 180 });
      const pr = makeCurrentPR({ best_duration_seconds: 120 });
      const result = isNewPR(set, "duration", pr);
      expect(result.isDurationPR).toBe(true);
    });

    it("does NOT detect duration PR when equal (uses >)", () => {
      const set = makeWorkoutSet({ duration_seconds: 120 });
      const pr = makeCurrentPR({ best_duration_seconds: 120 });
      const result = isNewPR(set, "duration", pr);
      expect(result.isDurationPR).toBe(false);
    });

    it("does NOT detect duration PR when less than current best", () => {
      const set = makeWorkoutSet({ duration_seconds: 60 });
      const pr = makeCurrentPR({ best_duration_seconds: 120 });
      const result = isNewPR(set, "duration", pr);
      expect(result.isDurationPR).toBe(false);
    });

    it("does NOT check weight, reps, or volume for duration type", () => {
      const set = makeWorkoutSet({ duration_seconds: 180, weight_kg: 999, reps: 999 });
      const pr = makeCurrentPR({ best_duration_seconds: 120, best_weight_kg: 10, best_reps: 10, best_volume: 100 });
      const result = isNewPR(set, "duration", pr);
      expect(result.isWeightPR).toBe(false);
      expect(result.isRepsPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns all false when currentPR is null but set values are null (weight_reps type)", () => {
      const set = makeWorkoutSet({ weight_kg: null, reps: null, is_completed: true });
      const result = isNewPR(set, "weight_reps", null);
      expect(result.isWeightPR).toBe(false);
      expect(result.isRepsPR).toBe(false);
      expect(result.isVolumePR).toBe(false);
      expect(result.isDurationPR).toBe(false);
    });

    it("returns all false when currentPR is null but duration is null (duration type)", () => {
      const set = makeWorkoutSet({ duration_seconds: null, is_completed: true });
      const result = isNewPR(set, "duration", null);
      expect(result.isDurationPR).toBe(false);
    });

    it("handles weight_distance type set — checks weight", () => {
      const set = makeWorkoutSet({ weight_kg: 50, is_completed: true });
      const result = isNewPR(set, "weight_distance", null);
      expect(result.isWeightPR).toBe(true);
    });
  });
});
