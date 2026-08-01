import { describe, expect, it, vi } from "vitest";
import type {
  WorkoutExerciseMutationRecord,
  WorkoutMutationPersistence,
  WorkoutMutationRecord,
  WorkoutSetMutationRecord,
} from "@/lib/fitness/writes";
import { WorkoutWrites } from "@/lib/fitness/writes";

const workout: WorkoutMutationRecord = {
  id: "workout-1",
  userId: "user-1",
  title: "Renamed workout",
  notes: "Keep it short",
  startedAt: "2026-08-01T12:00:00.000Z",
  completedAt: null,
  durationSeconds: null,
  status: "in_progress",
  routineId: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const workoutExercise: WorkoutExerciseMutationRecord = {
  id: "workout-exercise-1",
  workoutId: "workout-1",
  exerciseId: "exercise-1",
  sortOrder: 131072,
  notes: null,
  restTimerSeconds: 90,
  createdAt: "2026-08-01T12:00:00.000Z",
};

const workoutSet: WorkoutSetMutationRecord = {
  id: "set-1",
  workoutExerciseId: "workout-exercise-1",
  setNumber: 1,
  setType: "normal",
  weightKg: 80,
  reps: 8,
  durationSeconds: null,
  distanceMeters: null,
  isCompleted: false,
  rpe: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

function makePersistence(
  overrides: Partial<WorkoutMutationPersistence> = {},
): Partial<WorkoutMutationPersistence> {
  return {
    updateWorkout: vi.fn(async () => ({ type: "updated" as const, workout })),
    addWorkoutExercise: vi.fn(async () => ({
      type: "added" as const,
      exercise: workoutExercise,
    })),
    updateWorkoutExercise: vi.fn(async () => ({
      type: "updated" as const,
      exercise: workoutExercise,
    })),
    removeWorkoutExercise: vi.fn(async () => ({ type: "removed" as const })),
    addWorkoutSet: vi.fn(async () => ({
      type: "added" as const,
      set: workoutSet,
    })),
    updateWorkoutSet: vi.fn(async () => ({
      type: "updated" as const,
      set: workoutSet,
    })),
    removeWorkoutSet: vi.fn(async () => ({ type: "removed" as const })),
    ...overrides,
  };
}

describe("WorkoutWrites active editing", () => {
  it("normalizes workout detail changes before passing a trusted owner to persistence", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.update({
        userId: " user-1 ",
        workoutId: " workout-1 ",
        title: "  Renamed workout  ",
        notes: "  Keep it short  ",
      }),
    ).resolves.toEqual({ type: "updated", workout });

    expect(persistence.updateWorkout).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      { title: "Renamed workout", notes: "Keep it short" },
    );
  });

  it.each([
    { type: "not-found" as const },
    { type: "invalid-transition" as const, currentStatus: "completed" as const },
  ])("preserves the typed workout outcome: $type", async (outcome) => {
    const persistence = makePersistence({
      updateWorkout: vi.fn(async () => outcome),
    });
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.update({ userId: "user-1", workoutId: "workout-1", title: "Edit" }),
    ).resolves.toEqual(outcome);
  });

  it("maps an active workout exercise add through its domain-shaped capability", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.addExercise({
        userId: "user-1",
        workoutId: "workout-1",
        exerciseId: " exercise-1 ",
        restTimerSeconds: 120,
      }),
    ).resolves.toEqual({ type: "added", exercise: workoutExercise });

    expect(persistence.addWorkoutExercise).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "exercise-1",
      120,
    );
  });

  it("maps workout exercise update and removal outcomes", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.updateExercise({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
        changes: { notes: "  Pause at the bottom  ", restTimerSeconds: 60 },
      }),
    ).resolves.toEqual({ type: "updated", exercise: workoutExercise });
    await expect(
      writes.removeExercise({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
      }),
    ).resolves.toEqual({ type: "removed" });

    expect(persistence.updateWorkoutExercise).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      { notes: "Pause at the bottom", restTimerSeconds: 60 },
    );
    expect(persistence.removeWorkoutExercise).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "workout-exercise-1",
    );
  });

  it("maps set add, update, and removal with domain-shaped measurement fields", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.addSet({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
        set: {
          setType: "warmup",
          weightKg: 40,
          reps: 10,
          durationSeconds: 30,
          distanceMeters: 100,
          isCompleted: true,
          rpe: 7,
        },
      }),
    ).resolves.toEqual({ type: "added", set: workoutSet });
    await expect(
      writes.updateSet({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
        setId: "set-1",
        changes: { reps: 12, isCompleted: true, rpe: 8 },
      }),
    ).resolves.toEqual({ type: "updated", set: workoutSet });
    await expect(
      writes.removeSet({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
        setId: "set-1",
      }),
    ).resolves.toEqual({ type: "removed" });

    expect(persistence.addWorkoutSet).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      {
        setType: "warmup",
        weightKg: 40,
        reps: 10,
        durationSeconds: 30,
        distanceMeters: 100,
        isCompleted: true,
        rpe: 7,
      },
    );
    expect(persistence.updateWorkoutSet).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      "set-1",
      { reps: 12, isCompleted: true, rpe: 8 },
    );
    expect(persistence.removeWorkoutSet).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      "set-1",
    );
  });

  it("returns invalid requests without calling persistence", async () => {
    const persistence = makePersistence();
    const writes = new WorkoutWrites(persistence);

    await expect(
      writes.update({ userId: "user-1", workoutId: "workout-1" }),
    ).resolves.toMatchObject({ type: "invalid" });
    await expect(
      writes.addSet({
        userId: "user-1",
        workoutId: "workout-1",
        workoutExerciseId: "workout-exercise-1",
        set: { reps: -1 },
      }),
    ).resolves.toMatchObject({ type: "invalid" });

    expect(persistence.updateWorkout).not.toHaveBeenCalled();
    expect(persistence.addWorkoutSet).not.toHaveBeenCalled();
  });
});
