import type {
  RoutineExercise,
  RoutineWithExercises,
  WorkoutExercise,
  WorkoutSet,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { SET_TYPES } from "@/lib/constants/enums";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import {
  routineCreateSchema,
  routineExerciseAddSchema,
  routineExerciseUpdateSchema,
} from "@/lib/validations/routine";
import { workoutSetCreateSchema } from "@/lib/validations/workout";

type WorkoutExerciseInput = Omit<
  WorkoutExercise,
  "id" | "workout_id" | "created_at"
>;

type WorkoutSetInput = Omit<
  WorkoutSet,
  "id" | "workout_exercise_id" | "created_at" | "updated_at"
>;

export interface ConvertedRoutineExercise {
  exercise: WorkoutExerciseInput;
  sets: WorkoutSetInput[];
}

export interface RoutineWorkoutSessionInput {
  title: string;
  routine_id: string;
  exercises: ConvertedRoutineExercise[];
}

export interface RoutineWorkoutStore {
  /**
   * Persists the session atomically and returns its complete nested state.
   * A rejection must leave no workout, exercise, or set rows behind.
   */
  createSession(
    userId: string,
    input: RoutineWorkoutSessionInput,
  ): Promise<WorkoutWithExercises>;
}

type WorkoutRoutineExerciseInput = Omit<
  RoutineExercise,
  "id" | "routine_id" | "created_at"
>;

export interface WorkoutRoutineInput {
  name: string;
  notes: string | null;
  exercises: WorkoutRoutineExerciseInput[];
}

export interface WorkoutRoutineStore {
  /**
   * Persists the complete routine atomically. A rejection must leave no
   * routine or routine-exercise rows behind.
   */
  createRoutine(
    userId: string,
    input: WorkoutRoutineInput,
  ): Promise<RoutineWithExercises>;
}

export class UnsupportedRoutineDataError extends Error {
  readonly code = "UNSUPPORTED_ROUTINE_DATA";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedRoutineDataError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidRoutineExerciseInput(
  input: WorkoutRoutineExerciseInput,
): boolean {
  return (
    routineExerciseAddSchema.safeParse(input).success &&
    routineExerciseUpdateSchema.safeParse({ sort_order: input.sort_order })
      .success
  );
}

/**
 * Converts a routine template into one complete workout session.
 *
 * The routine is fully converted before persistence starts. Once persistence
 * starts, the store's transaction either returns every row or commits none.
 */
export class RoutineToWorkoutConversion {
  constructor(private store: RoutineWorkoutStore) {}

  async start(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutWithExercises> {
    if (!isRecord(routine) || !Array.isArray(routine.exercises)) {
      throw new UnsupportedRoutineDataError(
        "Routine contains unsupported source data",
      );
    }

    const routineValidation = routineCreateSchema.safeParse({
      name: routine.name,
      notes: routine.notes,
    });
    if (!routineValidation.success) {
      throw new UnsupportedRoutineDataError(
        `Routine ${routine.id} contains unsupported source data`,
      );
    }

    const routineExercises = routine.exercises.map((routineExercise) => {
      if (
        !isRecord(routineExercise) ||
        !isRecord(routineExercise.exercise) ||
        typeof routineExercise.exercise.exercise_type !== "string"
      ) {
        throw new UnsupportedRoutineDataError(
          "Routine exercise contains unsupported source data",
        );
      }
      return routineExercise;
    });

    const exercises = [...routineExercises]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((routineExercise): ConvertedRoutineExercise => {
        if (
          !Number.isInteger(routineExercise.target_sets) ||
          routineExercise.target_sets < 1
        ) {
          throw new UnsupportedRoutineDataError(
            `Routine exercise ${routineExercise.id} has an invalid target set count`,
          );
        }
        const convertedSource: WorkoutRoutineExerciseInput = {
          exercise_id: routineExercise.exercise_id,
          sort_order: routineExercise.sort_order,
          target_sets: routineExercise.target_sets,
          target_reps: routineExercise.target_reps,
          target_weight_kg: routineExercise.target_weight_kg,
          target_duration_seconds: routineExercise.target_duration_seconds,
          target_distance_meters: routineExercise.target_distance_meters,
          rest_timer_seconds: routineExercise.rest_timer_seconds,
          notes: routineExercise.notes,
        };
        if (!isValidRoutineExerciseInput(convertedSource)) {
          throw new UnsupportedRoutineDataError(
            `Routine exercise ${routineExercise.id} contains unsupported source data`,
          );
        }
        const fields = EXERCISE_FIELD_MAP[routineExercise.exercise.exercise_type];
        if (!fields) {
          throw new UnsupportedRoutineDataError(
            `Unsupported exercise type: ${routineExercise.exercise.exercise_type}`,
          );
        }
        const sets = Array.from(
          { length: routineExercise.target_sets },
          (_, index): WorkoutSetInput => ({
            set_number: index + 1,
            set_type: "normal",
            weight_kg: fields.showWeight
              ? routineExercise.target_weight_kg
              : null,
            reps: fields.showReps ? routineExercise.target_reps : null,
            duration_seconds: fields.showDuration
              ? routineExercise.target_duration_seconds
              : null,
            distance_meters: fields.showDistance
              ? routineExercise.target_distance_meters
              : null,
            is_completed: false,
            rpe: null,
          }),
        );

        return {
          exercise: {
            exercise_id: routineExercise.exercise_id,
            sort_order: routineExercise.sort_order,
            notes: routineExercise.notes,
            rest_timer_seconds: routineExercise.rest_timer_seconds,
          },
          sets,
        };
      });

    return this.store.createSession(userId, {
      title: routine.name,
      routine_id: routine.id,
      exercises,
    });
  }
}

export class UnsupportedWorkoutDataError extends Error {
  readonly code = "UNSUPPORTED_WORKOUT_DATA";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedWorkoutDataError";
  }
}

function reusableTargetMetric(
  set: WorkoutSet,
  primaryMetric: "weight" | "reps" | "duration" | "distance",
): number {
  switch (primaryMetric) {
    case "weight":
      return set.weight_kg ?? Number.NEGATIVE_INFINITY;
    case "reps":
      return set.reps ?? Number.NEGATIVE_INFINITY;
    case "duration":
      return set.duration_seconds ?? Number.NEGATIVE_INFINITY;
    case "distance":
      return set.distance_meters ?? Number.NEGATIVE_INFINITY;
  }
}

/**
 * Converts a workout into a reusable routine through the inverse rules used by
 * RoutineToWorkoutConversion.
 *
 * Only normal sets are reusable targets; warmup, drop, and failure sets are
 * session-specific. Completed normal sets win when present, otherwise planned
 * normal sets are used so a routine-start round trip preserves its targets.
 * One representative set is selected by the exercise's primary metric, and
 * all applicable routine targets come from that same set.
 */
export class WorkoutToRoutineConversion {
  constructor(private store: WorkoutRoutineStore) {}

  async save(
    userId: string,
    name: string,
    workout: WorkoutWithExercises,
  ): Promise<RoutineWithExercises> {
    const routineValidation = routineCreateSchema.safeParse({
      name,
      notes: null,
    });
    if (!routineValidation.success) {
      throw new UnsupportedWorkoutDataError(
        "Workout cannot be converted to a routine with the requested name",
      );
    }
    if (!isRecord(workout) || !Array.isArray(workout.exercises)) {
      throw new UnsupportedWorkoutDataError(
        "Workout contains unsupported source data",
      );
    }

    const workoutExercises = workout.exercises.map((workoutExercise) => {
      if (
        !isRecord(workoutExercise) ||
        !isRecord(workoutExercise.exercise) ||
        typeof workoutExercise.exercise.exercise_type !== "string" ||
        !Array.isArray(workoutExercise.sets)
      ) {
        throw new UnsupportedWorkoutDataError(
          "Workout exercise contains unsupported source data",
        );
      }
      return workoutExercise;
    });

    const exercises = [...workoutExercises]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((workoutExercise): WorkoutRoutineExerciseInput => {
        const fields = EXERCISE_FIELD_MAP[workoutExercise.exercise.exercise_type];
        if (!fields) {
          throw new UnsupportedWorkoutDataError(
            `Unsupported exercise type: ${workoutExercise.exercise.exercise_type}`,
          );
        }

        if (
          workoutExercise.sets.some(
            (set) =>
              !isRecord(set) ||
              !SET_TYPES.includes(set.set_type as (typeof SET_TYPES)[number]) ||
              !Number.isInteger(set.set_number) ||
              (set.set_number as number) < 1 ||
              !workoutSetCreateSchema.safeParse({
                set_type: set.set_type,
                weight_kg: set.weight_kg,
                reps: set.reps,
                duration_seconds: set.duration_seconds,
                distance_meters: set.distance_meters,
                rpe: set.rpe,
                is_completed: set.is_completed,
              }).success,
          )
        ) {
          throw new UnsupportedWorkoutDataError(
            `Workout exercise ${workoutExercise.id} has an unsupported set type`,
          );
        }

        const normalSets = workoutExercise.sets.filter(
          (set) => isRecord(set) && set.set_type === "normal",
        );
        const completedNormalSets = normalSets.filter(
          (set) => set.is_completed,
        );
        const reusableSets =
          completedNormalSets.length > 0 ? completedNormalSets : normalSets;
        if (reusableSets.length === 0) {
          throw new UnsupportedWorkoutDataError(
            `Workout exercise ${workoutExercise.id} has no reusable normal sets`,
          );
        }

        const representativeSet = reusableSets.reduce((best, candidate) =>
          reusableTargetMetric(candidate, fields.primaryMetric) >
          reusableTargetMetric(best, fields.primaryMetric)
            ? candidate
            : best,
        );
        const converted: WorkoutRoutineExerciseInput = {
          exercise_id: workoutExercise.exercise_id,
          sort_order: workoutExercise.sort_order,
          target_sets: reusableSets.length,
          target_reps: fields.showReps ? representativeSet.reps : null,
          target_weight_kg: fields.showWeight
            ? representativeSet.weight_kg
            : null,
          target_duration_seconds: fields.showDuration
            ? representativeSet.duration_seconds
            : null,
          target_distance_meters: fields.showDistance
            ? representativeSet.distance_meters
            : null,
          rest_timer_seconds: workoutExercise.rest_timer_seconds,
          notes: workoutExercise.notes,
        };
        if (!isValidRoutineExerciseInput(converted)) {
          throw new UnsupportedWorkoutDataError(
            `Workout exercise ${workoutExercise.id} contains unsupported source data`,
          );
        }
        return converted;
      });

    return this.store.createRoutine(userId, {
      name: routineValidation.data.name,
      notes: routineValidation.data.notes ?? null,
      exercises,
    });
  }
}
