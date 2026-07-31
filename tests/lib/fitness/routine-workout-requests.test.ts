import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RoutineWithExercises,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { RoutineWorkoutRequests } from "@/lib/fitness/routine-workout-requests";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: mocks.logError },
}));

const routine = {
  id: "routine-1",
  name: "Push Day",
  exercises: [],
} as unknown as RoutineWithExercises;

const workout = {
  id: "workout-1",
  title: "Push Day",
  exercises: [],
} as unknown as WorkoutWithExercises;

const savedRoutine = {
  id: "saved-routine-1",
  name: "Saved routine",
  exercises: [],
} as unknown as RoutineWithExercises;

describe("RoutineWorkoutRequests", () => {
  const getRoutine = vi.fn();
  const updateRoutine = vi.fn();
  const getWorkoutWithExercises = vi.fn();
  const start = vi.fn();
  const save = vi.fn();

  const requests = new RoutineWorkoutRequests(
    { getRoutine, updateRoutine },
    { getWorkoutWithExercises },
    { start },
    { save },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    getRoutine.mockResolvedValue(routine);
    updateRoutine.mockResolvedValue(undefined);
    getWorkoutWithExercises.mockResolvedValue(workout);
    start.mockResolvedValue(workout);
    save.mockResolvedValue(savedRoutine);
  });

  it("owns routine loading, conversion, and performed metadata", async () => {
    await expect(requests.start("user-1", "routine-1")).resolves.toBe(workout);

    expect(getRoutine).toHaveBeenCalledWith("routine-1");
    expect(start).toHaveBeenCalledWith("user-1", routine);
    expect(updateRoutine).toHaveBeenCalledWith("routine-1", {
      last_performed_at: expect.any(String),
    });
  });

  it("keeps the completed conversion outcome when metadata recording fails", async () => {
    updateRoutine.mockRejectedValue(new Error("metadata update failed"));

    await expect(requests.start("user-1", "routine-1")).resolves.toBe(workout);

    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to update routine last_performed_at",
      expect.any(Error),
      { routineId: "routine-1" },
    );
  });

  it("returns null without converting when the routine does not exist", async () => {
    getRoutine.mockResolvedValue(null);

    await expect(requests.start("user-1", "missing")).resolves.toBeNull();

    expect(start).not.toHaveBeenCalled();
    expect(updateRoutine).not.toHaveBeenCalled();
  });

  it("owns workout loading and inverse conversion", async () => {
    await expect(
      requests.save("user-1", "workout-1", "Saved routine"),
    ).resolves.toBe(savedRoutine);

    expect(getWorkoutWithExercises).toHaveBeenCalledWith("workout-1");
    expect(save).toHaveBeenCalledWith("user-1", "Saved routine", workout);
  });

  it("returns null without converting when the workout does not exist", async () => {
    getWorkoutWithExercises.mockResolvedValue(null);

    await expect(
      requests.save("user-1", "missing", "Saved routine"),
    ).resolves.toBeNull();

    expect(save).not.toHaveBeenCalled();
  });
});
