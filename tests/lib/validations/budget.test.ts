import { describe, it, expect } from "vitest";
import {
  budgetCreateSchema,
  budgetUpdateSchema,
  rolloverConfirmSchema,
  spendingQuerySchema,
  trendQuerySchema,
} from "@/lib/validations/budget";

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_UUID_2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// =============================================================================
// budgetCreateSchema
// =============================================================================

describe("budgetCreateSchema", () => {
  it("accepts valid budget with categories summing less than total (buffer allowed)", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 2000,
      categories: [
        { category_id: VALID_UUID, amount: 500 },
        { category_id: VALID_UUID_2, amount: 300 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts categories summing exactly to total", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 800,
      categories: [
        { category_id: VALID_UUID, amount: 500 },
        { category_id: VALID_UUID_2, amount: 300 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing month", () => {
    const result = budgetCreateSchema.safeParse({
      total: 2000,
      categories: [{ category_id: VALID_UUID, amount: 500 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects month not first day (e.g., '2026-02-15')", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-15",
      total: 2000,
      categories: [{ category_id: VALID_UUID, amount: 500 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects total that is zero", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 0,
      categories: [{ category_id: VALID_UUID, amount: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative total", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: -100,
      categories: [{ category_id: VALID_UUID, amount: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects categories as empty array", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 2000,
      categories: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative category amount", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 2000,
      categories: [{ category_id: VALID_UUID, amount: -50 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects categories sum exceeding total (envelope violation)", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 500,
      categories: [
        { category_id: VALID_UUID, amount: 300 },
        { category_id: VALID_UUID_2, amount: 300 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const envelopeError = result.error.issues.find(
        (i) => i.path.includes("categories") && i.message.includes("exceed")
      );
      expect(envelopeError).toBeDefined();
    }
  });

  it("rejects category_id that is not UUID format", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 2000,
      categories: [{ category_id: "not-a-uuid", amount: 500 }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults rollover_enabled to false when omitted", () => {
    const result = budgetCreateSchema.safeParse({
      month: "2026-02-01",
      total: 2000,
      categories: [{ category_id: VALID_UUID, amount: 500 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rollover_enabled).toBe(false);
    }
  });
});

// =============================================================================
// budgetUpdateSchema
// =============================================================================

describe("budgetUpdateSchema", () => {
  it("accepts partial update with just total", () => {
    const result = budgetUpdateSchema.safeParse({
      total: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with just rollover_enabled", () => {
    const result = budgetUpdateSchema.safeParse({
      rollover_enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty update (no fields)", () => {
    const result = budgetUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts update with new categories", () => {
    const result = budgetUpdateSchema.safeParse({
      categories: [
        { category_id: VALID_UUID, amount: 600 },
        { category_id: VALID_UUID_2, amount: 400 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// rolloverConfirmSchema
// =============================================================================

describe("rolloverConfirmSchema", () => {
  it("accepts correct from_budget_id UUID", () => {
    const result = rolloverConfirmSchema.safeParse({
      from_budget_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing from_budget_id", () => {
    const result = rolloverConfirmSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// spendingQuerySchema
// =============================================================================

describe("spendingQuerySchema", () => {
  it("accepts valid 'YYYY-MM' format", () => {
    const result = spendingQuerySchema.safeParse({ month: "2026-02" });
    expect(result.success).toBe(true);
  });

  it("rejects '2026-2' (missing leading zero)", () => {
    const result = spendingQuerySchema.safeParse({ month: "2026-2" });
    expect(result.success).toBe(false);
  });

  it("rejects '2026-02-01' (day included)", () => {
    const result = spendingQuerySchema.safeParse({ month: "2026-02-01" });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// trendQuerySchema
// =============================================================================

describe("trendQuerySchema", () => {
  it("accepts months=12", () => {
    const result = trendQuerySchema.safeParse({ months: 12 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.months).toBe(12);
    }
  });

  it("defaults to 12 when months omitted", () => {
    const result = trendQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.months).toBe(12);
    }
  });

  it("rejects months=0", () => {
    const result = trendQuerySchema.safeParse({ months: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects months=25 (exceeds max 24)", () => {
    const result = trendQuerySchema.safeParse({ months: 25 });
    expect(result.success).toBe(false);
  });
});
