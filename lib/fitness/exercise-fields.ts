import type { ExerciseType } from "@/lib/db/types";

export interface ExerciseFieldConfig {
  showWeight: boolean;
  showReps: boolean;
  showDuration: boolean;
  showDistance: boolean;
  primaryMetric: "weight" | "reps" | "duration" | "distance";
}

export const EXERCISE_FIELD_MAP: Record<ExerciseType, ExerciseFieldConfig> = {
  weight_reps: {
    showWeight: true,
    showReps: true,
    showDuration: false,
    showDistance: false,
    primaryMetric: "weight",
  },
  bodyweight_reps: {
    showWeight: false,
    showReps: true,
    showDuration: false,
    showDistance: false,
    primaryMetric: "reps",
  },
  weighted_bodyweight: {
    showWeight: true,
    showReps: true,
    showDuration: false,
    showDistance: false,
    primaryMetric: "weight",
  },
  assisted_bodyweight: {
    showWeight: true,
    showReps: true,
    showDuration: false,
    showDistance: false,
    primaryMetric: "weight",
  },
  duration: {
    showWeight: false,
    showReps: false,
    showDuration: true,
    showDistance: false,
    primaryMetric: "duration",
  },
  duration_weight: {
    showWeight: true,
    showReps: false,
    showDuration: true,
    showDistance: false,
    primaryMetric: "duration",
  },
  distance_duration: {
    showWeight: false,
    showReps: false,
    showDuration: true,
    showDistance: true,
    primaryMetric: "distance",
  },
  weight_distance: {
    showWeight: true,
    showReps: false,
    showDuration: false,
    showDistance: true,
    primaryMetric: "weight",
  },
};
