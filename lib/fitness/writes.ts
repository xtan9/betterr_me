import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RoutineWithExercises,
  Workout,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { RoutinesDB } from "@/lib/db/routines";
import {
  RoutineToWorkoutConversion,
  UnsupportedRoutineDataError,
} from "@/lib/fitness/routine-workout-conversion";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import { log } from "@/lib/logger";

export type WorkoutStartSource =
  | { type: "blank"; title?: string }
  | { type: "routine"; routineId: string };

export interface WorkoutStartRequest {
  userId: string;
  source: WorkoutStartSource;
}

export type WorkoutStartRecord = Workout | WorkoutWithExercises;

export type WorkoutStartPersistenceOutcome<T extends WorkoutStartRecord> =
  | { type: "started"; workout: T }
  | { type: "conflict" };

export interface WorkoutStartPersistence {
  startBlank(
    userId: string,
    title: string,
  ): Promise<WorkoutStartPersistenceOutcome<Workout>>;
  getRoutine(
    routineId: string,
    userId: string,
  ): Promise<RoutineWithExercises | null>;
  startRoutine(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutStartPersistenceOutcome<WorkoutWithExercises>>;
  markRoutinePerformed?(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void>;
}

export type WorkoutStartOutcome =
  | { type: "started"; workout: WorkoutStartRecord }
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid-source"; message: string };

// These records deliberately use domain vocabulary rather than exposing the
// persistence row shape to mutation callers. The Supabase adapter translates
// to and from these records at the boundary.
export type WorkoutMutationStatus = "in_progress" | "completed" | "discarded";
export type WorkoutMutationSetType = "warmup" | "normal" | "drop" | "failure";

export interface WorkoutMutationRecord {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  status: WorkoutMutationStatus;
  routineId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutExerciseMutationRecord {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  notes: string | null;
  restTimerSeconds: number;
  createdAt: string;
}

export interface WorkoutSetMutationRecord {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  setType: WorkoutMutationSetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  isCompleted: boolean;
  rpe: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutDetailChanges {
  title?: string;
  notes?: string | null;
}

export interface WorkoutExerciseChanges {
  notes?: string | null;
  restTimerSeconds?: number;
}

export interface WorkoutSetChanges {
  setType?: WorkoutMutationSetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  isCompleted?: boolean;
  rpe?: number | null;
}

export interface WorkoutUpdateRequest {
  userId: string;
  workoutId: string;
  title?: string;
  notes?: string | null;
}

export interface WorkoutCompletionRequest {
  userId: string;
  workoutId: string;
  title?: string;
  notes?: string | null;
}

export interface WorkoutDiscardRequest {
  userId: string;
  workoutId: string;
  title?: string;
  notes?: string | null;
}

export interface WorkoutExerciseAddRequest {
  userId: string;
  workoutId: string;
  exerciseId: string;
  restTimerSeconds?: number;
}

export interface WorkoutExerciseUpdateRequest {
  userId: string;
  workoutId: string;
  workoutExerciseId: string;
  changes: WorkoutExerciseChanges;
}

export interface WorkoutExerciseRemoveRequest {
  userId: string;
  workoutId: string;
  workoutExerciseId: string;
}

export interface WorkoutSetAddRequest {
  userId: string;
  workoutId: string;
  workoutExerciseId: string;
  set: WorkoutSetChanges;
}

export interface WorkoutSetUpdateRequest {
  userId: string;
  workoutId: string;
  workoutExerciseId: string;
  setId: string;
  changes: WorkoutSetChanges;
}

export interface WorkoutSetRemoveRequest {
  userId: string;
  workoutId: string;
  workoutExerciseId: string;
  setId: string;
}

export type WorkoutInvalidOutcome = {
  type: "invalid";
  field: string;
  message: string;
};

export type WorkoutNotFoundOutcome = { type: "not-found" };
export type WorkoutInvalidTransitionOutcome = {
  type: "invalid-transition";
  currentStatus: WorkoutMutationStatus;
};

export type WorkoutTerminalPersistenceOutcome =
  | { type: "transitioned"; workout: WorkoutMutationRecord }
  | { type: "already-applied"; workout: WorkoutMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutUpdatePersistenceOutcome =
  | { type: "updated"; workout: WorkoutMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutExercisePersistenceOutcome =
  | { type: "added"; exercise: WorkoutExerciseMutationRecord }
  | { type: "updated"; exercise: WorkoutExerciseMutationRecord }
  | { type: "removed" }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutExerciseAddPersistenceOutcome =
  | { type: "added"; exercise: WorkoutExerciseMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;
export type WorkoutExerciseUpdatePersistenceOutcome =
  | { type: "updated"; exercise: WorkoutExerciseMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;
export type WorkoutExerciseRemovePersistenceOutcome =
  | { type: "removed" }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutSetPersistenceOutcome =
  | { type: "added"; set: WorkoutSetMutationRecord }
  | { type: "updated"; set: WorkoutSetMutationRecord }
  | { type: "removed" }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutSetAddPersistenceOutcome =
  | { type: "added"; set: WorkoutSetMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;
export type WorkoutSetUpdatePersistenceOutcome =
  | { type: "updated"; set: WorkoutSetMutationRecord }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;
export type WorkoutSetRemovePersistenceOutcome =
  | { type: "removed" }
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome;

export type WorkoutUpdateOutcome =
  | WorkoutUpdatePersistenceOutcome
  | WorkoutInvalidOutcome;
export type WorkoutExerciseAddOutcome =
  | Extract<WorkoutExercisePersistenceOutcome, { type: "added" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;
export type WorkoutExerciseUpdateOutcome =
  | Extract<WorkoutExercisePersistenceOutcome, { type: "updated" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;
export type WorkoutExerciseRemoveOutcome =
  | Extract<WorkoutExercisePersistenceOutcome, { type: "removed" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;
export type WorkoutSetAddOutcome =
  | Extract<WorkoutSetPersistenceOutcome, { type: "added" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;
export type WorkoutSetUpdateOutcome =
  | Extract<WorkoutSetPersistenceOutcome, { type: "updated" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;
export type WorkoutSetRemoveOutcome =
  | Extract<WorkoutSetPersistenceOutcome, { type: "removed" }>
  | WorkoutNotFoundOutcome
  | WorkoutInvalidTransitionOutcome
  | WorkoutInvalidOutcome;

export type WorkoutCompletionOutcome =
  | WorkoutTerminalPersistenceOutcome
  | WorkoutInvalidOutcome;
export type WorkoutDiscardOutcome =
  | WorkoutTerminalPersistenceOutcome
  | WorkoutInvalidOutcome;

export interface WorkoutMutationPersistence {
  updateWorkout(
    userId: string,
    workoutId: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutUpdatePersistenceOutcome>;
  completeWorkout(
    userId: string,
    workoutId: string,
    completedAt: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutTerminalPersistenceOutcome>;
  discardWorkout(
    userId: string,
    workoutId: string,
    changes: WorkoutDetailChanges,
  ): Promise<WorkoutTerminalPersistenceOutcome>;
  addWorkoutExercise(
    userId: string,
    workoutId: string,
    exerciseId: string,
    restTimerSeconds?: number,
  ): Promise<WorkoutExerciseAddPersistenceOutcome>;
  updateWorkoutExercise(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    changes: WorkoutExerciseChanges,
  ): Promise<WorkoutExerciseUpdatePersistenceOutcome>;
  removeWorkoutExercise(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<WorkoutExerciseRemovePersistenceOutcome>;
  addWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    changes: WorkoutSetChanges,
  ): Promise<WorkoutSetAddPersistenceOutcome>;
  updateWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    setId: string,
    changes: WorkoutSetChanges,
  ): Promise<WorkoutSetUpdatePersistenceOutcome>;
  removeWorkoutSet(
    userId: string,
    workoutId: string,
    workoutExerciseId: string,
    setId: string,
  ): Promise<WorkoutSetRemovePersistenceOutcome>;
}

type Clock = () => Date;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequest(
  request: WorkoutStartRequest,
):
  | { ok: true; userId: string; source: WorkoutStartSource }
  | { ok: false; message: string } {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return { ok: false, message: "User identity is required" };
  }

  const userId = request.userId.trim();
  if (!userId) return { ok: false, message: "User identity is required" };

  if (!isRecord(request.source) || typeof request.source.type !== "string") {
    return { ok: false, message: "Workout source is required" };
  }

  if (request.source.type === "blank") {
    if (
      request.source.title !== undefined &&
      typeof request.source.title !== "string"
    ) {
      return { ok: false, message: "Workout title must be text" };
    }

    const title = request.source.title?.trim();
    if (title && title.length > 100) {
      return {
        ok: false,
        message: "Workout title must be 100 characters or less",
      };
    }

    return {
      ok: true,
      userId,
      source: { type: "blank", ...(title ? { title } : {}) },
    };
  }

  if (request.source.type === "routine") {
    if (typeof request.source.routineId !== "string") {
      return { ok: false, message: "Routine identity is required" };
    }
    const routineId = request.source.routineId.trim();
    if (!routineId) {
      return { ok: false, message: "Routine identity is required" };
    }
    return { ok: true, userId, source: { type: "routine", routineId } };
  }

  return { ok: false, message: "Workout source is invalid" };
}

type InvalidRequest = { ok: false; outcome: WorkoutInvalidOutcome };

function invalidRequest(
  field: string,
  message: string,
): InvalidRequest {
  return { ok: false, outcome: { type: "invalid", field, message } };
}

function normalizedIdentity(
  value: unknown,
  field: string,
  label: string,
): { ok: true; value: string } | InvalidRequest {
  if (typeof value !== "string" || !value.trim()) {
    return invalidRequest(field, `${label} is required`);
  }
  return { ok: true, value: value.trim() };
}

function hasDefinedValue(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function isWorkoutMutationStatus(value: unknown): value is WorkoutMutationStatus {
  return value === "in_progress" || value === "completed" || value === "discarded";
}

function isWorkoutMutationSetType(value: unknown): value is WorkoutMutationSetType {
  return value === "warmup" || value === "normal" || value === "drop" || value === "failure";
}

function normalizeWorkoutUpdateRequest(
  request: WorkoutUpdateRequest,
):
  | { ok: true; userId: string; workoutId: string; changes: WorkoutDetailChanges }
  | InvalidRequest {
  if (!isRecord(request)) return invalidRequest("request", "Workout update is required");

  const userId = normalizedIdentity(request.userId, "userId", "User identity");
  if (!userId.ok) return userId;
  const workoutId = normalizedIdentity(
    request.workoutId,
    "workoutId",
    "Workout identity",
  );
  if (!workoutId.ok) return workoutId;

  const details = normalizeWorkoutDetailChanges(request);
  if (!details.ok) return details;

  if (Object.keys(details.changes).length === 0) {
    return invalidRequest("changes", "At least one workout field is required");
  }

  return {
    ok: true,
    userId: userId.value,
    workoutId: workoutId.value,
    changes: details.changes,
  };
}

function normalizeWorkoutTerminalRequest(
  request: WorkoutCompletionRequest | WorkoutDiscardRequest,
):
  | { ok: true; userId: string; workoutId: string; changes: WorkoutDetailChanges }
  | InvalidRequest {
  if (!isRecord(request)) {
    return invalidRequest("request", "Workout transition is required");
  }

  const userId = normalizedIdentity(request.userId, "userId", "User identity");
  if (!userId.ok) return userId;
  const workoutId = normalizedIdentity(
    request.workoutId,
    "workoutId",
    "Workout identity",
  );
  if (!workoutId.ok) return workoutId;

  const details = normalizeWorkoutDetailChanges(request);
  if (!details.ok) return details;

  return {
    ok: true,
    userId: userId.value,
    workoutId: workoutId.value,
    changes: details.changes,
  };
}

function normalizeWorkoutDetailChanges(
  value: Record<string, unknown>,
): { ok: true; changes: WorkoutDetailChanges } | InvalidRequest {
  const changes: WorkoutDetailChanges = {};

  if (hasDefinedValue(value, "title")) {
    if (typeof value.title !== "string" || !value.title.trim()) {
      return invalidRequest("title", "Workout title is required");
    }
    const title = value.title.trim();
    if (title.length > 100) {
      return invalidRequest(
        "title",
        "Workout title must be 100 characters or less",
      );
    }
    changes.title = title;
  }

  if (hasDefinedValue(value, "notes")) {
    if (value.notes !== null && typeof value.notes !== "string") {
      return invalidRequest("notes", "Workout notes must be text");
    }
    const notes = typeof value.notes === "string"
      ? value.notes.trim() || null
      : null;
    if (notes && notes.length > 2000) {
      return invalidRequest(
        "notes",
        "Workout notes must be 2000 characters or less",
      );
    }
    changes.notes = notes;
  }

  return { ok: true, changes };
}

function normalizeWorkoutExerciseChanges(
  value: unknown,
): { ok: true; changes: WorkoutExerciseChanges } | InvalidRequest {
  if (!isRecord(value)) {
    return invalidRequest("changes", "Workout exercise changes are required");
  }
  const changes: WorkoutExerciseChanges = {};

  if (hasDefinedValue(value, "notes")) {
    if (value.notes !== null && typeof value.notes !== "string") {
      return invalidRequest("notes", "Exercise notes must be text");
    }
    const notes = typeof value.notes === "string" ? value.notes.trim() || null : null;
    if (notes && notes.length > 2000) {
      return invalidRequest("notes", "Exercise notes must be 2000 characters or less");
    }
    changes.notes = notes;
  }

  if (hasDefinedValue(value, "restTimerSeconds")) {
    if (
      typeof value.restTimerSeconds !== "number" ||
      !Number.isInteger(value.restTimerSeconds) ||
      value.restTimerSeconds < 0 ||
      value.restTimerSeconds > 600
    ) {
      return invalidRequest(
        "restTimerSeconds",
        "Rest timer must be an integer between 0 and 600 seconds",
      );
    }
    changes.restTimerSeconds = value.restTimerSeconds;
  }

  if (Object.keys(changes).length === 0) {
    return invalidRequest("changes", "At least one exercise field is required");
  }
  return { ok: true, changes };
}

function normalizeNumberChange(
  value: unknown,
  field: string,
  options: { integer?: boolean; maximum?: number },
): { ok: true; value: number | null } | InvalidRequest {
  if (value === null) return { ok: true, value: null };
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (options.integer && !Number.isInteger(value)) ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    return invalidRequest(field, `${field} is invalid`);
  }
  return { ok: true, value };
}

function normalizeWorkoutSetChanges(
  value: unknown,
  options: { defaults: boolean },
): { ok: true; changes: WorkoutSetChanges } | InvalidRequest {
  if (!isRecord(value)) {
    return invalidRequest("set", "Workout set changes are required");
  }
  const changes: WorkoutSetChanges = {};

  if (hasDefinedValue(value, "setType")) {
    if (!isWorkoutMutationSetType(value.setType)) {
      return invalidRequest("setType", "Set type is invalid");
    }
    changes.setType = value.setType;
  }
  if (hasDefinedValue(value, "weightKg")) {
    const weight = normalizeNumberChange(value.weightKg, "weightKg", { maximum: 99999.99 });
    if (!weight.ok) return weight;
    changes.weightKg = weight.value;
  }
  if (hasDefinedValue(value, "reps")) {
    const reps = normalizeNumberChange(value.reps, "reps", { integer: true, maximum: 9999 });
    if (!reps.ok) return reps;
    changes.reps = reps.value;
  }
  if (hasDefinedValue(value, "durationSeconds")) {
    const duration = normalizeNumberChange(value.durationSeconds, "durationSeconds", {
      integer: true,
      maximum: 86400,
    });
    if (!duration.ok) return duration;
    changes.durationSeconds = duration.value;
  }
  if (hasDefinedValue(value, "distanceMeters")) {
    const distance = normalizeNumberChange(value.distanceMeters, "distanceMeters", {
      maximum: 999999.99,
    });
    if (!distance.ok) return distance;
    changes.distanceMeters = distance.value;
  }
  if (hasDefinedValue(value, "isCompleted")) {
    if (typeof value.isCompleted !== "boolean") {
      return invalidRequest("isCompleted", "Set completion must be boolean");
    }
    changes.isCompleted = value.isCompleted;
  }
  if (hasDefinedValue(value, "rpe")) {
    const rpe = normalizeNumberChange(value.rpe, "rpe", { integer: true, maximum: 10 });
    if (!rpe.ok) return rpe;
    if (rpe.value !== null && rpe.value < 1) {
      return invalidRequest("rpe", "RPE must be between 1 and 10");
    }
    changes.rpe = rpe.value;
  }

  if (options.defaults) {
    changes.setType ??= "normal";
    changes.isCompleted ??= false;
  } else if (Object.keys(changes).length === 0) {
    return invalidRequest("changes", "At least one set field is required");
  }
  return { ok: true, changes };
}

function normalizeNestedRequest(
  request: unknown,
  targetField: "workoutExerciseId" | "setId",
):
  | { ok: true; userId: string; workoutId: string; workoutExerciseId: string; setId?: string }
  | InvalidRequest {
  if (!isRecord(request)) return invalidRequest("request", "Workout mutation is required");
  const userId = normalizedIdentity(request.userId, "userId", "User identity");
  if (!userId.ok) return userId;
  const workoutId = normalizedIdentity(
    request.workoutId,
    "workoutId",
    "Workout identity",
  );
  if (!workoutId.ok) return workoutId;
  const workoutExerciseId = normalizedIdentity(
    request.workoutExerciseId,
    "workoutExerciseId",
    "Workout exercise identity",
  );
  if (!workoutExerciseId.ok) return workoutExerciseId;

  if (targetField === "setId") {
    const setId = normalizedIdentity(request.setId, "setId", "Workout set identity");
    if (!setId.ok) return setId;
    return {
      ok: true,
      userId: userId.value,
      workoutId: workoutId.value,
      workoutExerciseId: workoutExerciseId.value,
      setId: setId.value,
    };
  }

  return {
    ok: true,
    userId: userId.value,
    workoutId: workoutId.value,
    workoutExerciseId: workoutExerciseId.value,
  };
}

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

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
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
