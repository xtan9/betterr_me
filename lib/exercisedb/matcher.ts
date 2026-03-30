import { findBestMatch } from "string-similarity";
import type { ExerciseDBEntry } from "./types";
import type { Exercise } from "@/lib/db/types";
import { mapToMuscleGroup, mapEquipment } from "./muscle-map";

export interface MatchResult {
  exercise: Exercise;
  match: ExerciseDBEntry | null;
  confidence: number;
  equipmentMatch: boolean;
  muscleMatch: boolean;
  verified: boolean;
}

/**
 * Normalize a name for comparison: lowercase, strip non-alphanumeric (keep spaces), trim.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Match our exercises to ExerciseDB entries using multi-signal scoring.
 *
 * Signals:
 * 1. Name similarity (Dice coefficient) >= threshold
 * 2. Equipment match (after mapping ExerciseDB equipment to our enum)
 * 3. Muscle group match (after mapping ExerciseDB bodyPart+target to our enum)
 *
 * A match is accepted only if at least 2 of 3 signals agree.
 */
export function matchExercises(
  ourExercises: Exercise[],
  dbExercises: ExerciseDBEntry[],
  threshold = 0.5
): MatchResult[] {
  if (dbExercises.length === 0) {
    return ourExercises.map((exercise) => ({
      exercise,
      match: null,
      confidence: 0,
      equipmentMatch: false,
      muscleMatch: false,
      verified: false,
    }));
  }

  const normalizedDbNames = dbExercises.map((e) => normalizeName(e.name));

  return ourExercises.map((exercise) => {
    const normalizedName = normalizeName(exercise.name);

    if (!normalizedName) {
      return {
        exercise,
        match: null,
        confidence: 0,
        equipmentMatch: false,
        muscleMatch: false,
        verified: false,
      };
    }

    const result = findBestMatch(normalizedName, normalizedDbNames);
    const bestMatchIndex = result.bestMatchIndex;
    const confidence = result.bestMatch.rating;
    const bestDbExercise = dbExercises[bestMatchIndex];

    const equipmentMatch =
      mapEquipment(bestDbExercise.equipment) === exercise.equipment;
    const muscleMatch =
      mapToMuscleGroup(bestDbExercise.bodyPart, bestDbExercise.target) ===
      exercise.muscle_group_primary;

    const signalCount = [
      confidence >= threshold,
      equipmentMatch,
      muscleMatch,
    ].filter(Boolean).length;

    return {
      exercise,
      match: signalCount >= 2 ? bestDbExercise : null,
      confidence,
      equipmentMatch,
      muscleMatch,
      verified: false,
    };
  });
}
