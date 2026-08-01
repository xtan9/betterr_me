import { describe, expect, it, vi } from "vitest";
import {
  WorkoutWrites,
  type WorkoutMutationPersistence,
  type WorkoutMutationRecord,
} from "@/lib/fitness/writes";

const activeWorkout: WorkoutMutationRecord = {
  id: "workout-1",
  userId: "owner-1",
  title: "Workout",
  notes: null,
  startedAt: "2026-08-01T12:00:00.000Z",
  completedAt: null,
  durationSeconds: null,
  status: "in_progress",
  routineId: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const completedWorkout: WorkoutMutationRecord = {
  ...activeWorkout,
  status: "completed",
  completedAt: "2026-08-01T13:05:00.000Z",
  durationSeconds: 3900,
  notes: "Strong session",
};

const discardedWorkout: WorkoutMutationRecord = {
  ...activeWorkout,
  status: "discarded",
};

function makePersistence(
  overrides: Partial<WorkoutMutationPersistence> = {},
): Partial<WorkoutMutationPersistence> {
  return {
    completeWorkout: vi.fn(async () => ({
      type: "transitioned" as const,
      workout: completedWorkout,
    })),
    discardWorkout: vi.fn(async () => ({
      type: "transitioned" as const,
      workout: discardedWorkout,
    })),
    ...overrides,
  };
}

describe("WorkoutWrites terminal transitions", () => {
  it("completes through the trusted owner and controlled clock", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(
      persistence,
      () => new Date("2026-08-01T13:05:00.000Z"),
    );

    await expect(
      writes.complete({
        userId: " owner-1 ",
        workoutId: " workout-1 ",
        title: "  Workout  ",
        notes: "  Strong session  ",
      }),
    ).resolves.toEqual({ type: "transitioned", workout: completedWorkout });

    expect(persistence.completeWorkout).toHaveBeenCalledWith(
      "owner-1",
      "workout-1",
      "2026-08-01T13:05:00.000Z",
      { title: "Workout", notes: "Strong session" },
    );
  });

  it("discards through the trusted owner without inventing completion data", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.discard({
        userId: " owner-1 ",
        workoutId: " workout-1 ",
        notes: "  Not today  ",
      }),
    ).resolves.toEqual({ type: "transitioned", workout: discardedWorkout });

    expect(persistence.discardWorkout).toHaveBeenCalledWith(
      "owner-1",
      "workout-1",
      { notes: "Not today" },
    );
    expect(persistence.completeWorkout).not.toHaveBeenCalled();
  });

  it.each([
    ["already-applied", { type: "already-applied", workout: completedWorkout }],
    ["not-found", { type: "not-found" }],
    [
      "invalid-transition",
      { type: "invalid-transition", currentStatus: "discarded" },
    ],
  ] as const)("preserves the %s completion outcome", async (_label, outcome) => {
    const persistence = makePersistence({
      completeWorkout: vi.fn(async () => outcome),
    });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.complete({ userId: "owner-1", workoutId: "workout-1" }),
    ).resolves.toEqual(outcome);
  });

  it.each([
    ["already-applied", { type: "already-applied", workout: discardedWorkout }],
    ["not-found", { type: "not-found" }],
    [
      "invalid-transition",
      { type: "invalid-transition", currentStatus: "completed" },
    ],
  ] as const)("preserves the %s discard outcome", async (_label, outcome) => {
    const persistence = makePersistence({
      discardWorkout: vi.fn(async () => outcome),
    });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.discard({ userId: "owner-1", workoutId: "workout-1" }),
    ).resolves.toEqual(outcome);
  });

  it("uses the same not-found result for a missing or cross-owner target", async () => {
    const completeWorkout = vi.fn(async () => ({ type: "not-found" as const }));
    const writes = new WorkoutWrites(makePersistence({ completeWorkout }));

    await expect(
      writes.complete({ userId: "other-owner", workoutId: "workout-1" }),
    ).resolves.toEqual({ type: "not-found" });
    await expect(
      writes.complete({ userId: "owner-1", workoutId: "missing-workout" }),
    ).resolves.toEqual({ type: "not-found" });
    expect(completeWorkout).toHaveBeenNthCalledWith(
      1,
      "other-owner",
      "workout-1",
      expect.any(String),
      {},
    );
  });

  it("returns invalid terminal requests without calling persistence", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.complete({ userId: "owner-1", workoutId: " " }),
    ).resolves.toMatchObject({ type: "invalid", field: "workoutId" });
    await expect(
      writes.discard({ userId: " ", workoutId: "workout-1" }),
    ).resolves.toMatchObject({ type: "invalid", field: "userId" });

    expect(persistence.completeWorkout).not.toHaveBeenCalled();
    expect(persistence.discardWorkout).not.toHaveBeenCalled();
  });

  it("propagates unexpected terminal persistence failures", async () => {
    const failure = new Error("workout transition unavailable");
    const writes = new WorkoutWrites(
      makePersistence({
        discardWorkout: vi.fn().mockRejectedValue(failure),
      }),
    );

    await expect(
      writes.discard({ userId: "owner-1", workoutId: "workout-1" }),
    ).rejects.toBe(failure);
  });
});
