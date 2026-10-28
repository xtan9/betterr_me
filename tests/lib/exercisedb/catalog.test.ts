import { describe, it, expect } from "vitest";
import { loadCatalog } from "@/lib/exercisedb/catalog";
import baseline from "../../fixtures/exercise-preset-baseline.json";

describe("loadCatalog", () => {
  it("publishes 400 distinct presets while preserving the 96 live exercise identities", () => {
    const catalog = loadCatalog();
    expect(catalog).toHaveLength(400);
    expect(new Set(catalog.map(row => row.preset_id)).size).toBe(400);
    for (const previous of baseline) {
      expect(catalog.find(row => row.preset_id === previous.id)).toMatchObject({
        name: previous.name, equipment: previous.equipment, exercise_type: previous.exercise_type,
        muscle_group_primary: previous.muscle_group_primary, muscle_groups_secondary: previous.muscle_groups_secondary,
      });
    }
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
