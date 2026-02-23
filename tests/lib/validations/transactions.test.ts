import { describe, it, expect } from "vitest";
import { transactionFilterSchema } from "@/lib/validations/transactions";
import {
  categoryCreateSchema,
  merchantRuleCreateSchema,
  transactionUpdateSchema,
  transactionSplitSchema,
} from "@/lib/validations/money";

// =============================================================================
// transactionFilterSchema
// =============================================================================

describe("transactionFilterSchema", () => {
  it("accepts valid filter with all fields", () => {
    const result = transactionFilterSchema.safeParse({
      search: "coffee",
      account_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      date_from: "2026-01-01",
      date_to: "2026-02-22",
      amount_min: "10",
      amount_max: "500",
      limit: "25",
      offset: "0",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid filter with no fields (all optional)", () => {
    const result = transactionFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(0);
    }
  });

  it("accepts search as string", () => {
    const result = transactionFilterSchema.safeParse({ search: "starbucks" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("starbucks");
    }
  });

  it("rejects date_from with invalid date format", () => {
    const result = transactionFilterSchema.safeParse({
      date_from: "02/22/2026",
    });
    expect(result.success).toBe(false);
  });

  it("accepts date_from with YYYY-MM-DD format", () => {
    const result = transactionFilterSchema.safeParse({
      date_from: "2026-02-22",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date_from).toBe("2026-02-22");
    }
  });

  it("rejects date_from with partial date", () => {
    const result = transactionFilterSchema.safeParse({
      date_from: "2026-02",
    });
    expect(result.success).toBe(false);
  });

  it("coerces amount_min from string to number", () => {
    const result = transactionFilterSchema.safeParse({ amount_min: "42.5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount_min).toBe(42.5);
    }
  });

  it("defaults limit to 50 when not provided", () => {
    const result = transactionFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects limit greater than 100", () => {
    const result = transactionFilterSchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects limit of 0", () => {
    const result = transactionFilterSchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("defaults offset to 0 when not provided", () => {
    const result = transactionFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
    }
  });

  it("rejects negative offset", () => {
    const result = transactionFilterSchema.safeParse({ offset: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for account_id", () => {
    const result = transactionFilterSchema.safeParse({
      account_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for category_id", () => {
    const result = transactionFilterSchema.safeParse({
      category_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// categoryCreateSchema
// =============================================================================

describe("categoryCreateSchema", () => {
  it("accepts valid category with name only", () => {
    const result = categoryCreateSchema.safeParse({ name: "Food" });
    expect(result.success).toBe(true);
  });

  it("accepts valid category with all fields", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Food & Dining",
      icon: "\uD83C\uDF55",
      color: "#ff6b2b",
      display_name: "Food",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = categoryCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 50 characters", () => {
    const result = categoryCreateSchema.safeParse({
      name: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("trims name whitespace", () => {
    const result = categoryCreateSchema.safeParse({ name: "  Food  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Food");
    }
  });

  it("rejects invalid color hex", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Food",
      color: "red",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid hex color", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Food",
      color: "#4ade80",
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// merchantRuleCreateSchema
// =============================================================================

describe("merchantRuleCreateSchema", () => {
  it("accepts valid merchant rule", () => {
    const result = merchantRuleCreateSchema.safeParse({
      merchant_name: "Starbucks",
      category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing merchant_name", () => {
    const result = merchantRuleCreateSchema.safeParse({
      category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty merchant_name", () => {
    const result = merchantRuleCreateSchema.safeParse({
      merchant_name: "",
      category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category_id (not UUID)", () => {
    const result = merchantRuleCreateSchema.safeParse({
      merchant_name: "Starbucks",
      category_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing category_id", () => {
    const result = merchantRuleCreateSchema.safeParse({
      merchant_name: "Starbucks",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// transactionUpdateSchema
// =============================================================================

describe("transactionUpdateSchema", () => {
  it("accepts category_id update", () => {
    const result = transactionUpdateSchema.safeParse({
      category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.success).toBe(true);
  });

  it("accepts notes update", () => {
    const result = transactionUpdateSchema.safeParse({
      notes: "Weekly grocery run",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null category_id (uncategorize)", () => {
    const result = transactionUpdateSchema.safeParse({
      category_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null notes (clear notes)", () => {
    const result = transactionUpdateSchema.safeParse({
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one field", () => {
    const result = transactionUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than 500 characters", () => {
    const result = transactionUpdateSchema.safeParse({
      notes: "X".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// transactionSplitSchema
// =============================================================================

describe("transactionSplitSchema", () => {
  it("accepts valid split with 2 entries", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1500,
        },
        {
          category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid split with notes", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1500,
          notes: "Food portion",
        },
        {
          category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1000,
          notes: "Household portion",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("requires minimum 2 splits", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 2500,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty splits array", () => {
    const result = transactionSplitSchema.safeParse({ splits: [] });
    expect(result.success).toBe(false);
  });

  it("rejects split with invalid category_id", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        { category_id: "not-uuid", amount_cents: 1500 },
        {
          category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1000,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects split with non-integer amount_cents", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 15.5,
        },
        {
          category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1000,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts split with 3 or more entries", () => {
    const result = transactionSplitSchema.safeParse({
      splits: [
        {
          category_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 1000,
        },
        {
          category_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 800,
        },
        {
          category_id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          amount_cents: 700,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
