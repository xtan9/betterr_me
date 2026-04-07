import { describe, it, expect } from "vitest";
import { loadCatalog, type CatalogEntry } from "@/lib/exercisedb/catalog";

describe("loadCatalog", () => {
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
