import type {
  RoutineWithExercises,
  WorkoutExercise,
  WorkoutSet,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import {
  routineCreateSchema,
  routineExerciseAddSchema,
  routineExerciseUpdateSchema,
} from "@/lib/validations/routine";

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
        const sourceValidation = routineExerciseAddSchema.safeParse({
          exercise_id: routineExercise.exercise_id,
          target_sets: routineExercise.target_sets,
          target_reps: routineExercise.target_reps,
          target_weight_kg: routineExercise.target_weight_kg,
          target_duration_seconds: routineExercise.target_duration_seconds,
          rest_timer_seconds: routineExercise.rest_timer_seconds,
          notes: routineExercise.notes,
        });
        const orderValidation = routineExerciseUpdateSchema.safeParse({
          sort_order: routineExercise.sort_order,
        });
        if (!sourceValidation.success || !orderValidation.success) {
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
            distance_meters: null,
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
