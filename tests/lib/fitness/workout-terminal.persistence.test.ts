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
  completed_at: "2026-08-01T13:05:00.000Z",
  duration_seconds: 3900,
  status: "completed",
  notes: "Strong session",
  routine_id: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T13:05:00.000Z",
};

const discardedWorkoutRow = {
  ...workoutRow,
  status: "discarded",
  completed_at: null,
  duration_seconds: null,
  notes: null,
};

describe("SupabaseWorkoutMutationPersistence terminal transitions", () => {
  const rpc = vi.fn();
  let persistence: SupabaseWorkoutMutationPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseWorkoutMutationPersistence({ rpc } as never);
  });

  it("maps an atomic completion RPC into a domain workout", async () => {
    rpc.mockResolvedValue({
      data: { type: "transitioned", workout: workoutRow },
      error: null,
    });

    await expect(
      persistence.completeWorkout(
        "user-1",
        "workout-1",
        "2026-08-01T13:05:00.000Z",
        { notes: "Strong session" },
      ),
    ).resolves.toEqual({
      type: "transitioned",
      workout: {
        id: "workout-1",
        userId: "user-1",
        title: "Workout",
        notes: "Strong session",
        startedAt: "2026-08-01T12:00:00.000Z",
        completedAt: "2026-08-01T13:05:00.000Z",
        durationSeconds: 3900,
        status: "completed",
        routineId: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T13:05:00.000Z",
      } satisfies WorkoutMutationRecord,
    });

    expect(rpc).toHaveBeenCalledWith("complete_workout_atomically", {
      p_user_id: "user-1",
      p_workout_id: "workout-1",
      p_completed_at: "2026-08-01T13:05:00.000Z",
      p_changes: { notes: "Strong session" },
    });
  });

  it("maps an atomic discard RPC and preserves expected transition outcomes", async () => {
    rpc
      .mockResolvedValueOnce({
        data: { type: "transitioned", workout: discardedWorkoutRow },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { type: "already-applied", workout: discardedWorkoutRow },
        error: null,
      })
      .mockResolvedValueOnce({ data: { type: "not-found" }, error: null })
      .mockResolvedValueOnce({
        data: { type: "invalid-transition", current_status: "completed" },
        error: null,
      });

    await expect(
      persistence.discardWorkout("user-1", "workout-1", {}),
    ).resolves.toMatchObject({ type: "transitioned", workout: { status: "discarded" } });
    await expect(
      persistence.discardWorkout("user-1", "workout-1", {}),
    ).resolves.toMatchObject({ type: "already-applied", workout: { status: "discarded" } });
    await expect(
      persistence.discardWorkout("user-1", "missing", {}),
    ).resolves.toEqual({ type: "not-found" });
    await expect(
      persistence.discardWorkout("user-1", "completed", {}),
    ).resolves.toEqual({
      type: "invalid-transition",
      currentStatus: "completed",
    });

    expect(rpc.mock.calls).toEqual([
      ["discard_workout_atomically", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_changes: {},
      }],
      ["discard_workout_atomically", {
        p_user_id: "user-1",
        p_workout_id: "workout-1",
        p_changes: {},
      }],
      ["discard_workout_atomically", {
        p_user_id: "user-1",
        p_workout_id: "missing",
        p_changes: {},
      }],
      ["discard_workout_atomically", {
        p_user_id: "user-1",
        p_workout_id: "completed",
        p_changes: {},
      }],
    ]);
  });

  it("does not turn RPC failures or malformed outcomes into expected domain results", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });

    await expect(
      persistence.completeWorkout("user-1", "workout-1", "2026-08-01T13:05:00.000Z", {}),
    ).rejects.toBe(failure);

    rpc.mockResolvedValue({
      data: { type: "transitioned", workout: { status: "completed" } },
      error: null,
    });
    await expect(
      persistence.completeWorkout("user-1", "workout-1", "2026-08-01T13:05:00.000Z", {}),
    ).rejects.toThrow("Invalid workout");
  });
});
