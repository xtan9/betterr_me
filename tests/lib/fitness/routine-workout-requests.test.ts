import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RoutineWithExercises,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { RoutineWorkoutRequests } from "@/lib/fitness/routine-workout-requests";

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
  const getWorkoutWithExercises = vi.fn();
  const save = vi.fn();

  const requests = new RoutineWorkoutRequests(
    { getWorkoutWithExercises },
    { save },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    getWorkoutWithExercises.mockResolvedValue(workout);
    save.mockResolvedValue(savedRoutine);
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
