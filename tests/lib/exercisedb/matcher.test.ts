import { describe, it, expect } from "vitest";
import { matchExercises } from "@/lib/exercisedb/matcher";
import { mapToMuscleGroup, mapEquipment } from "@/lib/exercisedb/muscle-map";
import type { ExerciseDBEntry } from "@/lib/exercisedb/types";
import type { Exercise } from "@/lib/db/types";

// --- Fixtures ---

const mockDbExercises: ExerciseDBEntry[] = [
  {
    id: "0025",
    name: "barbell bench press",
    bodyPart: "chest",
    target: "pectorals",
    secondaryMuscles: ["triceps", "anterior deltoids"],
    equipment: "barbell",
    gifUrl: "https://v2.exercisedb.io/image/0025.gif",
    instructions: ["Lie on bench", "Press barbell up"],
  },
  {
    id: "0285",
    name: "dumbbell bicep curl",
    bodyPart: "upper arms",
    target: "biceps brachii",
    secondaryMuscles: ["forearms"],
    equipment: "dumbbell",
    gifUrl: "https://v2.exercisedb.io/image/0285.gif",
    instructions: ["Stand with dumbbells", "Curl up"],
  },
  {
    id: "0584",
    name: "barbell squat",
    bodyPart: "upper legs",
    target: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings"],
    equipment: "barbell",
    gifUrl: "https://v2.exercisedb.io/image/0584.gif",
    instructions: ["Stand under bar", "Squat down"],
  },
  {
    id: "0999",
    name: "triceps pushdown",
    bodyPart: "upper arms",
    target: "triceps brachii",
    secondaryMuscles: [],
    equipment: "cable",
    gifUrl: "https://v2.exercisedb.io/image/0999.gif",
    instructions: ["Stand at cable machine", "Push down"],
  },
];

function makeMockExercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "test-id",
    user_id: null,
    name: "Test Exercise",
    muscle_group_primary: "chest",
    muscle_groups_secondary: [],
    equipment: "barbell",
    exercise_type: "weight_reps",
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("matchExercises", () => {
  it("returns correct match for 'Barbell Bench Press' with high confidence", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-1",
        name: "Barbell Bench Press",
        muscle_group_primary: "chest",
        equipment: "barbell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises);
    expect(results).toHaveLength(1);
    expect(results[0].match).not.toBeNull();
    expect(results[0].match!.id).toBe("0025");
    expect(results[0].confidence).toBeGreaterThan(0.5);
  });

  it("returns null match when confidence below threshold and fewer than 2 signals agree", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-2",
        name: "Zottman Reverse Fly",
        muscle_group_primary: "shoulders",
        equipment: "kettlebell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises, 0.9);
    expect(results).toHaveLength(1);
    // With a very high threshold, name won't meet it, and equipment/muscle won't match
    expect(results[0].match).toBeNull();
  });

  it("correctly matches despite word reordering ('Dumbbell Curl' vs 'dumbbell bicep curl')", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-3",
        name: "Dumbbell Curl",
        muscle_group_primary: "biceps",
        equipment: "dumbbell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises);
    expect(results).toHaveLength(1);
    expect(results[0].match).not.toBeNull();
    expect(results[0].match!.id).toBe("0285");
  });

  it("sets equipmentMatch=true when equipment matches", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-4",
        name: "Barbell Bench Press",
        muscle_group_primary: "chest",
        equipment: "barbell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises);
    expect(results[0].equipmentMatch).toBe(true);
  });

  it("sets muscleMatch=true when muscle group matches", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-5",
        name: "Barbell Bench Press",
        muscle_group_primary: "chest",
        equipment: "barbell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises);
    expect(results[0].muscleMatch).toBe(true);
  });

  it("requires 2-of-3 signal agreement (name >= threshold, equipment, muscle)", () => {
    // Exercise with matching name but wrong equipment AND wrong muscle
    const exercises = [
      makeMockExercise({
        id: "ex-6",
        name: "Barbell Bench Press",
        muscle_group_primary: "back", // wrong
        equipment: "cable", // wrong
      }),
    ];

    // Name confidence will be high (1 signal), but equipment (0) and muscle (0) won't match
    // Total signals = 1, which is < 2, so match should be null
    const results = matchExercises(exercises, mockDbExercises);
    expect(results[0].match).toBeNull();
  });

  it("all results have verified=false", () => {
    const exercises = [
      makeMockExercise({
        id: "ex-7",
        name: "Barbell Bench Press",
        muscle_group_primary: "chest",
        equipment: "barbell",
      }),
    ];

    const results = matchExercises(exercises, mockDbExercises);
    expect(results[0].verified).toBe(false);
  });
});

describe("mapToMuscleGroup", () => {
  it("disambiguates 'upper arms' using target 'biceps brachii' -> 'biceps'", () => {
    expect(mapToMuscleGroup("upper arms", "biceps brachii")).toBe("biceps");
  });

  it("disambiguates 'upper arms' using target 'triceps brachii' -> 'triceps'", () => {
    expect(mapToMuscleGroup("upper arms", "triceps brachii")).toBe("triceps");
  });

  it("maps 'waist' -> 'core'", () => {
    expect(mapToMuscleGroup("waist", "abs")).toBe("core");
  });

  it("maps 'upper legs' with target 'glutes' -> 'glutes'", () => {
    expect(mapToMuscleGroup("upper legs", "glutes")).toBe("glutes");
  });
});

describe("mapEquipment", () => {
  it("maps ExerciseDB 'body weight' to BetterR.Me 'bodyweight'", () => {
    expect(mapEquipment("body weight")).toBe("bodyweight");
  });
});
