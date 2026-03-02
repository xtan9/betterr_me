import { describe, it, expect } from "vitest";
import {
  moneyAmountSchema,
  householdIdSchema,
  categoryCreateSchema,
  transactionUpdateSchema,
  transactionSplitSchema,
  incomeConfirmationSchema,
} from "@/lib/validations/money";

// =============================================================================
// moneyAmountSchema
// =============================================================================

describe("moneyAmountSchema", () => {
  it("accepts valid positive amount", () => {
    const result = moneyAmountSchema.safeParse(10.33);
    expect(result.success).toBe(true);
  });

  it("accepts valid negative amount", () => {
    const result = moneyAmountSchema.safeParse(-50.25);
    expect(result.success).toBe(true);
  });

  it("accepts whole number", () => {
    const result = moneyAmountSchema.safeParse(100);
    expect(result.success).toBe(true);
  });

  it("accepts single decimal place", () => {
    const result = moneyAmountSchema.safeParse(9.5);
    expect(result.success).toBe(true);
  });

  it("accepts zero", () => {
    const result = moneyAmountSchema.safeParse(0);
    expect(result.success).toBe(true);
  });

  it("rejects more than 2 decimal places", () => {
    const result = moneyAmountSchema.safeParse(10.333);
    expect(result.success).toBe(false);
  });

  it("rejects amount exceeding max", () => {
    const result = moneyAmountSchema.safeParse(1_000_000_000);
    expect(result.success).toBe(false);
  });

  it("rejects amount below min", () => {
    const result = moneyAmountSchema.safeParse(-1_000_000_000);
    expect(result.success).toBe(false);
  });

  it("accepts boundary value 999999999.99", () => {
    const result = moneyAmountSchema.safeParse(999_999_999.99);
    expect(result.success).toBe(true);
  });

  it("accepts boundary value -999999999.99", () => {
    const result = moneyAmountSchema.safeParse(-999_999_999.99);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// householdIdSchema
// =============================================================================

describe("householdIdSchema", () => {
  it("accepts valid UUID", () => {
    const result = householdIdSchema.safeParse(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result.success).toBe(true);
  });

  it("rejects invalid string", () => {
    const result = householdIdSchema.safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = householdIdSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// categoryCreateSchema
// =============================================================================

describe("categoryCreateSchema", () => {
  it("accepts valid category", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Groceries",
      color: "#FF5733",
    });
    expect(result.success).toBe(true);
  });

  it("accepts category with only name", () => {
    const result = categoryCreateSchema.safeParse({ name: "Food" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = categoryCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 50 characters", () => {
    const result = categoryCreateSchema.safeParse({
      name: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid color format", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Food",
      color: "red",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid hex color", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Food",
      color: "#00FF00",
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// transactionUpdateSchema
// =============================================================================

describe("transactionUpdateSchema", () => {
  it("accepts valid update with category_id", () => {
    const result = transactionUpdateSchema.safeParse({
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid update with notes", () => {
    const result = transactionUpdateSchema.safeParse({
      notes: "Lunch with team",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = transactionUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts null category_id", () => {
    const result = transactionUpdateSchema.safeParse({ category_id: null });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// transactionSplitSchema
// =============================================================================

describe("transactionSplitSchema", () => {
  it("accepts valid 2+ splits", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "550e8400-e29b-41d4-a716-446655440000",
          amount_cents: 500,
        },
        {
          category_id: "660e8400-e29b-41d4-a716-446655440000",
          amount_cents: 300,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects only 1 split", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "550e8400-e29b-41d4-a716-446655440000",
          amount_cents: 500,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty splits array", () => {
    const result = transactionSplitSchema.safeParse({ splits: [] });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// incomeConfirmationSchema
// =============================================================================

describe("incomeConfirmationSchema", () => {
  it("accepts valid income confirmation", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Employer Inc",
      amount_cents: 500000,
      frequency: "MONTHLY",
      next_expected_date: "2026-04-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Employer Inc",
      amount_cents: 500000,
      frequency: "MONTHLY",
      next_expected_date: "04/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid frequency", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Employer Inc",
      amount_cents: 500000,
      frequency: "DAILY",
      next_expected_date: "2026-04-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty merchant_name", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "",
      amount_cents: 500000,
      frequency: "MONTHLY",
      next_expected_date: "2026-04-01",
    });
    expect(result.success).toBe(false);
  });
});
