import { describe, it, expect } from "vitest";
import {
  workoutCreateSchema,
  workoutUpdateSchema,
  addExerciseToWorkoutSchema,
  workoutExerciseUpdateSchema,
  workoutSetCreateSchema,
  workoutSetUpdateSchema,
} from "@/lib/validations/workout";

// ─── workoutCreateSchema ────────────────────────────────────────────────────

describe("workoutCreateSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = workoutCreateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts object with title", () => {
    const result = workoutCreateSchema.safeParse({ title: "Morning Lift" });
    expect(result.success).toBe(true);
  });

  it("accepts title at max length of 100 chars", () => {
    const result = workoutCreateSchema.safeParse({ title: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects title longer than 100 chars", () => {
    const result = workoutCreateSchema.safeParse({ title: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts routine_id as a valid UUID", () => {
    const result = workoutCreateSchema.safeParse({
      routine_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts routine_id as null", () => {
    const result = workoutCreateSchema.safeParse({ routine_id: null });
    expect(result.success).toBe(true);
  });

  it("accepts object without routine_id", () => {
    const result = workoutCreateSchema.safeParse({ title: "Push Day" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid routine_id (not a UUID)", () => {
    const result = workoutCreateSchema.safeParse({ routine_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ─── workoutUpdateSchema ────────────────────────────────────────────────────

describe("workoutUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = workoutUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts update with only title", () => {
    const result = workoutUpdateSchema.safeParse({ title: "Updated Title" });
    expect(result.success).toBe(true);
  });

  it("accepts update with only notes", () => {
    const result = workoutUpdateSchema.safeParse({ notes: "Some notes" });
    expect(result.success).toBe(true);
  });

  it("accepts update with only status", () => {
    const result = workoutUpdateSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("accepts status value 'in_progress'", () => {
    const result = workoutUpdateSchema.safeParse({ status: "in_progress" });
    expect(result.success).toBe(true);
  });

  it("accepts status value 'completed'", () => {
    const result = workoutUpdateSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("accepts status value 'discarded'", () => {
    const result = workoutUpdateSchema.safeParse({ status: "discarded" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = workoutUpdateSchema.safeParse({ status: "paused" });
    expect(result.success).toBe(false);
  });
});

// ─── workoutSetCreateSchema ─────────────────────────────────────────────────

describe("workoutSetCreateSchema", () => {
  it("accepts empty object and uses defaults", () => {
    const result = workoutSetCreateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("defaults set_type to 'normal'", () => {
    const result = workoutSetCreateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.set_type).toBe("normal");
    }
  });

  it("defaults is_completed to false", () => {
    const result = workoutSetCreateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_completed).toBe(false);
    }
  });

  it("accepts set_type 'warmup'", () => {
    const result = workoutSetCreateSchema.safeParse({ set_type: "warmup" });
    expect(result.success).toBe(true);
  });

  it("accepts set_type 'normal'", () => {
    const result = workoutSetCreateSchema.safeParse({ set_type: "normal" });
    expect(result.success).toBe(true);
  });

  it("accepts set_type 'drop'", () => {
    const result = workoutSetCreateSchema.safeParse({ set_type: "drop" });
    expect(result.success).toBe(true);
  });

  it("accepts set_type 'failure'", () => {
    const result = workoutSetCreateSchema.safeParse({ set_type: "failure" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid set_type", () => {
    const result = workoutSetCreateSchema.safeParse({ set_type: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts weight_kg at minimum (0)", () => {
    const result = workoutSetCreateSchema.safeParse({ weight_kg: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts weight_kg at maximum (99999.99)", () => {
    const result = workoutSetCreateSchema.safeParse({ weight_kg: 99999.99 });
    expect(result.success).toBe(true);
  });

  it("rejects weight_kg below minimum (negative)", () => {
    const result = workoutSetCreateSchema.safeParse({ weight_kg: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects weight_kg above maximum", () => {
    const result = workoutSetCreateSchema.safeParse({ weight_kg: 100000 });
    expect(result.success).toBe(false);
  });

  it("accepts reps at minimum (0)", () => {
    const result = workoutSetCreateSchema.safeParse({ reps: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts reps at maximum (9999)", () => {
    const result = workoutSetCreateSchema.safeParse({ reps: 9999 });
    expect(result.success).toBe(true);
  });

  it("rejects reps below minimum (negative)", () => {
    const result = workoutSetCreateSchema.safeParse({ reps: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects reps above maximum", () => {
    const result = workoutSetCreateSchema.safeParse({ reps: 10000 });
    expect(result.success).toBe(false);
  });

  it("accepts duration_seconds at minimum (0)", () => {
    const result = workoutSetCreateSchema.safeParse({ duration_seconds: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts duration_seconds at maximum (86400)", () => {
    const result = workoutSetCreateSchema.safeParse({
      duration_seconds: 86400,
    });
    expect(result.success).toBe(true);
  });

  it("rejects duration_seconds below minimum (negative)", () => {
    const result = workoutSetCreateSchema.safeParse({ duration_seconds: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects duration_seconds above maximum", () => {
    const result = workoutSetCreateSchema.safeParse({
      duration_seconds: 86401,
    });
    expect(result.success).toBe(false);
  });

  it("accepts distance_meters at minimum (0)", () => {
    const result = workoutSetCreateSchema.safeParse({ distance_meters: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts distance_meters at maximum (999999.99)", () => {
    const result = workoutSetCreateSchema.safeParse({
      distance_meters: 999999.99,
    });
    expect(result.success).toBe(true);
  });

  it("rejects distance_meters below minimum (negative)", () => {
    const result = workoutSetCreateSchema.safeParse({ distance_meters: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects distance_meters above maximum", () => {
    const result = workoutSetCreateSchema.safeParse({
      distance_meters: 1000000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts rpe at minimum (1)", () => {
    const result = workoutSetCreateSchema.safeParse({ rpe: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts rpe at maximum (10)", () => {
    const result = workoutSetCreateSchema.safeParse({ rpe: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects rpe below minimum (0)", () => {
    const result = workoutSetCreateSchema.safeParse({ rpe: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects rpe above maximum (11)", () => {
    const result = workoutSetCreateSchema.safeParse({ rpe: 11 });
    expect(result.success).toBe(false);
  });

  it("accepts rpe as null", () => {
    const result = workoutSetCreateSchema.safeParse({ rpe: null });
    expect(result.success).toBe(true);
  });

  it("accepts nullable optional fields as null", () => {
    const result = workoutSetCreateSchema.safeParse({
      weight_kg: null,
      reps: null,
      duration_seconds: null,
      distance_meters: null,
      rpe: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── workoutSetUpdateSchema ─────────────────────────────────────────────────

describe("workoutSetUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = workoutSetUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts update with only set_type", () => {
    const result = workoutSetUpdateSchema.safeParse({ set_type: "warmup" });
    expect(result.success).toBe(true);
  });

  it("accepts update with only weight_kg", () => {
    const result = workoutSetUpdateSchema.safeParse({ weight_kg: 100 });
    expect(result.success).toBe(true);
  });

  it("accepts update with only reps", () => {
    const result = workoutSetUpdateSchema.safeParse({ reps: 10 });
    expect(result.success).toBe(true);
  });

  it("accepts update with only is_completed", () => {
    const result = workoutSetUpdateSchema.safeParse({ is_completed: true });
    expect(result.success).toBe(true);
  });

  it("accepts rpe at minimum (1)", () => {
    const result = workoutSetUpdateSchema.safeParse({ rpe: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts rpe at maximum (10)", () => {
    const result = workoutSetUpdateSchema.safeParse({ rpe: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects rpe below minimum (0)", () => {
    const result = workoutSetUpdateSchema.safeParse({ rpe: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects rpe above maximum (11)", () => {
    const result = workoutSetUpdateSchema.safeParse({ rpe: 11 });
    expect(result.success).toBe(false);
  });
});

// ─── addExerciseToWorkoutSchema ─────────────────────────────────────────────

describe("addExerciseToWorkoutSchema", () => {
  it("accepts valid exercise_id UUID without rest_timer_seconds", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing exercise_id", () => {
    const result = addExerciseToWorkoutSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid exercise_id (not a UUID)", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rest_timer_seconds at minimum (0)", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
      rest_timer_seconds: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts rest_timer_seconds at maximum (600)", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
      rest_timer_seconds: 600,
    });
    expect(result.success).toBe(true);
  });

  it("rejects rest_timer_seconds below minimum (negative)", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
      rest_timer_seconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects rest_timer_seconds above maximum", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
      rest_timer_seconds: 601,
    });
    expect(result.success).toBe(false);
  });

  it("accepts omitted rest_timer_seconds (optional)", () => {
    const result = addExerciseToWorkoutSchema.safeParse({
      exercise_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rest_timer_seconds).toBeUndefined();
    }
  });
});

// ─── workoutExerciseUpdateSchema ────────────────────────────────────────────

describe("workoutExerciseUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = workoutExerciseUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts update with only notes", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      notes: "Keep back straight",
    });
    expect(result.success).toBe(true);
  });

  it("accepts update with notes as null", () => {
    const result = workoutExerciseUpdateSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
  });

  it("accepts update with only rest_timer_seconds", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      rest_timer_seconds: 90,
    });
    expect(result.success).toBe(true);
  });

  it("accepts update with both notes and rest_timer_seconds", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      notes: "Focus on form",
      rest_timer_seconds: 120,
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes longer than 2000 chars", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      notes: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes at max length (2000 chars)", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      notes: "a".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects rest_timer_seconds above maximum (600)", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      rest_timer_seconds: 601,
    });
    expect(result.success).toBe(false);
  });

  it("rejects rest_timer_seconds below minimum (negative)", () => {
    const result = workoutExerciseUpdateSchema.safeParse({
      rest_timer_seconds: -1,
    });
    expect(result.success).toBe(false);
  });
});
