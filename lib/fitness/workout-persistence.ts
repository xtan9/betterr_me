/** Maps workout commands and typed outcomes to the existing Supabase operations. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Workout, RoutineWithExercises, WorkoutWithExercises } from "@/lib/db/types";

import { RoutinesDB } from "@/lib/db/routines";

import { RoutineToWorkoutConversion } from "@/lib/fitness/routine-workout-conversion";

import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";

import { log } from "@/lib/logger";

import { isRecord, isWorkoutMutationStatus, isWorkoutMutationSetType } from "./write-validation";

import type {
  WorkoutStartPersistence,
  WorkoutStartPersistenceOutcome,
  WorkoutMutationRecord,
  WorkoutExerciseMutationRecord,
  WorkoutSetMutationRecord,
  WorkoutTerminalPersistenceOutcome,
  WorkoutDetailChanges,
  WorkoutExerciseChanges,
  WorkoutSetChanges,
  WorkoutMutationPersistence,
  WorkoutUpdatePersistenceOutcome,
  WorkoutExerciseAddPersistenceOutcome,
  WorkoutExerciseUpdatePersistenceOutcome,
  WorkoutExerciseRemovePersistenceOutcome,
  WorkoutSetAddPersistenceOutcome,
  WorkoutSetUpdatePersistenceOutcome,
  WorkoutSetRemovePersistenceOutcome,
} from "./write-contract";

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

export class SupabaseWorkoutStartPersistence
  implements WorkoutStartPersistence
{
  private readonly routines: RoutinesDB;
  private readonly routineConversion: RoutineToWorkoutConversion;

  constructor(private readonly supabase: SupabaseClient) {
    this.routines = new RoutinesDB(supabase);
    this.routineConversion = new RoutineToWorkoutConversion(
      new SupabaseRoutineWorkoutStore(supabase),
    );
  }

  async startBlank(
    userId: string,
    title: string,
  ): Promise<WorkoutStartPersistenceOutcome<Workout>> {
    const { data, error } = await this.supabase
      .from("workouts")
      .insert({
        user_id: userId,
        title,
        status: "in_progress" as const,
        started_at: new Date().toISOString(),
        routine_id: null,
      })
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) return { type: "conflict" };
      log.error("Failed to start workout", error);
      throw error;
    }

    return { type: "started", workout: data };
  }

  getRoutine(
    routineId: string,
    userId: string,
  ): Promise<RoutineWithExercises | null> {
    return this.routines.getRoutine(routineId, userId);
  }

  async startRoutine(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutStartPersistenceOutcome<WorkoutWithExercises>> {
    try {
      const workout = await this.routineConversion.start(userId, routine);
      return { type: "started", workout };
    } catch (error) {
      if (isUniqueViolation(error)) return { type: "conflict" };
      throw error;
    }
  }

  updateRoutineLastPerformedAt(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void> {
    return this.routines.updateRoutineLastPerformedAt(
      routineId,
      userId,
      performedAt,
    );
  }

  markRoutinePerformed(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void> {
    return this.updateRoutineLastPerformedAt(routineId, userId, performedAt);
  }
}

function storedObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${label} returned by the database`);
  return value;
}

function storedString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  if (typeof value[key] !== "string") {
    throw new Error(`Invalid ${label} returned by the database`);
  }
  return value[key] as string;
}

function storedNullableString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  if (value[key] !== null && typeof value[key] !== "string") {
    throw new Error(`Invalid ${label} returned by the database`);
  }
  return value[key] as string | null;
}

function storedNumber(
  value: Record<string, unknown>,
  key: string,
  label: string,
): number {
  if (typeof value[key] !== "number") {
    throw new Error(`Invalid ${label} returned by the database`);
  }
  return value[key] as number;
}

function storedNullableNumber(
  value: Record<string, unknown>,
  key: string,
  label: string,
): number | null {
  if (value[key] !== null && typeof value[key] !== "number") {
    throw new Error(`Invalid ${label} returned by the database`);
  }
  return value[key] as number | null;
}

function storedBoolean(
  value: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  if (typeof value[key] !== "boolean") {
    throw new Error(`Invalid ${label} returned by the database`);
  }
  return value[key] as boolean;
}

function mapStoredWorkout(value: unknown): WorkoutMutationRecord {
  const row = storedObject(value, "workout");
  const status = row.status;
  if (!isWorkoutMutationStatus(status)) {
    throw new Error("Invalid workout status returned by the database");
  }
  return {
    id: storedString(row, "id", "workout"),
    userId: storedString(row, "user_id", "workout"),
    title: storedString(row, "title", "workout"),
    notes: storedNullableString(row, "notes", "workout"),
    startedAt: storedString(row, "started_at", "workout"),
    completedAt: storedNullableString(row, "completed_at", "workout"),
    durationSeconds: storedNullableNumber(row, "duration_seconds", "workout"),
    status,
    routineId: storedNullableString(row, "routine_id", "workout"),
    createdAt: storedString(row, "created_at", "workout"),
    updatedAt: storedString(row, "updated_at", "workout"),
  };
}

function mapStoredWorkoutExercise(
  value: unknown,
): WorkoutExerciseMutationRecord {
  const row = storedObject(value, "workout exercise");
  return {
    id: storedString(row, "id", "workout exercise"),
    workoutId: storedString(row, "workout_id", "workout exercise"),
    exerciseId: storedString(row, "exercise_id", "workout exercise"),
    sortOrder: storedNumber(row, "sort_order", "workout exercise"),
    notes: storedNullableString(row, "notes", "workout exercise"),
    restTimerSeconds: storedNumber(row, "rest_timer_seconds", "workout exercise"),
    createdAt: storedString(row, "created_at", "workout exercise"),
  };
}

function mapStoredWorkoutSet(value: unknown): WorkoutSetMutationRecord {
  const row = storedObject(value, "workout set");
  const setType = row.set_type;
  if (!isWorkoutMutationSetType(setType)) {
    throw new Error("Invalid workout set type returned by the database");
  }
  return {
    id: storedString(row, "id", "workout set"),
    workoutExerciseId: storedString(row, "workout_exercise_id", "workout set"),
    setNumber: storedNumber(row, "set_number", "workout set"),
    setType,
    weightKg: storedNullableNumber(row, "weight_kg", "workout set"),
    reps: storedNullableNumber(row, "reps", "workout set"),
    durationSeconds: storedNullableNumber(row, "duration_seconds", "workout set"),
    distanceMeters: storedNullableNumber(row, "distance_meters", "workout set"),
    isCompleted: storedBoolean(row, "is_completed", "workout set"),
    rpe: storedNullableNumber(row, "rpe", "workout set"),
    createdAt: storedString(row, "created_at", "workout set"),
    updatedAt: storedString(row, "updated_at", "workout set"),
  };
}

function mapStoredMutationOutcome(
  value: unknown,
  successType: "updated" | "added",
  recordKey: "workout" | "exercise" | "set",
  mapRecord: (value: unknown) => unknown,
): unknown {
  const outcome = storedObject(value, "workout mutation outcome");
  if (outcome.type === "not-found") return { type: "not-found" };
  if (
    outcome.type === "invalid-transition" &&
    isWorkoutMutationStatus(outcome.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: outcome.current_status,
    };
  }
  if (outcome.type === successType && Object.prototype.hasOwnProperty.call(outcome, recordKey)) {
    return { type: successType, [recordKey]: mapRecord(outcome[recordKey]) };
  }
  throw new Error("Invalid workout mutation outcome returned by the database");
}

function mapStoredTerminalOutcome(value: unknown): WorkoutTerminalPersistenceOutcome {
  const outcome = storedObject(value, "workout terminal outcome");
  if (outcome.type === "not-found") return { type: "not-found" };
  if (
    (outcome.type === "transitioned" || outcome.type === "already-applied") &&
    Object.prototype.hasOwnProperty.call(outcome, "workout")
  ) {
    return {
      type: outcome.type,
      workout: mapStoredWorkout(outcome.workout),
    };
  }
  if (
    outcome.type === "invalid-transition" &&
    isWorkoutMutationStatus(outcome.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: outcome.current_status,
    };
  }
  throw new Error("Invalid workout terminal outcome returned by the database");
}

function mapStoredRemovalOutcome(value: unknown): unknown {
  const outcome = storedObject(value, "workout mutation outcome");
  if (outcome.type === "not-found") return { type: "not-found" };
  if (
    outcome.type === "invalid-transition" &&
    isWorkoutMutationStatus(outcome.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: outcome.current_status,
    };
  }
  if (outcome.type === "removed") return { type: "removed" };
  throw new Error("Invalid workout mutation outcome returned by the database");
}

async function callWorkoutMutation<T>(
  supabase: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
  map: (value: unknown) => T,
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw error;
  return map(data);
}

function toStoredWorkoutChanges(
  changes: WorkoutDetailChanges,
): Record<string, unknown> {
  return {
    ...(changes.title === undefined ? {} : { title: changes.title }),
    ...(changes.notes === undefined ? {} : { notes: changes.notes }),
  };
}

function toStoredWorkoutExerciseChanges(
  changes: WorkoutExerciseChanges,
): Record<string, unknown> {
  return {
    ...(changes.notes === undefined ? {} : { notes: changes.notes }),
    ...(changes.restTimerSeconds === undefined
      ? {}
      : { rest_timer_seconds: changes.restTimerSeconds }),
  };
}

function toStoredWorkoutSetChanges(
  changes: WorkoutSetChanges,
): Record<string, unknown> {
  return {
    ...(changes.setType === undefined ? {} : { set_type: changes.setType }),
    ...(changes.weightKg === undefined ? {} : { weight_kg: changes.weightKg }),
    ...(changes.reps === undefined ? {} : { reps: changes.reps }),
    ...(changes.durationSeconds === undefined
      ? {}
      : { duration_seconds: changes.durationSeconds }),
    ...(changes.distanceMeters === undefined
      ? {}
      : { distance_meters: changes.distanceMeters }),
    ...(changes.isCompleted === undefined
      ? {}
      : { is_completed: changes.isCompleted }),
    ...(changes.rpe === undefined ? {} : { rpe: changes.rpe }),
  };
}

export class SupabaseWorkoutMutationPersistence
  implements WorkoutMutationPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  updateWorkout(
    userId: string,
    workoutId: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutUpdatePersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "update_active_workout",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_changes: toStoredWorkoutChanges(changes),
      },
      (value) => mapStoredMutationOutcome(value, "updated", "workout", mapStoredWorkout) as WorkoutUpdatePersistenceOutcome,
    );
  }

  completeWorkout(
    userId: string,
    workoutId: string,
    completedAt: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutTerminalPersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "complete_workout_atomically",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_completed_at: completedAt,
        p_changes: toStoredWorkoutChanges(changes),
      },
      mapStoredTerminalOutcome,
    );
  }

  discardWorkout(
    userId: string,
    workoutId: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutTerminalPersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "discard_workout_atomically",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_changes: toStoredWorkoutChanges(changes),
      },
      mapStoredTerminalOutcome,
    );
  }

  addWorkoutExercise(
    userId: string,
    workoutId: string,
    exerciseId: string,
    restTimerSeconds?: number,
  ): Promise<WorkoutExerciseAddPersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "add_active_workout_exercise",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_exercise_id: exerciseId,
        p_rest_timer_seconds: restTimerSeconds ?? 90,
      },
      (value) => mapStoredMutationOutcome(value, "added", "exercise", mapStoredWorkoutExercise) as WorkoutExerciseAddPersistenceOutcome,
    );
  }

  updateWorkoutExercise(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    changes: WorkoutExerciseChanges,
  ): Promise<WorkoutExerciseUpdatePersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "update_active_workout_exercise",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_workout_exercise_id: workoutExerciseId,
        p_changes: toStoredWorkoutExerciseChanges(changes),
      },
      (value) => mapStoredMutationOutcome(value, "updated", "exercise", mapStoredWorkoutExercise) as WorkoutExerciseUpdatePersistenceOutcome,
    );
  }

  removeWorkoutExercise(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<WorkoutExerciseRemovePersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "remove_active_workout_exercise",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_workout_exercise_id: workoutExerciseId,
      },
      (value) => mapStoredRemovalOutcome(value) as WorkoutExerciseRemovePersistenceOutcome,
    );
  }

  addWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    changes: WorkoutSetChanges,
  ): Promise<WorkoutSetAddPersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "add_active_workout_set",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_workout_exercise_id: workoutExerciseId,
        p_set: toStoredWorkoutSetChanges(changes),
      },
      (value) => mapStoredMutationOutcome(value, "added", "set", mapStoredWorkoutSet) as WorkoutSetAddPersistenceOutcome,
    );
  }

  updateWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    setId: string,
    changes: WorkoutSetChanges,
  ): Promise<WorkoutSetUpdatePersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "update_active_workout_set",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_workout_exercise_id: workoutExerciseId,
        p_set_id: setId,
        p_changes: toStoredWorkoutSetChanges(changes),
      },
      (value) => mapStoredMutationOutcome(value, "updated", "set", mapStoredWorkoutSet) as WorkoutSetUpdatePersistenceOutcome,
    );
  }

  removeWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    setId: string,
  ): Promise<WorkoutSetRemovePersistenceOutcome> {
    return callWorkoutMutation(
      this.supabase,
      "remove_active_workout_set",
      {
        p_user_id: userId,
        p_workout_id: workoutId,
        p_workout_exercise_id: workoutExerciseId,
        p_set_id: setId,
      },
      (value) => mapStoredRemovalOutcome(value) as WorkoutSetRemovePersistenceOutcome,
    );
  }
}
