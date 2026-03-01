import { describe, it, expect } from "vitest";
import {
  routineCreateSchema,
  routineUpdateSchema,
  routineExerciseAddSchema,
  routineExerciseUpdateSchema,
  saveAsRoutineSchema,
} from "@/lib/validations/routine";

describe("routineCreateSchema", () => {
  it("accepts valid routine", () => {
    const result = routineCreateSchema.safeParse({ name: "Push Day" });
    expect(result.success).toBe(true);
  });

  it("trims name whitespace", () => {
    const result = routineCreateSchema.safeParse({ name: "  Push Day  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Push Day");
    }
  });

  it("rejects empty name", () => {
    const result = routineCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = routineCreateSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts name at 100 chars", () => {
    const result = routineCreateSchema.safeParse({ name: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects name over 100 chars", () => {
    const result = routineCreateSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts notes", () => {
    const result = routineCreateSchema.safeParse({
      name: "Push Day",
      notes: "Focus on chest",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null notes", () => {
    const result = routineCreateSchema.safeParse({
      name: "Push Day",
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes over 2000 chars", () => {
    const result = routineCreateSchema.safeParse({
      name: "Push Day",
      notes: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe("routineUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = routineUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one field must be provided",
      );
    }
  });

  it("accepts name update", () => {
    const result = routineUpdateSchema.safeParse({ name: "Pull Day" });
    expect(result.success).toBe(true);
  });

  it("accepts notes update", () => {
    const result = routineUpdateSchema.safeParse({ notes: "Updated notes" });
    expect(result.success).toBe(true);
  });

  it("accepts null notes", () => {
    const result = routineUpdateSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
  });
});

describe("routineExerciseAddSchema", () => {
  it("accepts valid exercise_id", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid exercise_id", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("applies default target_sets of 3", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target_sets).toBe(3);
    }
  });

  it("applies default rest_timer_seconds of 90", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rest_timer_seconds).toBe(90);
    }
  });

  it("accepts target_sets up to 20", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
      target_sets: 20,
    });
    expect(result.success).toBe(true);
  });

  it("rejects target_sets over 20", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
      target_sets: 21,
    });
    expect(result.success).toBe(false);
  });

  it("rejects target_sets under 1", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
      target_sets: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts nullable optional fields", () => {
    const result = routineExerciseAddSchema.safeParse({
      exercise_id: "550e8400-e29b-41d4-a716-446655440000",
      target_reps: null,
      target_weight_kg: null,
      target_duration_seconds: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("routineExerciseUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = routineExerciseUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one field must be provided",
      );
    }
  });

  it("accepts single field update", () => {
    const result = routineExerciseUpdateSchema.safeParse({ target_sets: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts sort_order update", () => {
    const result = routineExerciseUpdateSchema.safeParse({
      sort_order: 65536,
    });
    expect(result.success).toBe(true);
  });

  it("accepts rest_timer_seconds", () => {
    const result = routineExerciseUpdateSchema.safeParse({
      rest_timer_seconds: 120,
    });
    expect(result.success).toBe(true);
  });

  it("rejects rest_timer_seconds over 600", () => {
    const result = routineExerciseUpdateSchema.safeParse({
      rest_timer_seconds: 601,
    });
    expect(result.success).toBe(false);
  });
});

describe("saveAsRoutineSchema", () => {
  it("accepts valid name", () => {
    const result = saveAsRoutineSchema.safeParse({ name: "My Routine" });
    expect(result.success).toBe(true);
  });

  it("trims name whitespace", () => {
    const result = saveAsRoutineSchema.safeParse({ name: "  My Routine  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Routine");
    }
  });

  it("rejects empty name", () => {
    const result = saveAsRoutineSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = saveAsRoutineSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});
