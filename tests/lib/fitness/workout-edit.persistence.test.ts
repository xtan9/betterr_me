import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseWorkoutMutationPersistence,
  type WorkoutMutationRecord,
} from "@/lib/fitness/writes";

const workoutRow = {
  id: "workout-1",
  user_id: "user-1",
  title: "Workout",
  started_at: "2026-08-01T12:00:00.000Z",
  completed_at: null,
  duration_seconds: null,
  status: "in_progress",
  notes: null,
  routine_id: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const exerciseRow = {
  id: "workout-exercise-1",
  workout_id: "workout-1",
  exercise_id: "exercise-1",
  sort_order: 65536,
  notes: null,
  rest_timer_seconds: 90,
  created_at: "2026-08-01T12:00:00.000Z",
};

const setRow = {
  id: "set-1",
  workout_exercise_id: "workout-exercise-1",
  set_number: 1,
  set_type: "normal",
  weight_kg: null,
  reps: 8,
  duration_seconds: null,
  distance_meters: null,
  is_completed: false,
  rpe: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

describe("SupabaseWorkoutMutationPersistence", () => {
  const rpc = vi.fn();
  let persistence: SupabaseWorkoutMutationPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseWorkoutMutationPersistence({ rpc } as never);
  });

  it("maps a detail update RPC into a storage-independent workout record", async () => {
    rpc.mockResolvedValue({
      data: { type: "updated", workout: workoutRow },
      error: null,
    });

    await expect(
      persistence.updateWorkout("user-1", "workout-1", {
        title: "Workout",
        notes: null,
      }),
    ).resolves.toEqual({
      type: "updated",
      workout: {
        id: "workout-1",
        userId: "user-1",
        title: "Workout",
        notes: null,
        startedAt: "2026-08-01T12:00:00.000Z",
        completedAt: null,
        durationSeconds: null,
        status: "in_progress",
        routineId: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      } satisfies WorkoutMutationRecord,
    });
    expect(rpc).toHaveBeenCalledWith("update_active_workout", {
      p_user_id: "user-1",
      p_workout_id: "workout-1",
      p_changes: { title: "Workout", notes: null },
    });
  });

  it.each([
    [{ type: "not-found" as const }],
    [{ type: "invalid-transition" as const, current_status: "completed" }],
  ])("maps expected edit outcomes without throwing: %o", async (data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(
      persistence.updateWorkout("user-1", "workout-1", { title: "Edit" }),
    ).resolves.toEqual(
      data.type === "invalid-transition"
        ? { type: "invalid-transition", currentStatus: "completed" }
        : { type: "not-found" },
    );
  });

  it("uses narrow active-workout capabilities for nested add/update/remove operations", async () => {
    rpc
      .mockResolvedValueOnce({ data: { type: "added", exercise: exerciseRow }, error: null })
      .mockResolvedValueOnce({ data: { type: "updated", exercise: exerciseRow }, error: null })
      .mockResolvedValueOnce({ data: { type: "removed" }, error: null })
      .mockResolvedValueOnce({ data: { type: "added", set: setRow }, error: null })
      .mockResolvedValueOnce({ data: { type: "updated", set: setRow }, error: null })
      .mockResolvedValueOnce({ data: { type: "removed" }, error: null });

    await persistence.addWorkoutExercise("user-1", "workout-1", "exercise-1", 120);
    await persistence.updateWorkoutExercise(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      { notes: "Pause", restTimerSeconds: 60 },
    );
    await persistence.removeWorkoutExercise(
      "user-1",
      "workout-1",
      "workout-exercise-1",
    );
    await persistence.addWorkoutSet(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      { setType: "warmup", reps: 10, isCompleted: false },
    );
    await persistence.updateWorkoutSet(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      "set-1",
      { reps: 12, rpe: 8 },
    );
    await persistence.removeWorkoutSet(
      "user-1",
      "workout-1",
      "workout-exercise-1",
      "set-1",
    );

    expect(rpc.mock.calls).toEqual([
      ["add_active_workout_exercise", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_exercise_id: "exercise-1",
        p_rest_timer_seconds: 120,
      }],
      ["update_active_workout_exercise", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_workout_exercise_id: "workout-exercise-1",
        p_changes: { notes: "Pause", rest_timer_seconds: 60 },
      }],
      ["remove_active_workout_exercise", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_workout_exercise_id: "workout-exercise-1",
      }],
      ["add_active_workout_set", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_workout_exercise_id: "workout-exercise-1",
        p_set: { set_type: "warmup", reps: 10, is_completed: false },
      }],
      ["update_active_workout_set", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_workout_exercise_id: "workout-exercise-1",
        p_set_id: "set-1",
        p_changes: { reps: 12, rpe: 8 },
      }],
      ["remove_active_workout_set", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_workout_exercise_id: "workout-exercise-1",
        p_set_id: "set-1",
      }],
    ]);
  });

  it("throws infrastructure failures instead of converting them into domain outcomes", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });

    await expect(
      persistence.removeWorkoutSet(
        "user-1",
        "workout-1",
        "workout-exercise-1",
        "set-1",
      ),
    ).rejects.toBe(failure);
  });
});
