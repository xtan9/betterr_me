import { describe, it, expect } from "vitest";
import {
  incomeConfirmationSchema,
  insightDismissSchema,
} from "@/lib/validations/money";

// =============================================================================
// INCOME CONFIRMATION SCHEMA
// =============================================================================

describe("incomeConfirmationSchema", () => {
  it("valid input passes", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Acme Corp",
      amount_cents: 500_000,
      frequency: "MONTHLY",
      next_expected_date: "2026-03-01",
    });
    expect(result.success).toBe(true);
  });

  it("all valid frequencies accepted", () => {
    const frequencies = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"];
    for (const frequency of frequencies) {
      const result = incomeConfirmationSchema.safeParse({
        merchant_name: "Test Corp",
        amount_cents: 100_000,
        frequency,
        next_expected_date: "2026-03-01",
      });
      expect(result.success).toBe(true);
    }
  });

  it("invalid frequency rejected", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Acme Corp",
      amount_cents: 500_000,
      frequency: "DAILY",
      next_expected_date: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("invalid date format rejected", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Acme Corp",
      amount_cents: 500_000,
      frequency: "MONTHLY",
      next_expected_date: "03-01-2026", // wrong format
    });
    expect(result.success).toBe(false);
  });

  it("missing merchant_name rejected", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "",
      amount_cents: 500_000,
      frequency: "MONTHLY",
      next_expected_date: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("non-integer amount_cents rejected", () => {
    const result = incomeConfirmationSchema.safeParse({
      merchant_name: "Acme Corp",
      amount_cents: 500.50,
      frequency: "MONTHLY",
      next_expected_date: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// INSIGHT DISMISS SCHEMA
// =============================================================================

describe("insightDismissSchema", () => {
  it("valid insight_id passes", () => {
    const result = insightDismissSchema.safeParse({
      insight_id: "spending_anomaly:groceries:2026-02",
    });
    expect(result.success).toBe(true);
  });

  it("empty string rejected", () => {
    const result = insightDismissSchema.safeParse({
      insight_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("missing insight_id rejected", () => {
    const result = insightDismissSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
