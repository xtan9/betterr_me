import { describe, expect, it, vi } from "vitest";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import type { RoutineWorkoutSessionInput } from "@/lib/fitness/routine-to-workout";
import type { WorkoutWithExercises } from "@/lib/db/types";

const sessionInput: RoutineWorkoutSessionInput = {
  title: "Push day",
  routine_id: "routine-1",
  exercises: [
    {
      exercise: {
        exercise_id: "bench-press",
        sort_order: 10,
        notes: "Pause at the bottom",
        rest_timer_seconds: 120,
      },
      sets: [
        {
          set_number: 1,
          set_type: "normal",
          weight_kg: 80,
          reps: 8,
          duration_seconds: null,
          distance_meters: null,
          is_completed: false,
          rpe: null,
        },
      ],
    },
  ],
};

describe("SupabaseRoutineWorkoutStore.createSession", () => {
  it("returns the complete session from one transactional call", async () => {
    const session = {
      id: "workout-1",
      title: "Push day",
      routine_id: "routine-1",
      exercises: [{ exercise_id: "bench-press", sets: [{ reps: 8 }] }],
    } as WorkoutWithExercises;
    const rpc = vi.fn().mockResolvedValue({ data: session, error: null });
    const store = new SupabaseRoutineWorkoutStore({ rpc } as never);

    await expect(
      store.createSession("user-1", sessionInput),
    ).resolves.toBe(session);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("start_workout_from_routine", {
      p_user_id: "user-1",
      p_workout: {
        title: "Push day",
        routine_id: "routine-1",
      },
      p_exercises: sessionInput.exercises,
    });
  });

  it("propagates the transactional failure as the single outcome", async () => {
    const error = new Error("set insert failed");
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const store = new SupabaseRoutineWorkoutStore({ rpc } as never);

    await expect(
      store.createSession("user-1", sessionInput),
    ).rejects.toBe(error);
  });
});
