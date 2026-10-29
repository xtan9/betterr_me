import { describe, it, expect } from "vitest";
import { loadCatalog } from "@/lib/exercisedb/catalog";
import baseline from "../../fixtures/exercise-preset-baseline.json";

describe("loadCatalog", () => {
  it("publishes 410 distinct presets while preserving the 96 live exercise identities", () => {
    const catalog = loadCatalog();
    expect(catalog).toHaveLength(410);
    expect(new Set(catalog.map(row => row.preset_id)).size).toBe(410);
    for (const previous of baseline) {
      expect(catalog.find(row => row.preset_id === previous.id)).toMatchObject({
        name: previous.name, equipment: previous.equipment, exercise_type: previous.exercise_type,
        muscle_group_primary: previous.muscle_group_primary, muscle_groups_secondary: previous.muscle_groups_secondary,
      });
    }
  });

  it("includes the distinct Hevy movements without conflating equipment or added load", () => {
    const catalog = loadCatalog();
    const expected = [
      ["Weighted Back Extension", "bodyweight", "weighted_bodyweight"],
      ["Chest Supported Dumbbell Y Raise", "dumbbell", "weight_reps"],
      ["Weighted Decline Crunch", "bodyweight", "weighted_bodyweight"],
      ["Incline Sliding Bench Pull-up", "machine", "bodyweight_reps"],
      ["Garhammer Raise", "bodyweight", "bodyweight_reps"],
      ["Reverse Grip Triceps Pushdown", "cable", "weight_reps"],
      ["Dumbbell Seal Row", "dumbbell", "weight_reps"],
      ["Single Leg Dumbbell Calf Raise", "dumbbell", "weight_reps"],
      ["Seated Machine Triceps Extension", "machine", "weight_reps"],
      ["Warm Up", "bodyweight", "duration"],
    ];
    for (const [name, equipment, exercise_type] of expected) {
      const matches = catalog.filter(row => row.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ equipment, exercise_type, exercisedb_id: null, gif_url: null });
    }
    expect(catalog.find(row => row.name === "Barbell Seal Row")?.preset_id)
      .not.toBe(catalog.find(row => row.name === "Dumbbell Seal Row")?.preset_id);
    expect(catalog.find(row => row.name === "Machine Overhead Triceps Extension")?.preset_id)
      .not.toBe(catalog.find(row => row.name === "Seated Machine Triceps Extension")?.preset_id);
  });

  it("loads and returns catalog entries", () => {
    const catalog = loadCatalog();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(100);
  });

  it("each entry has required fields", () => {
    const catalog = loadCatalog();
    for (const entry of catalog) {
      expect(entry.name).toBeTruthy();
      expect(entry.muscle_group_primary).toBeTruthy();
      expect(entry.equipment).toBeTruthy();
      expect(entry.exercise_type).toBeTruthy();
      expect(Array.isArray(entry.muscle_groups_secondary)).toBe(true);
    }
  });

  it("has entries with exercisedb_id (matched exercises)", () => {
    const catalog = loadCatalog();
    const matched = catalog.filter((e) => e.exercisedb_id !== null);
    expect(matched.length).toBeGreaterThan(0);
  });
});
