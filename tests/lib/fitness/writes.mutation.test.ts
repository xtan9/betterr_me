import { describe, expect, it, vi } from "vitest";
import {
  SupabaseWorkoutMutationPersistence,
  WorkoutWrites,
  toWorkoutExerciseResponse,
  toWorkoutResponse,
  toWorkoutSetResponse,
  type WorkoutExerciseMutationRecord,
  type WorkoutMutationPersistence,
  type WorkoutMutationRecord,
  type WorkoutSetMutationRecord,
} from "@/lib/fitness/writes";

const workout: WorkoutMutationRecord = {
  id: "workout-1",
  userId: "user-1",
  title: "Morning workout",
  notes: null,
  startedAt: "2026-08-01T12:00:00.000Z",
  completedAt: null,
  durationSeconds: null,
  status: "in_progress",
  routineId: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const exercise: WorkoutExerciseMutationRecord = {
  id: "exercise-1",
  workoutId: "workout-1",
  exerciseId: "push-up",
  sortOrder: 0,
  notes: null,
  restTimerSeconds: 90,
  createdAt: "2026-08-01T12:00:00.000Z",
};

const set: WorkoutSetMutationRecord = {
  id: "set-1",
  workoutExerciseId: "exercise-1",
  setNumber: 1,
  setType: "normal",
  weightKg: 20,
  reps: 10,
  durationSeconds: null,
  distanceMeters: null,
  isCompleted: true,
  rpe: 7,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

function mutationPersistence(): WorkoutMutationPersistence {
  return {
    updateWorkout: vi.fn(async () => ({ type: "updated" as const, workout })),
    completeWorkout: vi.fn(async () => ({ type: "transitioned" as const, workout })),
    discardWorkout: vi.fn(async () => ({ type: "already-applied" as const, workout })),
    addWorkoutExercise: vi.fn(async () => ({ type: "added" as const, exercise })),
    updateWorkoutExercise: vi.fn(async () => ({ type: "updated" as const, exercise })),
    removeWorkoutExercise: vi.fn(async () => ({ type: "removed" as const })),
    addWorkoutSet: vi.fn(async () => ({ type: "added" as const, set })),
    updateWorkoutSet: vi.fn(async () => ({ type: "updated" as const, set })),
    removeWorkoutSet: vi.fn(async () => ({ type: "removed" as const })),
  };
}

describe("WorkoutWrites mutation boundary", () => {
  it("normalizes and forwards every supported workout mutation", async () => {
    const persistence = mutationPersistence();
    const writes = new WorkoutWrites(
      persistence,
      () => new Date("2026-08-01T12:05:00.000Z"),
    );

    await expect(writes.update({
      userId: " user-1 ",
      workoutId: " workout-1 ",
      title: "  Updated workout  ",
      notes: "  Keep form  ",
    })).resolves.toEqual({ type: "updated", workout });
    expect(persistence.updateWorkout).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      { title: "Updated workout", notes: "Keep form" },
    );

    await expect(writes.complete({
      userId: "user-1",
      workoutId: "workout-1",
      notes: "Done",
    })).resolves.toEqual({ type: "transitioned", workout });
    expect(persistence.completeWorkout).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "2026-08-01T12:05:00.000Z",
      { notes: "Done" },
    );

    await expect(writes.discard({
      userId: "user-1",
      workoutId: "workout-1",
      title: "Abandoned",
    })).resolves.toEqual({ type: "already-applied", workout });

    await expect(writes.addExercise({
      userId: "user-1",
      workoutId: "workout-1",
      exerciseId: " push-up ",
      restTimerSeconds: 120,
    })).resolves.toEqual({ type: "added", exercise });
    expect(persistence.addWorkoutExercise).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "push-up",
      120,
    );

    await expect(writes.updateExercise({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      changes: { notes: "  controlled  ", restTimerSeconds: 60 },
    })).resolves.toEqual({ type: "updated", exercise });

    await expect(writes.removeExercise({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
    })).resolves.toEqual({ type: "removed" });

    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { reps: 8, weightKg: 22.5 },
    })).resolves.toEqual({ type: "added", set });
    expect(persistence.addWorkoutSet).toHaveBeenCalledWith(
      "user-1",
      "workout-1",
      "exercise-1",
      { reps: 8, weightKg: 22.5, setType: "normal", isCompleted: false },
    );

    await expect(writes.updateSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      setId: "set-1",
      changes: {
        setType: "drop",
        weightKg: null,
        reps: 12,
        durationSeconds: 30,
        distanceMeters: 100,
        isCompleted: false,
        rpe: null,
      },
    })).resolves.toEqual({ type: "updated", set });

    await expect(writes.removeSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      setId: "set-1",
    })).resolves.toEqual({ type: "removed" });
  });

  it("rejects invalid workout, nested, and numeric mutation inputs before persistence", async () => {
    const writes = new WorkoutWrites(mutationPersistence());
    await expect(writes.update(null as never)).resolves.toMatchObject({
      type: "invalid",
      field: "request",
    });
    await expect(writes.update({ userId: " ", workoutId: "workout-1", title: "x" })).resolves.toMatchObject({
      type: "invalid",
      field: "userId",
    });
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1" })).resolves.toMatchObject({
      type: "invalid",
      field: "changes",
    });
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1", title: " " })).resolves.toMatchObject({
      type: "invalid",
      field: "title",
    });
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1", title: "x".repeat(101) })).resolves.toMatchObject({
      type: "invalid",
      field: "title",
    });
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1", notes: 1 } as never)).resolves.toMatchObject({
      type: "invalid",
      field: "notes",
    });
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1", notes: "x".repeat(2001) })).resolves.toMatchObject({
      type: "invalid",
      field: "notes",
    });

    await expect(writes.complete({ userId: "user-1", workoutId: " " })).resolves.toMatchObject({
      type: "invalid",
      field: "workoutId",
    });
    await expect(writes.discard(null as never)).resolves.toMatchObject({
      type: "invalid",
      field: "request",
    });
    await expect(writes.addExercise(null as never)).resolves.toMatchObject({
      type: "invalid",
      field: "request",
    });
    await expect(writes.addExercise({ userId: "user-1", workoutId: "workout-1", exerciseId: " " })).resolves.toMatchObject({
      type: "invalid",
      field: "exerciseId",
    });
    await expect(writes.addExercise({ userId: "user-1", workoutId: "workout-1", exerciseId: "push-up", restTimerSeconds: 601 })).resolves.toMatchObject({
      type: "invalid",
      field: "restTimerSeconds",
    });

    await expect(writes.updateExercise({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      changes: {},
    })).resolves.toMatchObject({ type: "invalid", field: "changes" });
    await expect(writes.updateExercise({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      changes: { notes: 1 },
    } as never)).resolves.toMatchObject({ type: "invalid", field: "notes" });
    await expect(writes.updateExercise({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      changes: { restTimerSeconds: -1 },
    })).resolves.toMatchObject({ type: "invalid", field: "restTimerSeconds" });

    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { setType: "invalid" },
    } as never)).resolves.toMatchObject({ type: "invalid", field: "setType" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { reps: 1.5 },
    })).resolves.toMatchObject({ type: "invalid", field: "reps" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { weightKg: -1 },
    })).resolves.toMatchObject({ type: "invalid", field: "weightKg" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { durationSeconds: 86401 },
    })).resolves.toMatchObject({ type: "invalid", field: "durationSeconds" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { distanceMeters: Number.POSITIVE_INFINITY },
    })).resolves.toMatchObject({ type: "invalid", field: "distanceMeters" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { isCompleted: "yes" },
    } as never)).resolves.toMatchObject({ type: "invalid", field: "isCompleted" });
    await expect(writes.addSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      set: { rpe: 0 },
    })).resolves.toMatchObject({ type: "invalid", field: "rpe" });
    await expect(writes.updateSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      setId: "set-1",
      changes: {},
    })).resolves.toMatchObject({ type: "invalid", field: "changes" });
    await expect(writes.removeSet({
      userId: "user-1",
      workoutId: "workout-1",
      workoutExerciseId: "exercise-1",
      setId: " ",
    })).resolves.toMatchObject({ type: "invalid", field: "setId" });
  });

  it("fails clearly when a persistence adapter does not implement a mutation", async () => {
    const writes = new WorkoutWrites({});
    await expect(writes.update({ userId: "user-1", workoutId: "workout-1", title: "x" })).rejects.toThrow("updates");
    await expect(writes.complete({ userId: "user-1", workoutId: "workout-1" })).rejects.toThrow("completion");
    await expect(writes.discard({ userId: "user-1", workoutId: "workout-1" })).rejects.toThrow("discard");
    await expect(writes.addExercise({ userId: "user-1", workoutId: "workout-1", exerciseId: "exercise-1" })).rejects.toThrow("additions");
    await expect(writes.updateExercise({ userId: "user-1", workoutId: "workout-1", workoutExerciseId: "exercise-1", changes: { notes: "x" } })).rejects.toThrow("updates");
    await expect(writes.removeExercise({ userId: "user-1", workoutId: "workout-1", workoutExerciseId: "exercise-1" })).rejects.toThrow("removals");
    await expect(writes.addSet({ userId: "user-1", workoutId: "workout-1", workoutExerciseId: "exercise-1", set: {} })).rejects.toThrow("additions");
    await expect(writes.updateSet({ userId: "user-1", workoutId: "workout-1", workoutExerciseId: "exercise-1", setId: "set-1", changes: { reps: 1 } })).rejects.toThrow("updates");
    await expect(writes.removeSet({ userId: "user-1", workoutId: "workout-1", workoutExerciseId: "exercise-1", setId: "set-1" })).rejects.toThrow("removals");
  });
});

function storedWorkout() {
  return {
    id: workout.id,
    user_id: workout.userId,
    title: workout.title,
    notes: workout.notes,
    started_at: workout.startedAt,
    completed_at: workout.completedAt,
    duration_seconds: workout.durationSeconds,
    status: workout.status,
    routine_id: workout.routineId,
    created_at: workout.createdAt,
    updated_at: workout.updatedAt,
  };
}

function storedExercise() {
  return {
    id: exercise.id,
    workout_id: exercise.workoutId,
    exercise_id: exercise.exerciseId,
    sort_order: exercise.sortOrder,
    notes: exercise.notes,
    rest_timer_seconds: exercise.restTimerSeconds,
    created_at: exercise.createdAt,
  };
}

function storedSet() {
  return {
    id: set.id,
    workout_exercise_id: set.workoutExerciseId,
    set_number: set.setNumber,
    set_type: set.setType,
    weight_kg: set.weightKg,
    reps: set.reps,
    duration_seconds: set.durationSeconds,
    distance_meters: set.distanceMeters,
    is_completed: set.isCompleted,
    rpe: set.rpe,
    created_at: set.createdAt,
    updated_at: set.updatedAt,
  };
}

function rpcPersistence(results: unknown[]) {
  return {
    rpc: vi.fn(async () => ({ data: results.shift(), error: null })),
  };
}

describe("SupabaseWorkoutMutationPersistence", () => {
  it("maps every mutation RPC and preserves the domain result", async () => {
    const supabase = rpcPersistence([
      { type: "updated", workout: storedWorkout() },
      { type: "transitioned", workout: storedWorkout() },
      { type: "already-applied", workout: storedWorkout() },
      { type: "added", exercise: storedExercise() },
      { type: "updated", exercise: storedExercise() },
      { type: "removed" },
      { type: "added", set: storedSet() },
      { type: "updated", set: storedSet() },
      { type: "not-found" },
    ]);
    const persistence = new SupabaseWorkoutMutationPersistence(supabase as never);

    await expect(persistence.updateWorkout("user-1", "workout-1", { title: "New" })).resolves.toEqual({ type: "updated", workout });
    await expect(persistence.completeWorkout("user-1", "workout-1", "2026-08-01T12:05:00.000Z", { notes: null })).resolves.toEqual({ type: "transitioned", workout });
    await expect(persistence.discardWorkout("user-1", "workout-1", {})).resolves.toEqual({ type: "already-applied", workout });
    await expect(persistence.addWorkoutExercise("user-1", "workout-1", "push-up")).resolves.toEqual({ type: "added", exercise });
    await expect(persistence.updateWorkoutExercise("user-1", "workout-1", "exercise-1", { restTimerSeconds: 60 })).resolves.toEqual({ type: "updated", exercise });
    await expect(persistence.removeWorkoutExercise("user-1", "workout-1", "exercise-1")).resolves.toEqual({ type: "removed" });
    await expect(persistence.addWorkoutSet("user-1", "workout-1", "exercise-1", { reps: 5 })).resolves.toEqual({ type: "added", set });
    await expect(persistence.updateWorkoutSet("user-1", "workout-1", "exercise-1", "set-1", { reps: 6 })).resolves.toEqual({ type: "updated", set });
    await expect(persistence.removeWorkoutSet("user-1", "workout-1", "exercise-1", "set-1")).resolves.toEqual({ type: "not-found" });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "update_active_workout", expect.objectContaining({
      p_user_id: "user-1",
      p_workout_id: "workout-1",
      p_changes: { title: "New" },
    }));
    expect(supabase.rpc).toHaveBeenNthCalledWith(6, "remove_active_workout_exercise", expect.any(Object));
    expect(supabase.rpc).toHaveBeenNthCalledWith(9, "remove_active_workout_set", expect.any(Object));
  });

  it("maps invalid transitions and propagates RPC errors", async () => {
    const supabase = rpcPersistence([
      { type: "invalid-transition", current_status: "completed" },
      { type: "invalid-transition", current_status: "discarded" },
      { type: "invalid-transition", current_status: "in_progress" },
      { type: "invalid-transition", current_status: "invalid" },
    ]);
    const persistence = new SupabaseWorkoutMutationPersistence(supabase as never);
    await expect(persistence.updateWorkout("u", "w", { notes: "x" })).resolves.toEqual({
      type: "invalid-transition",
      currentStatus: "completed",
    });
    await expect(persistence.completeWorkout("u", "w", "now", {})).resolves.toEqual({
      type: "invalid-transition",
      currentStatus: "discarded",
    });
    await expect(persistence.removeWorkoutExercise("u", "w", "e")).resolves.toEqual({
      type: "invalid-transition",
      currentStatus: "in_progress",
    });
    await expect(persistence.removeWorkoutSet("u", "w", "e", "s")).rejects.toThrow("Invalid workout mutation outcome");

    const failed = {
      rpc: vi.fn(async () => ({ data: null, error: new Error("rpc unavailable") })),
    };
    await expect(
      new SupabaseWorkoutMutationPersistence(failed as never).updateWorkout("u", "w", { title: "x" }),
    ).rejects.toThrow("rpc unavailable");
  });

  it("maps mutation records to the established response shapes", () => {
    expect(toWorkoutResponse(workout)).toEqual({
      id: "workout-1",
      user_id: "user-1",
      title: "Morning workout",
      notes: null,
      started_at: workout.startedAt,
      completed_at: null,
      duration_seconds: null,
      status: "in_progress",
      routine_id: null,
      created_at: workout.createdAt,
      updated_at: workout.updatedAt,
    });
    expect(toWorkoutExerciseResponse(exercise)).toMatchObject({
      workout_id: "workout-1",
      rest_timer_seconds: 90,
    });
    expect(toWorkoutSetResponse(set)).toMatchObject({
      workout_exercise_id: "exercise-1",
      set_type: "normal",
      is_completed: true,
    });
  });
});
