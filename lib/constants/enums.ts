/**
 * Shared fitness enum constants.
 * Types are derived from these arrays in lib/db/types.ts.
 * Validation schemas reference these directly via z.enum().
 */

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "traps",
  "lats",
  "full_body",
  "cardio",
  "other",
] as const;

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "bodyweight",
  "kettlebell",
  "cable",
  "band",
  "other",
  "none",
] as const;

export const EXERCISE_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "duration_weight",
  "distance_duration",
  "weight_distance",
] as const;

export const SET_TYPES = ["warmup", "normal", "drop", "failure"] as const;

export const WORKOUT_STATUSES = [
  "in_progress",
  "completed",
  "discarded",
] as const;

export const WEIGHT_UNITS = ["kg", "lbs"] as const;
