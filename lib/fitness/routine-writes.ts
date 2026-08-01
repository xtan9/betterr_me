import type { SupabaseClient } from "@supabase/supabase-js";
import { RoutinesDB } from "@/lib/db/routines";
import type {
  Routine,
  RoutineExercise,
  RoutineWithExercises,
} from "@/lib/db/types";

export interface RoutineExerciseInput {
  exerciseId: string;
  targetSets?: number;
  targetReps?: number | null;
  targetWeightKg?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restTimerSeconds?: number;
  notes?: string | null;
}

export interface RoutineExerciseChanges {
  targetSets?: number;
  targetReps?: number | null;
  targetWeightKg?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restTimerSeconds?: number;
  notes?: string | null;
  sortOrder?: number;
}

export interface RoutineCreationRequest {
  userId: string;
  name: string;
  notes?: string | null;
}

export interface RoutineUpdateRequest {
  userId: string;
  routineId: string;
  changes: { name?: string; notes?: string | null };
}

export interface RoutineDeletionRequest {
  userId: string;
  routineId: string;
}

export interface RoutineExerciseAddRequest {
  userId: string;
  routineId: string;
  exercise: RoutineExerciseInput;
}

export interface RoutineExerciseUpdateRequest {
  userId: string;
  routineId: string;
  routineExerciseId: string;
  changes: RoutineExerciseChanges;
}

export interface RoutineExerciseRemovalRequest {
  userId: string;
  routineId: string;
  routineExerciseId: string;
}

export type RoutineNotFoundOutcome = { type: "not-found" };
export type RoutineCreationOutcome =
  | { type: "created"; routine: Routine }
  | RoutineNotFoundOutcome;
export type RoutineUpdateOutcome =
  | { type: "updated"; routine: Routine }
  | RoutineNotFoundOutcome;
export type RoutineDeletionOutcome =
  | { type: "deleted" }
  | RoutineNotFoundOutcome;
export type RoutineExerciseAddOutcome =
  | { type: "added"; exercise: RoutineExercise }
  | RoutineNotFoundOutcome;
export type RoutineExerciseUpdateOutcome =
  | { type: "updated"; exercise: RoutineExercise }
  | RoutineNotFoundOutcome;
export type RoutineExerciseRemovalOutcome =
  | { type: "removed" }
  | RoutineNotFoundOutcome;

export interface RoutineWritesPersistence {
  getRoutine(
    routineId: string,
    userId: string,
  ): Promise<RoutineWithExercises | null>;
  createRoutine(
    userId: string,
    data: { name: string; notes?: string | null },
  ): Promise<Routine>;
  updateRoutine(
    routineId: string,
    changes: { name?: string; notes?: string | null },
  ): Promise<Routine>;
  deleteRoutine(routineId: string): Promise<void>;
  getRoutineExercise(
    routineExerciseId: string,
    userId: string,
  ): Promise<RoutineExercise | null>;
  addExerciseToRoutine(
    routineId: string,
    exercise: RoutineExerciseInput,
  ): Promise<RoutineExercise>;
  updateRoutineExercise(
    routineExerciseId: string,
    changes: RoutineExerciseChanges,
  ): Promise<RoutineExercise>;
  removeRoutineExercise(routineExerciseId: string): Promise<void>;
}

function toStoredRoutineExerciseInput(
  exercise: RoutineExerciseInput,
): Parameters<RoutinesDB["addExerciseToRoutine"]>[1] {
  return {
    exercise_id: exercise.exerciseId,
    target_sets: exercise.targetSets,
    target_reps: exercise.targetReps,
    target_weight_kg: exercise.targetWeightKg,
    target_duration_seconds: exercise.targetDurationSeconds,
    target_distance_meters: exercise.targetDistanceMeters,
    rest_timer_seconds: exercise.restTimerSeconds,
    notes: exercise.notes,
  };
}

function toStoredRoutineExerciseChanges(
  changes: RoutineExerciseChanges,
): Parameters<RoutinesDB["updateRoutineExercise"]>[1] {
  return {
    ...(changes.targetSets !== undefined && { target_sets: changes.targetSets }),
    ...(changes.targetReps !== undefined && { target_reps: changes.targetReps }),
    ...(changes.targetWeightKg !== undefined && {
      target_weight_kg: changes.targetWeightKg,
    }),
    ...(changes.targetDurationSeconds !== undefined && {
      target_duration_seconds: changes.targetDurationSeconds,
    }),
    ...(changes.targetDistanceMeters !== undefined && {
      target_distance_meters: changes.targetDistanceMeters,
    }),
    ...(changes.restTimerSeconds !== undefined && {
      rest_timer_seconds: changes.restTimerSeconds,
    }),
    ...(changes.notes !== undefined && { notes: changes.notes }),
    ...(changes.sortOrder !== undefined && { sort_order: changes.sortOrder }),
  };
}

export class RoutineWrites {
  constructor(private readonly persistence: RoutineWritesPersistence) {}

  async create(
    request: RoutineCreationRequest,
  ): Promise<RoutineCreationOutcome> {
    return {
      type: "created",
      routine: await this.persistence.createRoutine(request.userId, {
        name: request.name,
        notes: request.notes,
      }),
    };
  }

  async update(request: RoutineUpdateRequest): Promise<RoutineUpdateOutcome> {
    const routine = await this.persistence.getRoutine(
      request.routineId,
      request.userId,
    );
    if (!routine) return { type: "not-found" };

    return {
      type: "updated",
      routine: await this.persistence.updateRoutine(
        request.routineId,
        request.changes,
      ),
    };
  }

  async delete(
    request: RoutineDeletionRequest,
  ): Promise<RoutineDeletionOutcome> {
    const routine = await this.persistence.getRoutine(
      request.routineId,
      request.userId,
    );
    if (!routine) return { type: "not-found" };

    await this.persistence.deleteRoutine(request.routineId);
    return { type: "deleted" };
  }

  async addExercise(
    request: RoutineExerciseAddRequest,
  ): Promise<RoutineExerciseAddOutcome> {
    const routine = await this.persistence.getRoutine(
      request.routineId,
      request.userId,
    );
    if (!routine) return { type: "not-found" };

    return {
      type: "added",
      exercise: await this.persistence.addExerciseToRoutine(
        request.routineId,
        request.exercise,
      ),
    };
  }

  async updateExercise(
    request: RoutineExerciseUpdateRequest,
  ): Promise<RoutineExerciseUpdateOutcome> {
    const exercise = await this.persistence.getRoutineExercise(
      request.routineExerciseId,
      request.userId,
    );
    if (!exercise || exercise.routine_id !== request.routineId) {
      return { type: "not-found" };
    }

    return {
      type: "updated",
      exercise: await this.persistence.updateRoutineExercise(
        request.routineExerciseId,
        request.changes,
      ),
    };
  }

  async removeExercise(
    request: RoutineExerciseRemovalRequest,
  ): Promise<RoutineExerciseRemovalOutcome> {
    const exercise = await this.persistence.getRoutineExercise(
      request.routineExerciseId,
      request.userId,
    );
    if (!exercise || exercise.routine_id !== request.routineId) {
      return { type: "not-found" };
    }

    await this.persistence.removeRoutineExercise(request.routineExerciseId);
    return { type: "removed" };
  }
}

export function createRoutineWrites(supabase: SupabaseClient): RoutineWrites {
  const routines = new RoutinesDB(supabase);
  return new RoutineWrites({
    getRoutine: routines.getRoutine.bind(routines),
    createRoutine: routines.createRoutine.bind(routines),
    updateRoutine: routines.updateRoutine.bind(routines),
    deleteRoutine: routines.deleteRoutine.bind(routines),
    getRoutineExercise: routines.getRoutineExercise.bind(routines),
    addExerciseToRoutine: (routineId, exercise) =>
      routines.addExerciseToRoutine(
        routineId,
        toStoredRoutineExerciseInput(exercise),
      ),
    updateRoutineExercise: (routineExerciseId, changes) =>
      routines.updateRoutineExercise(
        routineExerciseId,
        toStoredRoutineExerciseChanges(changes),
      ),
    removeRoutineExercise: routines.removeRoutineExercise.bind(routines),
  });
}
