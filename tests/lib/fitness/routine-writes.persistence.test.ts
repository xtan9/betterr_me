import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getRoutine: vi.fn(),
  createRoutine: vi.fn(),
  updateRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  getRoutineExercise: vi.fn(),
  addExerciseToRoutine: vi.fn(),
  updateRoutineExercise: vi.fn(),
  removeRoutineExercise: vi.fn(),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getRoutine = mocks.getRoutine;
    createRoutine = mocks.createRoutine;
    updateRoutine = mocks.updateRoutine;
    deleteRoutine = mocks.deleteRoutine;
    getRoutineExercise = mocks.getRoutineExercise;
    addExerciseToRoutine = mocks.addExerciseToRoutine;
    updateRoutineExercise = mocks.updateRoutineExercise;
    removeRoutineExercise = mocks.removeRoutineExercise;
  },
}));

import { createRoutineWrites } from "@/lib/fitness/routine-writes";

describe("createRoutineWrites persistence adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRoutine.mockResolvedValue({ id: "routine-1", exercises: [] });
    mocks.createRoutine.mockResolvedValue({ id: "routine-1" });
  });

  it("uses the domain factory to keep routine creation behind one adapter", async () => {
    const writes = createRoutineWrites({} as SupabaseClient);

    await expect(
      writes.create({
        userId: "trusted-user",
        name: "Push Day",
      }),
    ).resolves.toEqual({
      type: "created",
      routine: { id: "routine-1" },
    });
    expect(mocks.createRoutine).toHaveBeenCalledWith("trusted-user", {
      name: "Push Day",
      notes: undefined,
    });
  });

  it("translates domain exercise input before calling persistence", async () => {
    mocks.getRoutine.mockResolvedValue({ id: "routine-1", exercises: [] });
    mocks.addExerciseToRoutine.mockResolvedValue({ id: "exercise-1" });
    const writes = createRoutineWrites({} as SupabaseClient);

    await expect(
      writes.addExercise({
        userId: "trusted-user",
        routineId: "routine-1",
        exercise: {
          exerciseId: "exercise-1",
          targetSets: 4,
          targetReps: 8,
          targetWeightKg: 80,
          restTimerSeconds: 120,
        },
      }),
    ).resolves.toEqual({
      type: "added",
      exercise: { id: "exercise-1" },
    });
    expect(mocks.addExerciseToRoutine).toHaveBeenCalledWith("routine-1", {
      exercise_id: "exercise-1",
      target_sets: 4,
      target_reps: 8,
      target_weight_kg: 80,
      target_duration_seconds: undefined,
      target_distance_meters: undefined,
      rest_timer_seconds: 120,
      notes: undefined,
    });
  });
});
