import { describe, it, expect } from "vitest";
import {
  exerciseFormSchema,
  exerciseUpdateSchema,
} from "@/lib/validations/exercise";

const validExercise = (overrides: Record<string, unknown> = {}) => ({
  name: "Bench Press",
  muscle_group_primary: "chest",
  muscle_groups_secondary: ["triceps", "shoulders"],
  equipment: "barbell",
  exercise_type: "weight_reps",
  ...overrides,
});

describe("exerciseFormSchema", () => {
  it("accepts valid exercise", () => {
    const result = exerciseFormSchema.safeParse(validExercise());
    expect(result.success).toBe(true);
  });

  it("trims name: '  Bench Press  ' becomes 'Bench Press'", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ name: "  Bench Press  " }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Bench Press");
    }
  });

  it("rejects empty name (after trim)", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ name: "   " }));
    expect(result.success).toBe(false);
  });

  it("accepts name at 100 chars", () => {
    const name = "a".repeat(100);
    const result = exerciseFormSchema.safeParse(validExercise({ name }));
    expect(result.success).toBe(true);
  });

  it("rejects name longer than 100 chars", () => {
    const name = "a".repeat(101);
    const result = exerciseFormSchema.safeParse(validExercise({ name }));
    expect(result.success).toBe(false);
  });

  it.each([
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "core", "quadriceps", "hamstrings", "glutes", "calves",
    "traps", "lats", "full_body", "cardio", "other",
  ])("accepts muscle_group_primary value: %s", (value) => {
    const result = exerciseFormSchema.safeParse(validExercise({ muscle_group_primary: value }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid muscle_group_primary", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ muscle_group_primary: "invalid_muscle" }));
    expect(result.success).toBe(false);
  });

  it.each([
    "barbell", "dumbbell", "machine", "bodyweight", "kettlebell",
    "cable", "band", "other", "none",
  ])("accepts equipment value: %s", (value) => {
    const result = exerciseFormSchema.safeParse(validExercise({ equipment: value }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid equipment", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ equipment: "invalid_equipment" }));
    expect(result.success).toBe(false);
  });

  it.each([
    "weight_reps", "bodyweight_reps", "weighted_bodyweight",
    "assisted_bodyweight", "duration", "duration_weight",
    "distance_duration", "weight_distance",
  ])("accepts exercise_type value: %s", (value) => {
    const result = exerciseFormSchema.safeParse(validExercise({ exercise_type: value }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid exercise_type", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ exercise_type: "invalid_type" }));
    expect(result.success).toBe(false);
  });

  it("accepts empty muscle_groups_secondary array", () => {
    const result = exerciseFormSchema.safeParse(validExercise({ muscle_groups_secondary: [] }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid value in muscle_groups_secondary", () => {
    const result = exerciseFormSchema.safeParse(
      validExercise({ muscle_groups_secondary: ["triceps", "invalid_muscle"] })
    );
    expect(result.success).toBe(false);
  });
});

describe("exerciseUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = exerciseUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe("At least one field must be provided");
    }
  });

  it("accepts single field update (name only)", () => {
    const result = exerciseUpdateSchema.safeParse({ name: "Squat" });
    expect(result.success).toBe(true);
  });

  it("accepts partial updates", () => {
    const result = exerciseUpdateSchema.safeParse({
      name: "Deadlift",
      equipment: "barbell",
    });
    expect(result.success).toBe(true);
  });
});
