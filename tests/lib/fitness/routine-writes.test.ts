import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RoutineWrites,
  type RoutineWritesPersistence,
} from "@/lib/fitness/routine-writes";

function persistence(
  overrides: Partial<RoutineWritesPersistence> = {},
): RoutineWritesPersistence {
  return {
    getRoutine: vi.fn().mockResolvedValue({ id: "routine-1", exercises: [] }),
    createRoutine: vi.fn().mockResolvedValue({ id: "routine-1" }),
    updateRoutine: vi.fn().mockResolvedValue({ id: "routine-1", name: "Push" }),
    deleteRoutine: vi.fn().mockResolvedValue(undefined),
    getRoutineExercise: vi.fn().mockResolvedValue({
      id: "exercise-1",
      routine_id: "routine-1",
    }),
    addExerciseToRoutine: vi.fn().mockResolvedValue({ id: "exercise-1" }),
    updateRoutineExercise: vi.fn().mockResolvedValue({ id: "exercise-1" }),
    removeRoutineExercise: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RoutineWritesPersistence;
}

describe("RoutineWrites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an owned routine before updating it", async () => {
    const writes = new RoutineWrites(
      persistence({ getRoutine: vi.fn().mockResolvedValue(null) }),
    );

    await expect(
      writes.update({
        userId: "trusted-user",
        routineId: "routine-1",
        changes: { name: "Push" },
      }),
    ).resolves.toEqual({ type: "not-found" });
  });

  it("coordinates routine deletion after the ownership query", async () => {
    const store = persistence();
    const writes = new RoutineWrites(store);

    await expect(
      writes.delete({ userId: "trusted-user", routineId: "routine-1" }),
    ).resolves.toEqual({ type: "deleted" });
    expect(store.getRoutine).toHaveBeenCalledWith("routine-1", "trusted-user");
    expect(store.deleteRoutine).toHaveBeenCalledWith("routine-1");
  });

  it("does not mutate an exercise from another routine", async () => {
    const store = persistence({
      getRoutineExercise: vi.fn().mockResolvedValue({
        id: "exercise-1",
        routine_id: "other-routine",
      }),
    });
    const writes = new RoutineWrites(store);

    await expect(
      writes.removeExercise({
        userId: "trusted-user",
        routineId: "routine-1",
        routineExerciseId: "exercise-1",
      }),
    ).resolves.toEqual({ type: "not-found" });
    expect(store.removeRoutineExercise).not.toHaveBeenCalled();
  });

  it("adds an exercise only after confirming the routine owner", async () => {
    const store = persistence();
    const writes = new RoutineWrites(store);
    const exercise = { exerciseId: "exercise-1", targetSets: 3 };

    await expect(
      writes.addExercise({
        userId: "trusted-user",
        routineId: "routine-1",
        exercise,
      }),
    ).resolves.toEqual({ type: "added", exercise: { id: "exercise-1" } });
    expect(store.addExerciseToRoutine).toHaveBeenCalledWith(
      "routine-1",
      exercise,
    );
  });
});
