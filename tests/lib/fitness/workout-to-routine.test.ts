import { describe, expect, it } from "vitest";
import {
  RoutineToWorkoutConversion,
  UnsupportedWorkoutDataError,
  WorkoutToRoutineConversion,
  type RoutineWorkoutSessionInput,
  type RoutineWorkoutStore,
  type WorkoutRoutineInput,
  type WorkoutRoutineStore,
} from "@/lib/fitness/routine-workout-conversion";
import type {
  ExerciseType,
  RoutineWithExercises,
  WorkoutWithExercises,
} from "@/lib/db/types";

const WORKOUT_ID = "49500000-0000-4000-8000-000000000001";
const BENCH_PRESS_ID = "49500000-0000-4000-8000-000000000002";
const PLANK_ID = "49500000-0000-4000-8000-000000000003";
const ROW_ID = "49500000-0000-4000-8000-000000000004";

function workoutWith(
  exercises: WorkoutWithExercises["exercises"],
): WorkoutWithExercises {
  return {
    id: WORKOUT_ID,
    user_id: "user-1",
    title: "Completed workout",
    started_at: "2026-07-30T00:00:00.000Z",
    completed_at: "2026-07-30T01:00:00.000Z",
    duration_seconds: 3600,
    status: "completed",
    notes: null,
    routine_id: null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T01:00:00.000Z",
    exercises,
  };
}

function workoutExercise(
  exerciseId: string,
  exerciseType: WorkoutWithExercises["exercises"][number]["exercise"]["exercise_type"],
  sortOrder: number,
  sets: WorkoutWithExercises["exercises"][number]["sets"],
): WorkoutWithExercises["exercises"][number] {
  return {
    id: `${exerciseId}-workout-exercise`,
    workout_id: WORKOUT_ID,
    exercise_id: exerciseId,
    sort_order: sortOrder,
    notes: null,
    rest_timer_seconds: 90,
    created_at: "2026-07-30T00:00:00.000Z",
    exercise: {
      id: exerciseId,
      user_id: null,
      name: exerciseId,
      muscle_group_primary: "chest",
      muscle_groups_secondary: [],
      equipment: "none",
      exercise_type: exerciseType,
      is_custom: false,
      created_at: "2026-07-30T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
      exercise_media: null,
    },
    sets,
  };
}

function workoutSet(
  exerciseId: string,
  setNumber: number,
  values: Partial<WorkoutWithExercises["exercises"][number]["sets"][number]>,
): WorkoutWithExercises["exercises"][number]["sets"][number] {
  return {
    id: `${exerciseId}-set-${setNumber}`,
    workout_exercise_id: `${exerciseId}-workout-exercise`,
    set_number: setNumber,
    set_type: "normal",
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_meters: null,
    is_completed: true,
    rpe: null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
    ...values,
  };
}

class InMemoryWorkoutRoutineStore implements WorkoutRoutineStore {
  input: WorkoutRoutineInput | null = null;

  async createRoutine(
    userId: string,
    input: WorkoutRoutineInput,
  ): Promise<RoutineWithExercises> {
    this.input = input;
    return {
      id: "routine-1",
      user_id: userId,
      name: input.name,
      notes: input.notes,
      last_performed_at: null,
      created_at: "2026-07-30T02:00:00.000Z",
      updated_at: "2026-07-30T02:00:00.000Z",
      exercises: [],
    };
  }
}

class InMemoryRoutineWorkoutStore implements RoutineWorkoutStore {
  constructor(private exerciseTypes: Record<string, ExerciseType>) {}

  async createSession(
    userId: string,
    input: RoutineWorkoutSessionInput,
  ): Promise<WorkoutWithExercises> {
    return {
      id: WORKOUT_ID,
      user_id: userId,
      title: input.title,
      started_at: "2026-07-30T00:00:00.000Z",
      completed_at: null,
      duration_seconds: null,
      status: "in_progress",
      notes: null,
      routine_id: input.routine_id,
      created_at: "2026-07-30T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
      exercises: input.exercises.map((converted, exerciseIndex) => {
        const workoutExerciseId = `workout-exercise-${exerciseIndex + 1}`;
        return {
          ...converted.exercise,
          id: workoutExerciseId,
          workout_id: WORKOUT_ID,
          created_at: "2026-07-30T00:00:00.000Z",
          exercise: {
            id: converted.exercise.exercise_id,
            user_id: null,
            name: converted.exercise.exercise_id,
            muscle_group_primary: "chest",
            muscle_groups_secondary: [],
            equipment: "none",
            exercise_type:
              this.exerciseTypes[converted.exercise.exercise_id],
            is_custom: false,
            created_at: "2026-07-30T00:00:00.000Z",
            updated_at: "2026-07-30T00:00:00.000Z",
            exercise_media: null,
          },
          sets: converted.sets.map((set, setIndex) => ({
            ...set,
            id: `${workoutExerciseId}-set-${setIndex + 1}`,
            workout_exercise_id: workoutExerciseId,
            created_at: "2026-07-30T00:00:00.000Z",
            updated_at: "2026-07-30T00:00:00.000Z",
          })),
        };
      }),
    };
  }
}

describe("WorkoutToRoutineConversion.save", () => {
  it("sorts exercises and infers one reusable target from completed normal sets", async () => {
    const store = new InMemoryWorkoutRoutineStore();
    const workout = workoutWith([
      workoutExercise(PLANK_ID, "duration", 20, [
        workoutSet(PLANK_ID, 1, { duration_seconds: 45 }),
        workoutSet(PLANK_ID, 2, { duration_seconds: 60 }),
      ]),
      workoutExercise(BENCH_PRESS_ID, "weight_reps", 10, [
        workoutSet(BENCH_PRESS_ID, 1, {
          set_type: "warmup",
          weight_kg: 40,
          reps: 12,
        }),
        workoutSet(BENCH_PRESS_ID, 2, { weight_kg: 80, reps: 8 }),
        workoutSet(BENCH_PRESS_ID, 3, { weight_kg: 85, reps: 5 }),
      ]),
    ]);

    await new WorkoutToRoutineConversion(store).save(
      "user-1",
      "Reusable session",
      workout,
    );

    expect(store.input).toEqual({
      name: "Reusable session",
      notes: null,
      exercises: [
        {
          exercise_id: BENCH_PRESS_ID,
          sort_order: 10,
          target_sets: 2,
          target_reps: 5,
          target_weight_kg: 85,
          target_duration_seconds: null,
          target_distance_meters: null,
          rest_timer_seconds: 90,
          notes: null,
        },
        {
          exercise_id: PLANK_ID,
          sort_order: 20,
          target_sets: 2,
          target_reps: null,
          target_weight_kg: null,
          target_duration_seconds: 60,
          target_distance_meters: null,
          rest_timer_seconds: 90,
          notes: null,
        },
      ],
    });
  });

  it("rejects an unknown set type before creating any routine state", async () => {
    const store = new InMemoryWorkoutRoutineStore();
    const workout = workoutWith([
      workoutExercise(BENCH_PRESS_ID, "weight_reps", 10, [
        workoutSet(BENCH_PRESS_ID, 1, { weight_kg: 80, reps: 8 }),
        workoutSet(BENCH_PRESS_ID, 2, {
          set_type: "unsupported" as never,
          weight_kg: 85,
          reps: 5,
        }),
      ]),
    ]);

    await expect(
      new WorkoutToRoutineConversion(store).save(
        "user-1",
        "Reusable session",
        workout,
      ),
    ).rejects.toEqual(
      new UnsupportedWorkoutDataError(
        `Workout exercise ${BENCH_PRESS_ID}-workout-exercise has an unsupported set type`,
      ),
    );
    expect(store.input).toBeNull();
  });

  it("returns the defined failure for a malformed exercise collection", async () => {
    const store = new InMemoryWorkoutRoutineStore();
    const workout = workoutWith([
      null as never,
      workoutExercise(BENCH_PRESS_ID, "weight_reps", 10, [
        workoutSet(BENCH_PRESS_ID, 1, { weight_kg: 80, reps: 8 }),
      ]),
    ]);

    await expect(
      new WorkoutToRoutineConversion(store).save(
        "user-1",
        "Reusable session",
        workout,
      ),
    ).rejects.toEqual(
      new UnsupportedWorkoutDataError(
        "Workout exercise contains unsupported source data",
      ),
    );
    expect(store.input).toBeNull();
  });

  it("rejects invalid values in an unselected set before persistence", async () => {
    const store = new InMemoryWorkoutRoutineStore();
    const workout = workoutWith([
      workoutExercise(BENCH_PRESS_ID, "weight_reps", 10, [
        workoutSet(BENCH_PRESS_ID, 1, { weight_kg: -1, reps: 8 }),
        workoutSet(BENCH_PRESS_ID, 2, { weight_kg: 80, reps: 8 }),
      ]),
    ]);

    await expect(
      new WorkoutToRoutineConversion(store).save(
        "user-1",
        "Reusable session",
        workout,
      ),
    ).rejects.toBeInstanceOf(UnsupportedWorkoutDataError);
    expect(store.input).toBeNull();
  });
});

describe("routine/workout inverse rules", () => {
  it("round-trips representative reusable targets through a started workout", async () => {
    const routine: RoutineWithExercises = {
      id: "49500000-0000-4000-8000-000000000010",
      user_id: "user-1",
      name: "Round trip",
      notes: null,
      last_performed_at: null,
      created_at: "2026-07-30T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
      exercises: [
        {
          id: "routine-exercise-1",
          routine_id: "49500000-0000-4000-8000-000000000010",
          exercise_id: BENCH_PRESS_ID,
          sort_order: 10,
          target_sets: 3,
          target_reps: 8,
          target_weight_kg: 80,
          target_duration_seconds: null,
          target_distance_meters: null,
          rest_timer_seconds: 120,
          notes: "Pause",
          created_at: "2026-07-30T00:00:00.000Z",
          exercise: workoutExercise(
            BENCH_PRESS_ID,
            "weight_reps",
            10,
            [],
          ).exercise,
        },
        {
          id: "routine-exercise-2",
          routine_id: "49500000-0000-4000-8000-000000000010",
          exercise_id: PLANK_ID,
          sort_order: 20,
          target_sets: 2,
          target_reps: null,
          target_weight_kg: null,
          target_duration_seconds: 60,
          target_distance_meters: null,
          rest_timer_seconds: 45,
          notes: null,
          created_at: "2026-07-30T00:00:00.000Z",
          exercise: workoutExercise(PLANK_ID, "duration", 20, []).exercise,
        },
        {
          id: "routine-exercise-3",
          routine_id: "49500000-0000-4000-8000-000000000010",
          exercise_id: ROW_ID,
          sort_order: 30,
          target_sets: 1,
          target_reps: null,
          target_weight_kg: null,
          target_duration_seconds: 120,
          target_distance_meters: 500,
          rest_timer_seconds: 30,
          notes: null,
          created_at: "2026-07-30T00:00:00.000Z",
          exercise: workoutExercise(
            ROW_ID,
            "distance_duration",
            30,
            [],
          ).exercise,
        },
      ],
    };
    const startedWorkout = await new RoutineToWorkoutConversion(
      new InMemoryRoutineWorkoutStore({
        [BENCH_PRESS_ID]: "weight_reps",
        [PLANK_ID]: "duration",
        [ROW_ID]: "distance_duration",
      }),
    ).start("user-1", routine);
    const routineStore = new InMemoryWorkoutRoutineStore();

    await new WorkoutToRoutineConversion(routineStore).save(
      "user-1",
      routine.name,
      startedWorkout,
    );

    expect(routineStore.input?.exercises).toEqual(
      routine.exercises.map(
        ({
          exercise_id,
          sort_order,
          target_sets,
          target_reps,
          target_weight_kg,
          target_duration_seconds,
          target_distance_meters,
          rest_timer_seconds,
          notes,
        }) => ({
          exercise_id,
          sort_order,
          target_sets,
          target_reps,
          target_weight_kg,
          target_duration_seconds,
          target_distance_meters,
          rest_timer_seconds,
          notes,
        }),
      ),
    );
  });

  it.each([
    ["weight_reps", 50, 10, null, null],
    ["bodyweight_reps", null, 10, null, null],
    ["weighted_bodyweight", 50, 10, null, null],
    ["assisted_bodyweight", 50, 10, null, null],
    ["duration", null, null, 30, null],
    ["duration_weight", 50, null, 30, null],
    ["distance_duration", null, null, 30, 100],
    ["weight_distance", 50, null, null, 100],
  ] satisfies [
    ExerciseType,
    number | null,
    number | null,
    number | null,
    number | null,
  ][])(
    "uses the same applicable target matrix for %s in both directions",
    async (
      exerciseType,
      targetWeight,
      targetReps,
      targetDuration,
      targetDistance,
    ) => {
      const exerciseId = `49500000-0000-4000-8000-${String(
        100 + Object.keys({
          weight_reps: 0,
          bodyweight_reps: 1,
          weighted_bodyweight: 2,
          assisted_bodyweight: 3,
          duration: 4,
          duration_weight: 5,
          distance_duration: 6,
          weight_distance: 7,
        }).indexOf(exerciseType),
      ).padStart(12, "0")}`;
      const store = new InMemoryWorkoutRoutineStore();
      const source = workoutWith([
        workoutExercise(exerciseId, exerciseType, 10, [
          workoutSet(exerciseId, 1, {
            weight_kg: 50,
            reps: 10,
            duration_seconds: 30,
            distance_meters: 100,
          }),
        ]),
      ]);

      await new WorkoutToRoutineConversion(store).save(
        "user-1",
        "Matrix routine",
        source,
      );

      expect(store.input?.exercises[0]).toMatchObject({
        target_weight_kg: targetWeight,
        target_reps: targetReps,
        target_duration_seconds: targetDuration,
        target_distance_meters: targetDistance,
      });
    },
  );

  it.each(["warmup", "drop", "failure"] as const)(
    "excludes %s sets from reusable normal-set targets",
    async (setType) => {
      const store = new InMemoryWorkoutRoutineStore();
      const source = workoutWith([
        workoutExercise(BENCH_PRESS_ID, "weight_reps", 10, [
          workoutSet(BENCH_PRESS_ID, 1, { weight_kg: 80, reps: 8 }),
          workoutSet(BENCH_PRESS_ID, 2, {
            set_type: setType,
            weight_kg: 100,
            reps: 1,
          }),
        ]),
      ]);

      await new WorkoutToRoutineConversion(store).save(
        "user-1",
        "Set type policy",
        source,
      );

      expect(store.input?.exercises[0]).toMatchObject({
        target_sets: 1,
        target_weight_kg: 80,
        target_reps: 8,
      });
    },
  );
});
