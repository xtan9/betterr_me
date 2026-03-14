import { describe, it, expect } from "vitest";
import {
  billCreateSchema,
  billUpdateSchema,
} from "@/lib/validations/bills";
import {
  goalCreateSchema,
  goalUpdateSchema,
  contributionCreateSchema,
  manualAssetCreateSchema,
  manualAssetUpdateSchema,
} from "@/lib/validations/goals";

// =============================================================================
// BILL CREATE SCHEMA
// =============================================================================

describe("billCreateSchema", () => {
  it("passes with valid input", () => {
    const result = billCreateSchema.safeParse({
      name: "Netflix",
      amount: 15.99,
      frequency: "MONTHLY",
      next_due_date: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("passes without optional next_due_date", () => {
    const result = billCreateSchema.safeParse({
      name: "Gym Membership",
      amount: 49.99,
      frequency: "MONTHLY",
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = billCreateSchema.safeParse({
      amount: 15.99,
      frequency: "MONTHLY",
    });
    expect(result.success).toBe(false);
  });

  it("fails with invalid frequency", () => {
    const result = billCreateSchema.safeParse({
      name: "Netflix",
      amount: 15.99,
      frequency: "DAILY",
    });
    expect(result.success).toBe(false);
  });

  it("fails with negative amount", () => {
    const result = billCreateSchema.safeParse({
      name: "Netflix",
      amount: -5,
      frequency: "MONTHLY",
    });
    expect(result.success).toBe(false);
  });

  it("fails with zero amount", () => {
    const result = billCreateSchema.safeParse({
      name: "Netflix",
      amount: 0,
      frequency: "MONTHLY",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// BILL UPDATE SCHEMA
// =============================================================================

describe("billUpdateSchema", () => {
  it("passes with partial updates", () => {
    const result = billUpdateSchema.safeParse({
      name: "Netflix Premium",
    });
    expect(result.success).toBe(true);
  });

  it("passes with user_status update", () => {
    const result = billUpdateSchema.safeParse({
      user_status: "confirmed",
    });
    expect(result.success).toBe(true);
  });

  it("fails with invalid user_status", () => {
    const result = billUpdateSchema.safeParse({
      user_status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("fails with empty object (at least one field required)", () => {
    const result = billUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// GOAL CREATE SCHEMA
// =============================================================================

describe("goalCreateSchema", () => {
  it("passes with valid input", () => {
    const result = goalCreateSchema.safeParse({
      name: "Emergency Fund",
      target_amount: 10000,
      funding_type: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("passes with linked funding and account_id", () => {
    const result = goalCreateSchema.safeParse({
      name: "Vacation",
      target_amount: 5000,
      funding_type: "linked",
      linked_account_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = goalCreateSchema.safeParse({
      target_amount: 10000,
      funding_type: "manual",
    });
    expect(result.success).toBe(false);
  });

  it("fails when linked funding_type without account_id", () => {
    const result = goalCreateSchema.safeParse({
      name: "Vacation",
      target_amount: 5000,
      funding_type: "linked",
    });
    expect(result.success).toBe(false);
  });

  it("fails with zero target amount", () => {
    const result = goalCreateSchema.safeParse({
      name: "Emergency Fund",
      target_amount: 0,
      funding_type: "manual",
    });
    expect(result.success).toBe(false);
  });

  it("fails with negative target amount", () => {
    const result = goalCreateSchema.safeParse({
      name: "Emergency Fund",
      target_amount: -500,
      funding_type: "manual",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// GOAL UPDATE SCHEMA
// =============================================================================

describe("goalUpdateSchema", () => {
  it("passes with partial updates", () => {
    const result = goalUpdateSchema.safeParse({
      name: "Updated Goal Name",
    });
    expect(result.success).toBe(true);
  });

  it("passes with status update", () => {
    const result = goalUpdateSchema.safeParse({
      status: "completed",
    });
    expect(result.success).toBe(true);
  });

  it("fails with invalid status", () => {
    const result = goalUpdateSchema.safeParse({
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("fails with empty object (at least one field required)", () => {
    const result = goalUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fails when funding_type is linked but linked_account_id is null", () => {
    const result = goalUpdateSchema.safeParse({
      funding_type: "linked",
      linked_account_id: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flatErrors = result.error.flatten();
      expect(flatErrors.fieldErrors.linked_account_id).toBeDefined();
    }
  });

  it("fails when funding_type is linked but linked_account_id is omitted", () => {
    const result = goalUpdateSchema.safeParse({
      funding_type: "linked",
    });
    expect(result.success).toBe(false);
  });

  it("passes when funding_type is linked with a valid linked_account_id", () => {
    const result = goalUpdateSchema.safeParse({
      funding_type: "linked",
      linked_account_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// CONTRIBUTION CREATE SCHEMA
// =============================================================================

describe("contributionCreateSchema", () => {
  it("passes with valid input", () => {
    const result = contributionCreateSchema.safeParse({
      amount: 500,
      note: "Monthly savings",
    });
    expect(result.success).toBe(true);
  });

  it("passes without optional note", () => {
    const result = contributionCreateSchema.safeParse({
      amount: 100,
    });
    expect(result.success).toBe(true);
  });

  it("fails with zero amount", () => {
    const result = contributionCreateSchema.safeParse({
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("fails with negative amount", () => {
    const result = contributionCreateSchema.safeParse({
      amount: -50,
    });
    expect(result.success).toBe(false);
  });

  it("fails when note is too long", () => {
    const result = contributionCreateSchema.safeParse({
      amount: 500,
      note: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// MANUAL ASSET CREATE SCHEMA
// =============================================================================

describe("manualAssetCreateSchema", () => {
  it("passes with valid input", () => {
    const result = manualAssetCreateSchema.safeParse({
      name: "Home",
      value: 350000,
      asset_type: "property",
    });
    expect(result.success).toBe(true);
  });

  it("passes with all asset types", () => {
    for (const assetType of ["property", "vehicle", "investment", "other"]) {
      const result = manualAssetCreateSchema.safeParse({
        name: "Test Asset",
        value: 10000,
        asset_type: assetType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("fails with invalid asset_type", () => {
    const result = manualAssetCreateSchema.safeParse({
      name: "Crypto",
      value: 5000,
      asset_type: "cryptocurrency",
    });
    expect(result.success).toBe(false);
  });

  it("fails with zero value", () => {
    const result = manualAssetCreateSchema.safeParse({
      name: "Home",
      value: 0,
      asset_type: "property",
    });
    expect(result.success).toBe(false);
  });

  it("fails with missing name", () => {
    const result = manualAssetCreateSchema.safeParse({
      value: 50000,
      asset_type: "property",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// MANUAL ASSET UPDATE SCHEMA
// =============================================================================

describe("manualAssetUpdateSchema", () => {
  it("passes with partial updates", () => {
    const result = manualAssetUpdateSchema.safeParse({
      value: 375000,
    });
    expect(result.success).toBe(true);
  });

  it("passes with name update", () => {
    const result = manualAssetUpdateSchema.safeParse({
      name: "Updated Home",
    });
    expect(result.success).toBe(true);
  });

  it("passes with nullable notes", () => {
    const result = manualAssetUpdateSchema.safeParse({
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("fails with empty object (at least one field required)", () => {
    const result = manualAssetUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
