import { describe, expect, it } from "vitest";
import {
  RoutineToWorkoutConversion,
  UnsupportedRoutineDataError,
  type RoutineWorkoutSessionInput,
  type RoutineWorkoutStore,
} from "@/lib/fitness/routine-to-workout";
import type {
  RoutineWithExercises,
  WorkoutWithExercises,
} from "@/lib/db/types";

const ROUTINE_ID = "48500000-0000-4000-8000-000000000001";
const BENCH_PRESS_ID = "48500000-0000-4000-8000-000000000002";
const PLANK_ID = "48500000-0000-4000-8000-000000000003";

function routineWith(
  exercises: RoutineWithExercises["exercises"],
): RoutineWithExercises {
  return {
    id: ROUTINE_ID,
    user_id: "user-1",
    name: "Mixed session",
    notes: null,
    last_performed_at: null,
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
    exercises,
  };
}

function routineExercise(
  values: Partial<RoutineWithExercises["exercises"][number]> & {
    id: string;
    exercise_id: string;
    sort_order: number;
    exercise_type: RoutineWithExercises["exercises"][number]["exercise"]["exercise_type"];
  },
): RoutineWithExercises["exercises"][number] {
  const { exercise_type, ...overrides } = values;
  return {
    routine_id: ROUTINE_ID,
    target_sets: 1,
    target_reps: null,
    target_weight_kg: null,
    target_duration_seconds: null,
    rest_timer_seconds: 90,
    notes: null,
    created_at: "2026-07-29T00:00:00.000Z",
    exercise: {
      id: values.exercise_id,
      user_id: null,
      name: values.exercise_id,
      muscle_group_primary: "chest",
      muscle_groups_secondary: [],
      equipment: "none",
      exercise_type,
      is_custom: false,
      created_at: "2026-07-29T00:00:00.000Z",
      updated_at: "2026-07-29T00:00:00.000Z",
      exercise_media: null,
    },
    ...overrides,
  };
}

class InMemoryRoutineWorkoutStore implements RoutineWorkoutStore {
  private workout: WorkoutWithExercises | null = null;

  constructor(private failForExerciseId?: string) {}

  async createSession(
    userId: string,
    input: RoutineWorkoutSessionInput,
  ): Promise<WorkoutWithExercises> {
    if (
      input.exercises.some(
        ({ exercise }) => exercise.exercise_id === this.failForExerciseId,
      )
    ) {
      throw new Error(`Could not create sets for ${this.failForExerciseId}`);
    }

    const workout: WorkoutWithExercises = {
      id: "workout-1",
      user_id: userId,
      title: input.title,
      routine_id: input.routine_id,
      status: "in_progress",
      started_at: "2026-07-29T01:00:00.000Z",
      completed_at: null,
      duration_seconds: null,
      notes: null,
      created_at: "2026-07-29T01:00:00.000Z",
      updated_at: "2026-07-29T01:00:00.000Z",
      exercises: input.exercises.map((converted, exerciseIndex) => {
        const workoutExerciseId = `workout-exercise-${exerciseIndex + 1}`;
        return {
          ...converted.exercise,
          id: workoutExerciseId,
          workout_id: "workout-1",
          created_at: "2026-07-29T01:00:00.000Z",
          sets: converted.sets.map((set, setIndex) => ({
            ...set,
            id: `${workoutExerciseId}-set-${setIndex + 1}`,
            workout_exercise_id: workoutExerciseId,
            created_at: "2026-07-29T01:00:00.000Z",
            updated_at: "2026-07-29T01:00:00.000Z",
          })),
          exercise: {
            id: converted.exercise.exercise_id,
            user_id: null,
            name: converted.exercise.exercise_id,
            muscle_group_primary: "chest",
            muscle_groups_secondary: [],
            equipment: "none",
            exercise_type:
              converted.exercise.exercise_id === PLANK_ID
                ? "duration"
                : "weight_reps",
            is_custom: false,
            created_at: "2026-07-29T00:00:00.000Z",
            updated_at: "2026-07-29T00:00:00.000Z",
            exercise_media: null,
          },
        };
      }),
    };
    this.workout = workout;
    return workout;
  }

  async activeWorkout(): Promise<WorkoutWithExercises | null> {
    return this.workout;
  }
}

describe("RoutineToWorkoutConversion.start", () => {
  it("returns a complete session with exercises, sets, order, and applicable targets preserved", async () => {
    const routine = routineWith([
      routineExercise({
        id: "routine-exercise-2",
        exercise_id: PLANK_ID,
        exercise_type: "duration",
        sort_order: 20,
        target_sets: 2,
        target_reps: 99,
        target_weight_kg: 45,
        target_duration_seconds: 60,
      }),
      routineExercise({
        id: "routine-exercise-1",
        exercise_id: BENCH_PRESS_ID,
        exercise_type: "weight_reps",
        sort_order: 10,
        target_sets: 3,
        target_reps: 8,
        target_weight_kg: 80,
        target_duration_seconds: 120,
      }),
    ]);

    const result = await new RoutineToWorkoutConversion(
      new InMemoryRoutineWorkoutStore(),
    ).start("user-1", routine);

    expect(result).toMatchObject({
      id: "workout-1",
      title: "Mixed session",
      routine_id: ROUTINE_ID,
    });
    expect(
      result.exercises.map(({ sets, ...exercise }) => ({
        exercise_id: exercise.exercise_id,
        sort_order: exercise.sort_order,
        notes: exercise.notes,
        rest_timer_seconds: exercise.rest_timer_seconds,
        sets: sets.map(
          ({
            set_number,
            set_type,
            weight_kg,
            reps,
            duration_seconds,
            distance_meters,
            is_completed,
            rpe,
          }) => ({
            set_number,
            set_type,
            weight_kg,
            reps,
            duration_seconds,
            distance_meters,
            is_completed,
            rpe,
          }),
        ),
      })),
    ).toEqual([
        {
          exercise_id: BENCH_PRESS_ID,
          sort_order: 10,
          notes: null,
          rest_timer_seconds: 90,
          sets: [
            { set_number: 1, set_type: "normal", weight_kg: 80, reps: 8, duration_seconds: null, distance_meters: null, is_completed: false, rpe: null },
            { set_number: 2, set_type: "normal", weight_kg: 80, reps: 8, duration_seconds: null, distance_meters: null, is_completed: false, rpe: null },
            { set_number: 3, set_type: "normal", weight_kg: 80, reps: 8, duration_seconds: null, distance_meters: null, is_completed: false, rpe: null },
          ],
        },
        {
          exercise_id: PLANK_ID,
          sort_order: 20,
          notes: null,
          rest_timer_seconds: 90,
          sets: [
            { set_number: 1, set_type: "normal", weight_kg: null, reps: null, duration_seconds: 60, distance_meters: null, is_completed: false, rpe: null },
            { set_number: 2, set_type: "normal", weight_kg: null, reps: null, duration_seconds: 60, distance_meters: null, is_completed: false, rpe: null },
          ],
        },
      ]);
  });

  it("rejects unsupported exercise data before creating workout state", async () => {
    const store = new InMemoryRoutineWorkoutStore();
    const routine = routineWith([
      routineExercise({
        id: "routine-exercise-1",
        exercise_id: "48500000-0000-4000-8000-000000000004",
        exercise_type: "weight_reps",
        sort_order: 10,
      }),
    ]);
    routine.exercises[0].exercise.exercise_type = "unsupported" as never;

    await expect(
      new RoutineToWorkoutConversion(store).start("user-1", routine),
    ).rejects.toEqual(
      new UnsupportedRoutineDataError(
        "Unsupported exercise type: unsupported",
      ),
    );
    await expect(store.activeWorkout()).resolves.toBeNull();
  });

  it("rejects an invalid target set count before creating workout state", async () => {
    const store = new InMemoryRoutineWorkoutStore();
    const routine = routineWith([
      routineExercise({
        id: "routine-exercise-1",
        exercise_id: BENCH_PRESS_ID,
        exercise_type: "weight_reps",
        sort_order: 10,
        target_sets: 0,
      }),
    ]);

    await expect(
      new RoutineToWorkoutConversion(store).start("user-1", routine),
    ).rejects.toEqual(
      new UnsupportedRoutineDataError(
        "Routine exercise routine-exercise-1 has an invalid target set count",
      ),
    );
    await expect(store.activeWorkout()).resolves.toBeNull();
  });

  it.each([
    ["target_sets above 20", { target_sets: 21 }],
    ["negative target reps", { target_reps: -1 }],
    ["target reps above 9999", { target_reps: 10_000 }],
    ["negative target weight", { target_weight_kg: -0.01 }],
    ["target weight above 99999.99", { target_weight_kg: 100_000 }],
    ["negative target duration", { target_duration_seconds: -1 }],
    ["target duration above 86400", { target_duration_seconds: 86_401 }],
    ["negative rest timer", { rest_timer_seconds: -1 }],
    ["rest timer above 600", { rest_timer_seconds: 601 }],
    ["notes above 2000 characters", { notes: "x".repeat(2001) }],
    ["a malformed exercise id", { exercise_id: "not-a-uuid" }],
  ])("rejects %s before creating workout state", async (_label, override) => {
    const store = new InMemoryRoutineWorkoutStore();
    const routine = routineWith([
      routineExercise({
        id: "routine-exercise-1",
        exercise_id: BENCH_PRESS_ID,
        exercise_type: "weight_reps",
        sort_order: 10,
        ...override,
      }),
    ]);

    await expect(
      new RoutineToWorkoutConversion(store).start("user-1", routine),
    ).rejects.toBeInstanceOf(UnsupportedRoutineDataError);
    await expect(store.activeWorkout()).resolves.toBeNull();
  });

  it("accepts the persisted routine exercise upper boundaries", async () => {
    const result = await new RoutineToWorkoutConversion(
      new InMemoryRoutineWorkoutStore(),
    ).start(
      "user-1",
      routineWith([
        routineExercise({
          id: "routine-exercise-1",
          exercise_id: BENCH_PRESS_ID,
          exercise_type: "weight_reps",
          sort_order: 10,
          target_sets: 20,
          target_reps: 9_999,
          target_weight_kg: 99_999.99,
          target_duration_seconds: 86_400,
          rest_timer_seconds: 600,
          notes: "x".repeat(2_000),
        }),
      ]),
    );

    expect(result.exercises[0].sets).toHaveLength(20);
    expect(result.exercises[0].sets[19]).toMatchObject({
      set_number: 20,
      weight_kg: 99_999.99,
      reps: 9_999,
    });
    expect(result.exercises[0].rest_timer_seconds).toBe(600);
    expect(result.exercises[0].notes).toBe("x".repeat(2_000));
  });

  it("accepts zero-valued optional targets and rest timer", async () => {
    const result = await new RoutineToWorkoutConversion(
      new InMemoryRoutineWorkoutStore(),
    ).start(
      "user-1",
      routineWith([
        routineExercise({
          id: "routine-exercise-1",
          exercise_id: PLANK_ID,
          exercise_type: "duration",
          sort_order: 10,
          target_sets: 1,
          target_reps: 0,
          target_weight_kg: 0,
          target_duration_seconds: 0,
          rest_timer_seconds: 0,
        }),
      ]),
    );

    expect(result.exercises[0].sets).toHaveLength(1);
    expect(result.exercises[0].sets[0]).toMatchObject({
      set_number: 1,
      weight_kg: null,
      reps: null,
      duration_seconds: 0,
    });
    expect(result.exercises[0].rest_timer_seconds).toBe(0);
  });

  it.each([
    ["an empty name", { name: " " }],
    ["a name above 100 characters", { name: "x".repeat(101) }],
    ["notes above 2000 characters", { notes: "x".repeat(2001) }],
  ])("rejects a routine with %s before creating workout state", async (_label, override) => {
    const store = new InMemoryRoutineWorkoutStore();
    const routine = {
      ...routineWith([]),
      ...override,
    };

    await expect(
      new RoutineToWorkoutConversion(store).start("user-1", routine),
    ).rejects.toBeInstanceOf(UnsupportedRoutineDataError);
    await expect(store.activeWorkout()).resolves.toBeNull();
  });

  it("leaves no partial session when persistence fails during conversion", async () => {
    const store = new InMemoryRoutineWorkoutStore(PLANK_ID);
    const routine = routineWith([
      routineExercise({
        id: "routine-exercise-1",
        exercise_id: BENCH_PRESS_ID,
        exercise_type: "weight_reps",
        sort_order: 10,
        target_sets: 3,
      }),
      routineExercise({
        id: "routine-exercise-2",
        exercise_id: PLANK_ID,
        exercise_type: "duration",
        sort_order: 20,
        target_sets: 2,
      }),
    ]);

    await expect(
      new RoutineToWorkoutConversion(store).start("user-1", routine),
    ).rejects.toThrow(`Could not create sets for ${PLANK_ID}`);
    await expect(store.activeWorkout()).resolves.toBeNull();
  });
});
