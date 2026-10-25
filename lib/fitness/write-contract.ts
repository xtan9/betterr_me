/** Workout command, outcome, and persistence contracts. */

import type { Workout, WorkoutWithExercises, RoutineWithExercises } from "@/lib/db/types";

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
  restTimerSeconds: number | null;
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
  | WorkoutInvalidOutcome
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

export type Clock = () => Date;

export type InvalidRequest = { ok: false; outcome: WorkoutInvalidOutcome };
