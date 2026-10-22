/** Workout commands and their production composition; callers keep one mutation interface. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkoutWithExercises } from "@/lib/db/types";

import { UnsupportedRoutineDataError } from "@/lib/fitness/routine-workout-conversion";

import { log } from "@/lib/logger";

import type {
  WorkoutStartPersistence,
  WorkoutMutationPersistence,
  Clock,
  WorkoutStartRequest,
  WorkoutStartOutcome,
  WorkoutStartPersistenceOutcome,
  WorkoutUpdateRequest,
  WorkoutUpdateOutcome,
  WorkoutCompletionRequest,
  WorkoutCompletionOutcome,
  WorkoutDiscardRequest,
  WorkoutDiscardOutcome,
  WorkoutExerciseAddRequest,
  WorkoutExerciseAddOutcome,
  WorkoutExerciseUpdateRequest,
  WorkoutExerciseUpdateOutcome,
  WorkoutExerciseRemoveRequest,
  WorkoutExerciseRemoveOutcome,
  WorkoutSetAddRequest,
  WorkoutSetAddOutcome,
  WorkoutSetUpdateRequest,
  WorkoutSetUpdateOutcome,
  WorkoutSetRemoveRequest,
  WorkoutSetRemoveOutcome,
  WorkoutMutationRecord,
  WorkoutExerciseMutationRecord,
  WorkoutSetMutationRecord,
} from "./write-contract";

import {
  normalizeRequest,
  normalizeWorkoutUpdateRequest,
  normalizeWorkoutTerminalRequest,
  isRecord,
  invalidRequest,
  normalizedIdentity,
  normalizeNestedRequest,
  normalizeWorkoutExerciseChanges,
  normalizeWorkoutSetChanges,
} from "./write-validation";

import {
  SupabaseWorkoutStartPersistence,
  SupabaseWorkoutMutationPersistence,
} from "./workout-persistence";

export type {
  WorkoutStartSource,
  WorkoutStartRequest,
  WorkoutStartRecord,
  WorkoutStartPersistenceOutcome,
  WorkoutStartPersistence,
  WorkoutStartOutcome,
  WorkoutMutationStatus,
  WorkoutMutationSetType,
  WorkoutMutationRecord,
  WorkoutExerciseMutationRecord,
  WorkoutSetMutationRecord,
  WorkoutDetailChanges,
  WorkoutExerciseChanges,
  WorkoutSetChanges,
  WorkoutUpdateRequest,
  WorkoutCompletionRequest,
  WorkoutDiscardRequest,
  WorkoutExerciseAddRequest,
  WorkoutExerciseUpdateRequest,
  WorkoutExerciseRemoveRequest,
  WorkoutSetAddRequest,
  WorkoutSetUpdateRequest,
  WorkoutSetRemoveRequest,
  WorkoutInvalidOutcome,
  WorkoutNotFoundOutcome,
  WorkoutInvalidTransitionOutcome,
  WorkoutTerminalPersistenceOutcome,
  WorkoutUpdatePersistenceOutcome,
  WorkoutExercisePersistenceOutcome,
  WorkoutExerciseAddPersistenceOutcome,
  WorkoutExerciseUpdatePersistenceOutcome,
  WorkoutExerciseRemovePersistenceOutcome,
  WorkoutSetPersistenceOutcome,
  WorkoutSetAddPersistenceOutcome,
  WorkoutSetUpdatePersistenceOutcome,
  WorkoutSetRemovePersistenceOutcome,
  WorkoutUpdateOutcome,
  WorkoutExerciseAddOutcome,
  WorkoutExerciseUpdateOutcome,
  WorkoutExerciseRemoveOutcome,
  WorkoutSetAddOutcome,
  WorkoutSetUpdateOutcome,
  WorkoutSetRemoveOutcome,
  WorkoutCompletionOutcome,
  WorkoutDiscardOutcome,
  WorkoutMutationPersistence,
} from "./write-contract";

export {
  SupabaseWorkoutStartPersistence,
  SupabaseWorkoutMutationPersistence,
} from "./workout-persistence";

export class WorkoutWrites {
  constructor(
    private readonly persistence: Partial<
      WorkoutStartPersistence & WorkoutMutationPersistence
    >,
    private readonly now: Clock = () => new Date(),
  ) {}

  async start(request: WorkoutStartRequest): Promise<WorkoutStartOutcome> {
    if (
      !this.persistence.startBlank ||
      !this.persistence.getRoutine ||
      !this.persistence.startRoutine
    ) {
      throw new Error("Workout starts are not supported by this persistence");
    }

    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return { type: "invalid-source", message: normalized.message };
    }

    if (normalized.source.type === "blank") {
      return this.persistence.startBlank(
        normalized.userId,
        normalized.source.title ?? "Workout",
      );
    }

    const routine = await this.persistence.getRoutine(
      normalized.source.routineId,
      normalized.userId,
    );
    if (!routine) return { type: "not-found" };

    let outcome: WorkoutStartPersistenceOutcome<WorkoutWithExercises>;
    try {
      outcome = await this.persistence.startRoutine(normalized.userId, routine);
    } catch (error) {
      if (isUnsupportedRoutineDataError(error)) {
        return { type: "invalid-source", message: error.message };
      }
      throw error;
    }

    if (outcome.type === "conflict") return outcome;

    if (this.persistence.markRoutinePerformed) {
      try {
        await this.persistence.markRoutinePerformed(
          normalized.source.routineId,
          normalized.userId,
          this.now().toISOString(),
        );
      } catch (error) {
        log.error("Failed to update routine last_performed_at", error, {
          routineId: normalized.source.routineId,
        });
      }
    }

    return outcome;
  }

  async update(request: WorkoutUpdateRequest): Promise<WorkoutUpdateOutcome> {
    const normalized = normalizeWorkoutUpdateRequest(request);
    if (!normalized.ok) return normalized.outcome;
    if (!this.persistence.updateWorkout) {
      throw new Error("Workout updates are not supported by this persistence");
    }

    return this.persistence.updateWorkout(
      normalized.userId,
      normalized.workoutId,
      normalized.changes,
    );
  }

  async complete(
    request: WorkoutCompletionRequest,
  ): Promise<WorkoutCompletionOutcome> {
    const normalized = normalizeWorkoutTerminalRequest(request);
    if (!normalized.ok) return normalized.outcome;
    if (!this.persistence.completeWorkout) {
      throw new Error("Workout completion is not supported by this persistence");
    }

    return this.persistence.completeWorkout(
      normalized.userId,
      normalized.workoutId,
      this.now().toISOString(),
      normalized.changes,
    );
  }

  async discard(
    request: WorkoutDiscardRequest,
  ): Promise<WorkoutDiscardOutcome> {
    const normalized = normalizeWorkoutTerminalRequest(request);
    if (!normalized.ok) return normalized.outcome;
    if (!this.persistence.discardWorkout) {
      throw new Error("Workout discard is not supported by this persistence");
    }

    return this.persistence.discardWorkout(
      normalized.userId,
      normalized.workoutId,
      normalized.changes,
    );
  }

  async addExercise(
    request: WorkoutExerciseAddRequest,
  ): Promise<WorkoutExerciseAddOutcome> {
    if (!this.persistence.addWorkoutExercise) {
      throw new Error("Workout exercise additions are not supported by this persistence");
    }
    if (!isRecord(request)) return invalidRequest("request", "Workout exercise is required").outcome;

    const userId = normalizedIdentity(request.userId, "userId", "User identity");
    if (!userId.ok) return userId.outcome;
    const workoutId = normalizedIdentity(
      request.workoutId,
      "workoutId",
      "Workout identity",
    );
    if (!workoutId.ok) return workoutId.outcome;
    const exerciseId = normalizedIdentity(
      request.exerciseId,
      "exerciseId",
      "Exercise identity",
    );
    if (!exerciseId.ok) return exerciseId.outcome;

    let restTimerSeconds: number | undefined;
    if (request.restTimerSeconds !== undefined) {
      if (
        typeof request.restTimerSeconds !== "number" ||
        !Number.isInteger(request.restTimerSeconds) ||
        request.restTimerSeconds < 0 ||
        request.restTimerSeconds > 600
      ) {
        return invalidRequest(
          "restTimerSeconds",
          "Rest timer must be an integer between 0 and 600 seconds",
        ).outcome;
      }
      restTimerSeconds = request.restTimerSeconds;
    }

    return this.persistence.addWorkoutExercise(
      userId.value,
      workoutId.value,
      exerciseId.value,
      restTimerSeconds,
    );
  }

  async updateExercise(
    request: WorkoutExerciseUpdateRequest,
  ): Promise<WorkoutExerciseUpdateOutcome> {
    if (!this.persistence.updateWorkoutExercise) {
      throw new Error("Workout exercise updates are not supported by this persistence");
    }
    const target = normalizeNestedRequest(request, "workoutExerciseId");
    if (!target.ok) return target.outcome;
    const changes = normalizeWorkoutExerciseChanges(request.changes);
    if (!changes.ok) return changes.outcome;

    return this.persistence.updateWorkoutExercise(
      target.userId,
      target.workoutId,
      target.workoutExerciseId,
      changes.changes,
    );
  }

  async removeExercise(
    request: WorkoutExerciseRemoveRequest,
  ): Promise<WorkoutExerciseRemoveOutcome> {
    if (!this.persistence.removeWorkoutExercise) {
      throw new Error("Workout exercise removals are not supported by this persistence");
    }
    const target = normalizeNestedRequest(request, "workoutExerciseId");
    if (!target.ok) return target.outcome;

    return this.persistence.removeWorkoutExercise(
      target.userId,
      target.workoutId,
      target.workoutExerciseId,
    );
  }

  async addSet(request: WorkoutSetAddRequest): Promise<WorkoutSetAddOutcome> {
    if (!this.persistence.addWorkoutSet) {
      throw new Error("Workout set additions are not supported by this persistence");
    }
    const target = normalizeNestedRequest(request, "workoutExerciseId");
    if (!target.ok) return target.outcome;
    const changes = normalizeWorkoutSetChanges(request.set, { defaults: true });
    if (!changes.ok) return changes.outcome;

    return this.persistence.addWorkoutSet(
      target.userId,
      target.workoutId,
      target.workoutExerciseId,
      changes.changes,
    );
  }

  async updateSet(
    request: WorkoutSetUpdateRequest,
  ): Promise<WorkoutSetUpdateOutcome> {
    if (!this.persistence.updateWorkoutSet) {
      throw new Error("Workout set updates are not supported by this persistence");
    }
    const target = normalizeNestedRequest(request, "setId");
    if (!target.ok) return target.outcome;
    const changes = normalizeWorkoutSetChanges(request.changes, { defaults: false });
    if (!changes.ok) return changes.outcome;

    return this.persistence.updateWorkoutSet(
      target.userId,
      target.workoutId,
      target.workoutExerciseId,
      target.setId!,
      changes.changes,
    );
  }

  async removeSet(
    request: WorkoutSetRemoveRequest,
  ): Promise<WorkoutSetRemoveOutcome> {
    if (!this.persistence.removeWorkoutSet) {
      throw new Error("Workout set removals are not supported by this persistence");
    }
    const target = normalizeNestedRequest(request, "setId");
    if (!target.ok) return target.outcome;

    return this.persistence.removeWorkoutSet(
      target.userId,
      target.workoutId,
      target.workoutExerciseId,
      target.setId!,
    );
  }
}

function isUnsupportedRoutineDataError(
  error: unknown,
): error is UnsupportedRoutineDataError {
  const isInstance =
    typeof UnsupportedRoutineDataError === "function" &&
    error instanceof UnsupportedRoutineDataError;
  return (
    isInstance ||
    (isRecord(error) && error.code === "UNSUPPORTED_ROUTINE_DATA")
  );
}

export function toWorkoutResponse(workout: WorkoutMutationRecord) {
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

export function toWorkoutExerciseResponse(
  exercise: WorkoutExerciseMutationRecord,
) {
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

export function toWorkoutSetResponse(set: WorkoutSetMutationRecord) {
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

export function createWorkoutWrites(supabase: SupabaseClient): WorkoutWrites {
  const starts = new SupabaseWorkoutStartPersistence(supabase);
  const mutations = new SupabaseWorkoutMutationPersistence(supabase);
  return new WorkoutWrites({
    startBlank: starts.startBlank.bind(starts),
    getRoutine: starts.getRoutine.bind(starts),
    startRoutine: starts.startRoutine.bind(starts),
    markRoutinePerformed: starts.markRoutinePerformed?.bind(starts),
    updateWorkout: mutations.updateWorkout.bind(mutations),
    completeWorkout: mutations.completeWorkout.bind(mutations),
    discardWorkout: mutations.discardWorkout.bind(mutations),
    addWorkoutExercise: mutations.addWorkoutExercise.bind(mutations),
    updateWorkoutExercise: mutations.updateWorkoutExercise.bind(mutations),
    removeWorkoutExercise: mutations.removeWorkoutExercise.bind(mutations),
    addWorkoutSet: mutations.addWorkoutSet.bind(mutations),
    updateWorkoutSet: mutations.updateWorkoutSet.bind(mutations),
    removeWorkoutSet: mutations.removeWorkoutSet.bind(mutations),
  });
}
