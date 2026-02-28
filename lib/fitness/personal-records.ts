import type {
  PersonalRecord,
  WorkoutSet,
  ExerciseType,
} from "@/lib/db/types";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";

/**
 * Compute personal records from an array of completed sets.
 * Identifies the best weight, reps, volume (weight * reps), and duration
 * across all provided sets. Uses the workout_started_at enrichment to
 * determine when each PR was achieved.
 */
export function computePersonalRecords(
  exerciseId: string,
  allSets: Array<WorkoutSet & { workout_started_at: string }>
): PersonalRecord {
  const completedNormal = allSets.filter(
    (s) => s.is_completed && s.set_type === "normal"
  );

  let bestWeight: { value: number; date: string } | null = null;
  let bestVolume: { value: number; date: string } | null = null;
  let bestReps: { value: number; date: string } | null = null;
  let bestDuration: { value: number; date: string } | null = null;

  for (const set of completedNormal) {
    if (
      set.weight_kg != null &&
      set.weight_kg > 0 &&
      (!bestWeight || set.weight_kg > bestWeight.value)
    ) {
      bestWeight = { value: set.weight_kg, date: set.workout_started_at };
    }

    const volume = (set.weight_kg ?? 0) * (set.reps ?? 0);
    if (volume > 0 && (!bestVolume || volume > bestVolume.value)) {
      bestVolume = { value: volume, date: set.workout_started_at };
    }

    if (
      set.reps != null &&
      set.reps > 0 &&
      (!bestReps || set.reps > bestReps.value)
    ) {
      bestReps = { value: set.reps, date: set.workout_started_at };
    }

    if (
      set.duration_seconds != null &&
      set.duration_seconds > 0 &&
      (!bestDuration || set.duration_seconds > bestDuration.value)
    ) {
      bestDuration = {
        value: set.duration_seconds,
        date: set.workout_started_at,
      };
    }
  }

  return {
    exercise_id: exerciseId,
    best_weight_kg: bestWeight?.value ?? null,
    best_reps: bestReps?.value ?? null,
    best_volume: bestVolume?.value ?? null,
    best_duration_seconds: bestDuration?.value ?? null,
    achieved_at:
      bestWeight?.date ??
      bestVolume?.date ??
      bestReps?.date ??
      bestDuration?.date ??
      "",
  };
}

/**
 * PR check result indicating which record types were beaten.
 */
export interface PRCheckResult {
  isWeightPR: boolean;
  isVolumePR: boolean;
  isRepsPR: boolean;
  isDurationPR: boolean;
}

/**
 * Check if a completed set beats any existing personal records.
 * Uses EXERCISE_FIELD_MAP to determine which PR types are relevant
 * per exercise type:
 * - weight_reps / weighted_bodyweight / assisted_bodyweight: weight + volume PRs
 * - bodyweight_reps: reps PR only
 * - duration / duration_weight: duration PR (+ weight for duration_weight)
 * - distance_duration: duration PR
 * - weight_distance: weight PR
 */
export function isNewPR(
  set: WorkoutSet,
  exerciseType: ExerciseType,
  currentPR: PersonalRecord | null
): PRCheckResult {
  const fields = EXERCISE_FIELD_MAP[exerciseType];

  // Default: no PRs
  const result: PRCheckResult = {
    isWeightPR: false,
    isVolumePR: false,
    isRepsPR: false,
    isDurationPR: false,
  };

  if (!set.is_completed) return result;

  // Weight PR — only if the exercise tracks weight
  if (fields.showWeight && set.weight_kg != null && set.weight_kg > 0) {
    result.isWeightPR =
      currentPR?.best_weight_kg == null ||
      set.weight_kg > currentPR.best_weight_kg;
  }

  // Volume PR — only for weight+reps exercises
  if (fields.showWeight && fields.showReps) {
    const volume = (set.weight_kg ?? 0) * (set.reps ?? 0);
    if (volume > 0) {
      result.isVolumePR =
        currentPR?.best_volume == null || volume > currentPR.best_volume;
    }
  }

  // Reps PR — only if the exercise tracks reps
  if (fields.showReps && set.reps != null && set.reps > 0) {
    result.isRepsPR =
      currentPR?.best_reps == null || set.reps > currentPR.best_reps;
  }

  // Duration PR — only if the exercise tracks duration
  if (
    fields.showDuration &&
    set.duration_seconds != null &&
    set.duration_seconds > 0
  ) {
    result.isDurationPR =
      currentPR?.best_duration_seconds == null ||
      set.duration_seconds > currentPR.best_duration_seconds;
  }

  return result;
}
