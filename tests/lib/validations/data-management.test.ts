import { describe, it, expect } from "vitest";
import {
  exportTransactionsSchema,
  deleteMoneyDataSchema,
} from "@/lib/validations/data-management";

describe("exportTransactionsSchema", () => {
  it("accepts valid date_from and date_to", () => {
    const result = exportTransactionsSchema.safeParse({
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (both fields optional)", () => {
    const result = exportTransactionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts only date_from", () => {
    const result = exportTransactionsSchema.safeParse({
      date_from: "2026-06-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts only date_to", () => {
    const result = exportTransactionsSchema.safeParse({
      date_to: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format (MM/DD/YYYY)", () => {
    const result = exportTransactionsSchema.safeParse({
      date_from: "01/15/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format (no dashes)", () => {
    const result = exportTransactionsSchema.safeParse({
      date_from: "20260115",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string date value", () => {
    const result = exportTransactionsSchema.safeParse({
      date_from: 20260115,
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteMoneyDataSchema", () => {
  it("accepts exact 'DELETE' string", () => {
    const result = deleteMoneyDataSchema.safeParse({
      confirmation: "DELETE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects lowercase 'delete'", () => {
    const result = deleteMoneyDataSchema.safeParse({
      confirmation: "delete",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = deleteMoneyDataSchema.safeParse({
      confirmation: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing confirmation field", () => {
    const result = deleteMoneyDataSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects other strings", () => {
    const result = deleteMoneyDataSchema.safeParse({
      confirmation: "CONFIRM",
    });
    expect(result.success).toBe(false);
  });

  it("rejects number value", () => {
    const result = deleteMoneyDataSchema.safeParse({
      confirmation: 1,
    });
    expect(result.success).toBe(false);
  });
});
