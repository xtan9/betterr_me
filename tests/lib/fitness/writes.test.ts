import { describe, expect, it, vi } from "vitest";
import type {
  RoutineWithExercises,
  Workout,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { UnsupportedRoutineDataError } from "@/lib/fitness/routine-workout-conversion";
import {
  WorkoutWrites,
  type WorkoutStartPersistence,
} from "@/lib/fitness/writes";

const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  log: { error: logError },
}));

const workout: Workout = {
  id: "workout-1",
  user_id: "user-1",
  title: "Morning workout",
  started_at: "2026-08-01T12:00:00.000Z",
  completed_at: null,
  duration_seconds: null,
  status: "in_progress",
  notes: null,
  routine_id: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const routine = {
  id: "routine-1",
  user_id: "user-1",
  name: "Push day",
  exercises: [],
} as unknown as RoutineWithExercises;

function makePersistence(
  overrides: Partial<WorkoutStartPersistence> = {},
): WorkoutStartPersistence {
  return {
    startBlank: vi.fn(async () => ({ type: "started" as const, workout })),
    getRoutine: vi.fn(async () => null),
    startRoutine: vi.fn(async () => ({
      type: "started" as const,
      workout: { ...workout, exercises: [] } as WorkoutWithExercises,
    })),
    markRoutinePerformed: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("WorkoutWrites.start", () => {
  it("starts a blank workout through a trusted-user request", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.start({
        userId: "user-1",
        source: { type: "blank", title: "  Morning workout  " },
      }),
    ).resolves.toEqual({ type: "started", workout });

    expect(persistence.startBlank).toHaveBeenCalledWith(
      "user-1",
      "Morning workout",
    );
    expect(persistence.getRoutine).not.toHaveBeenCalled();
  });

  it("starts a routine workout, preserves the complete presentation, and records use", async () => {
    const routineWorkout = {
      ...workout,
      title: "Push day",
      routine_id: "routine-1",
      exercises: [],
    } as WorkoutWithExercises;
    const persistence = makePersistence({
      getRoutine: vi.fn(async () => routine),
      startRoutine: vi.fn(async () => ({
        type: "started" as const,
        workout: routineWorkout,
      })),
    });
    const writes = new WorkoutWrites(persistence, () => new Date("2026-08-01T12:05:00.000Z"));

    await expect(
      writes.start({
        userId: "user-1",
        source: { type: "routine", routineId: "routine-1" },
      }),
    ).resolves.toEqual({ type: "started", workout: routineWorkout });

    expect(persistence.getRoutine).toHaveBeenCalledWith("routine-1", "user-1");
    expect(persistence.startRoutine).toHaveBeenCalledWith("user-1", routine);
    expect(persistence.markRoutinePerformed).toHaveBeenCalledWith(
      "routine-1",
      "user-1",
      "2026-08-01T12:05:00.000Z",
    );
  });

  it("returns not-found for a missing or cross-owner routine without starting it", async () => {
    const getRoutine = vi.fn(async (_routineId: string, _userId: string) => null);
    const persistence = makePersistence({ getRoutine });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.start({
        userId: "other-user",
        source: { type: "routine", routineId: "private-routine" },
      }),
    ).resolves.toEqual({ type: "not-found" });

    expect(getRoutine).toHaveBeenCalledWith("private-routine", "other-user");
    expect(persistence.startRoutine).not.toHaveBeenCalled();
    expect(persistence.markRoutinePerformed).not.toHaveBeenCalled();
  });

  it("returns the expected conflict outcome without treating it as an exception", async () => {
    const persistence = makePersistence({
      startBlank: vi.fn(async () => ({ type: "conflict" as const })),
    });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.start({ userId: "user-1", source: { type: "blank" } }),
    ).resolves.toEqual({ type: "conflict" });
  });

  it("returns invalid-source when routine conversion rejects trusted source data", async () => {
    const persistence = makePersistence({
      getRoutine: vi.fn(async () => routine),
      startRoutine: vi.fn(async () => {
        throw new UnsupportedRoutineDataError("Unsupported exercise type");
      }),
    });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.start({
        userId: "user-1",
        source: { type: "routine", routineId: "routine-1" },
      }),
    ).resolves.toEqual({
      type: "invalid-source",
      message: "Unsupported exercise type",
    });
  });

  it("keeps the started workout when performed metadata cannot be recorded", async () => {
    const metadataError = new Error("metadata update failed");
    const markRoutinePerformed = vi.fn().mockRejectedValue(metadataError);
    const persistence = makePersistence({
      getRoutine: vi.fn(async () => routine),
      markRoutinePerformed,
    });
    const writes = new WorkoutWrites(
      persistence,
      () => new Date("2026-08-01T12:05:00.000Z"),
    );

    await expect(
      writes.start({
        userId: "user-1",
        source: { type: "routine", routineId: "routine-1" },
      }),
    ).resolves.toEqual({
      type: "started",
      workout: { ...workout, exercises: [] },
    });

    expect(logError).toHaveBeenCalledWith(
      "Failed to update routine last_performed_at",
      metadataError,
      { routineId: "routine-1" },
    );
  });

  it.each([
    ["missing source", { userId: "user-1" }],
    ["blank user", { userId: " ", source: { type: "blank" } }],
    ["blank routine id", { userId: "user-1", source: { type: "routine", routineId: " " } }],
  ])("returns invalid-source for %s", async (_label, request) => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(writes.start(request as never)).resolves.toMatchObject({
      type: "invalid-source",
    });
    expect(persistence.startBlank).not.toHaveBeenCalled();
    expect(persistence.getRoutine).not.toHaveBeenCalled();
  });
});
