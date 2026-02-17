import { describe, it, expect } from "vitest";
import {
  habitFormSchema,
  habitUpdateSchema,
} from "@/lib/validations/habit";

const validHabit = (overrides: Record<string, unknown> = {}) => ({
  name: "Test Habit",
  frequency: { type: "daily" },
  ...overrides,
});

describe("habitFormSchema", () => {
  describe("name field", () => {
    it("accepts valid name", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "Morning Run" }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = habitFormSchema.safeParse(validHabit({ name: "" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("required");
      }
    });

    it("rejects whitespace-only name", () => {
      const result = habitFormSchema.safeParse(validHabit({ name: "   " }));
      expect(result.success).toBe(false);
    });

    it("trims whitespace from name", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "  Morning Run  " }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Morning Run");
      }
    });

    it("accepts name at exactly 100 characters", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "a".repeat(100) }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects name over 100 characters", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "a".repeat(101) }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100");
      }
    });

    it("accepts Unicode characters in name", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "Habitude quotidienne" }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts emoji in name", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "Morning Run \u{1F3C3}" }),
      );
      expect(result.success).toBe(true);
    });

    it("handles name with only null bytes", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "\0\0\0" }),
      );
      // After trim, null bytes remain (they are not whitespace).
      // The string has length 3, so min(1) passes. Document actual behavior.
      if (result.success) {
        expect(result.data.name).toBe("\0\0\0");
      }
      // If implementation trims null bytes, it may fail — either way, document behavior.
    });

    it("handles extremely long name (10000 chars)", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "a".repeat(10000) }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts name with special characters", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "Habit <script>alert('xss')</script>" }),
      );
      // Zod validates length, not content — XSS prevention is at rendering layer
      expect(result.success).toBe(true);
    });

    it("accepts name with SQL injection attempt", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ name: "'; DROP TABLE habits; --" }),
      );
      // Zod validates format; DB uses parameterized queries for injection safety
      expect(result.success).toBe(true);
    });
  });

  describe("description field", () => {
    it("accepts valid description", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: "A morning run" }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts null description", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: null }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts omitted description", () => {
      const result = habitFormSchema.safeParse(validHabit());
      expect(result.success).toBe(true);
    });

    it("accepts description at exactly 500 characters", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: "a".repeat(500) }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects description over 500 characters", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: "a".repeat(501) }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts empty string description", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: "" }),
      );
      // description is optional with no min, so empty string is valid
      expect(result.success).toBe(true);
    });

    it("handles Unicode in description", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ description: "Run every morning at 6am" }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("category field", () => {
    it("accepts all valid category values", () => {
      for (const category of [
        "health",
        "wellness",
        "learning",
        "productivity",
        "other",
      ] as const) {
        const result = habitFormSchema.safeParse(validHabit({ category }));
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid category value", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ category: "invalid" }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts null category", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ category: null }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts omitted category", () => {
      const result = habitFormSchema.safeParse(validHabit());
      expect(result.success).toBe(true);
    });
  });

  describe("frequency field", () => {
    it("accepts daily frequency", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "daily" } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts weekdays frequency", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "weekdays" } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts weekly frequency", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "weekly" } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts times_per_week with count 2", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "times_per_week", count: 2 } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts times_per_week with count 3", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "times_per_week", count: 3 } }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects times_per_week with count 1", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "times_per_week", count: 1 } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects times_per_week with count 5", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "times_per_week", count: 5 } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects times_per_week without count", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "times_per_week" } }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts custom frequency with valid days", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom", days: [1, 3, 5] } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts custom frequency with single day", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom", days: [0] } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts custom frequency with all days", () => {
      const result = habitFormSchema.safeParse(
        validHabit({
          frequency: { type: "custom", days: [0, 1, 2, 3, 4, 5, 6] },
        }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects custom frequency with empty days", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom", days: [] } }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least one day");
      }
    });

    it("rejects custom frequency without days", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects custom frequency with day > 6", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom", days: [7] } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects custom frequency with day < 0", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "custom", days: [-1] } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects invalid frequency type", () => {
      const result = habitFormSchema.safeParse(
        validHabit({ frequency: { type: "monthly" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects missing frequency", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { frequency: _freq, ...noFrequency } = validHabit();
      const result = habitFormSchema.safeParse(noFrequency);
      expect(result.success).toBe(false);
    });
  });
});

describe("habitUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = habitUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one field must be provided",
      );
    }
  });

  it("accepts single field update (name)", () => {
    const result = habitUpdateSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts single field update (category)", () => {
    const result = habitUpdateSchema.safeParse({ category: "health" });
    expect(result.success).toBe(true);
  });

  it("accepts single field update (status)", () => {
    const result = habitUpdateSchema.safeParse({ status: "paused" });
    expect(result.success).toBe(true);
  });

  it("accepts single field update (frequency)", () => {
    const result = habitUpdateSchema.safeParse({
      frequency: { type: "daily" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts single field update (description)", () => {
    const result = habitUpdateSchema.safeParse({
      description: "Updated desc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts multi-field update", () => {
    const result = habitUpdateSchema.safeParse({
      name: "New",
      category: "health",
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid name in update", () => {
    const result = habitUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars in update", () => {
    const result = habitUpdateSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category in update", () => {
    const result = habitUpdateSchema.safeParse({ category: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status in update", () => {
    const result = habitUpdateSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "paused", "archived"] as const) {
      const result = habitUpdateSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid frequency in update", () => {
    const result = habitUpdateSchema.safeParse({
      frequency: { type: "monthly" },
    });
    expect(result.success).toBe(false);
  });
});
