import { describe, expect, it, vi } from "vitest";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import type {
  RoutineWorkoutSessionInput,
  WorkoutRoutineInput,
} from "@/lib/fitness/routine-workout-conversion";
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

describe("SupabaseRoutineWorkoutStore.createRoutine", () => {
  it("returns the complete routine from one transactional call", async () => {
    const input: WorkoutRoutineInput = {
      name: "Reusable session",
      notes: null,
      exercises: [
        {
          exercise_id: "49500000-0000-4000-8000-000000000002",
          sort_order: 10,
          target_sets: 2,
          target_reps: 5,
          target_weight_kg: 85,
          target_duration_seconds: null,
          target_distance_meters: null,
          rest_timer_seconds: 90,
          notes: null,
        },
      ],
    };
    const routine = {
      id: "routine-1",
      user_id: "user-1",
      name: "Reusable session",
      notes: null,
      last_performed_at: null,
      created_at: "2026-07-31T12:00:00Z",
      updated_at: "2026-07-31T12:00:00Z",
      exercises: [
        {
          id: "routine-exercise-1",
          routine_id: "routine-1",
          exercise_id: input.exercises[0].exercise_id,
          sort_order: 10,
          target_sets: 2,
          target_reps: 5,
          target_weight_kg: 85,
          target_duration_seconds: null,
          target_distance_meters: null,
          rest_timer_seconds: 90,
          notes: null,
          created_at: "2026-07-31T12:00:00Z",
          exercise: {
            id: input.exercises[0].exercise_id,
            user_id: null,
            name: "Bench press",
            muscle_group_primary: "chest",
            muscle_groups_secondary: ["triceps"],
            equipment: "barbell",
            exercise_type: "weight_reps",
            is_custom: false,
            created_at: "2026-07-31T12:00:00Z",
            updated_at: "2026-07-31T12:00:00Z",
          },
        },
      ],
    };
    const rpc = vi.fn().mockResolvedValue({ data: routine, error: null });
    const store = new SupabaseRoutineWorkoutStore({ rpc } as never);

    await expect(store.createRoutine("user-1", input)).resolves.toEqual({
      ...routine,
      exercises: [
        {
          ...routine.exercises[0],
          exercise: {
            ...routine.exercises[0].exercise,
            exercise_media: null,
          },
        },
      ],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_workout_as_routine", {
      p_user_id: "user-1",
      p_routine: { name: "Reusable session", notes: null },
      p_exercises: input.exercises,
    });
  });

  it("propagates routine transaction failure as the single outcome", async () => {
    const error = new Error("routine exercise insert failed");
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const store = new SupabaseRoutineWorkoutStore({ rpc } as never);

    await expect(
      store.createRoutine("user-1", {
        name: "Reusable session",
        notes: null,
        exercises: [],
      }),
    ).rejects.toBe(error);
  });

  it("rejects a malformed successful routine response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "routine-1", name: "Incomplete routine" },
      error: null,
    });
    const store = new SupabaseRoutineWorkoutStore({ rpc } as never);

    await expect(
      store.createRoutine("user-1", {
        name: "Reusable session",
        notes: null,
        exercises: [],
      }),
    ).rejects.toThrow("Invalid routine returned by save_workout_as_routine");
  });
});
