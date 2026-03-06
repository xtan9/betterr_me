import { describe, it, expect } from "vitest";
import { getCategoryDisplayName } from "@/lib/categories/get-category-display-name";
import { SEED_CATEGORIES } from "@/lib/categories/seed";

describe("getCategoryDisplayName", () => {
  const mockT = (key: string) => `translated:${key}`;

  it("returns translated name for each of the 12 default categories", () => {
    for (const cat of SEED_CATEGORIES) {
      const result = getCategoryDisplayName(cat.name, mockT);
      expect(result).toBe(`translated:defaults.${cat.name}`);
    }
  });

  it("returns raw name for custom categories", () => {
    expect(getCategoryDisplayName("My Stuff", mockT)).toBe("My Stuff");
    expect(getCategoryDisplayName("Work Projects", mockT)).toBe("Work Projects");
  });

  it("returns raw name for renamed defaults (e.g. user renamed 'Health' to 'Wellness')", () => {
    expect(getCategoryDisplayName("Wellness", mockT)).toBe("Wellness");
    expect(getCategoryDisplayName("Money", mockT)).toBe("Money");
  });

  it("is case-sensitive — lowercase variants are not translated", () => {
    expect(getCategoryDisplayName("health", mockT)).toBe("health");
    expect(getCategoryDisplayName("HEALTH", mockT)).toBe("HEALTH");
  });
});
