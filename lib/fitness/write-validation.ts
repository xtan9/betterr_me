/** Normalizes workout commands before any persistence operation. */

import type {
  WorkoutStartRequest,
  WorkoutStartSource,
  InvalidRequest,
  WorkoutMutationStatus,
  WorkoutMutationSetType,
  WorkoutUpdateRequest,
  WorkoutDetailChanges,
  WorkoutCompletionRequest,
  WorkoutDiscardRequest,
  WorkoutExerciseChanges,
  WorkoutSetChanges,
} from "./write-contract";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeRequest(
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

export function invalidRequest(
  field: string,
  message: string,
): InvalidRequest {
  return { ok: false, outcome: { type: "invalid", field, message } };
}

export function normalizedIdentity(
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

export function isWorkoutMutationStatus(value: unknown): value is WorkoutMutationStatus {
  return value === "in_progress" || value === "completed" || value === "discarded";
}

export function isWorkoutMutationSetType(value: unknown): value is WorkoutMutationSetType {
  return value === "warmup" || value === "normal" || value === "drop" || value === "failure";
}

export function normalizeWorkoutUpdateRequest(
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

export function normalizeWorkoutTerminalRequest(
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

export function normalizeWorkoutExerciseChanges(
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

export function normalizeWorkoutSetChanges(
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
    const weight = normalizeNumberChange(value.weightKg, "weightKg", { maximum: Number.MAX_VALUE });
    if (!weight.ok) return weight;
    changes.weightKg = weight.value;
  }
  if (hasDefinedValue(value, "reps")) {
    const reps = normalizeNumberChange(value.reps, "reps", { integer: true, maximum: Number.MAX_SAFE_INTEGER });
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

export function normalizeNestedRequest(
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
