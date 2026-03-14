import { describe, it, expect } from "vitest";
import { csvImportRowSchema, csvImportSchema } from "@/lib/validations/csv-import";

describe("csvImportRowSchema", () => {
  it("accepts a valid row", () => {
    const result = csvImportRowSchema.safeParse({
      transaction_date: "2026-01-15",
      amount: -15.50,
      description: "Coffee Shop",
      merchant_name: "Starbucks",
      category: "Food & Drink",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a row with minimal fields", () => {
    const result = csvImportRowSchema.safeParse({
      transaction_date: "2026-01-15",
      amount: -15.50,
      description: "Coffee Shop",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = csvImportRowSchema.safeParse({
      transaction_date: "01/15/2026",
      amount: -15.50,
      description: "Coffee Shop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = csvImportRowSchema.safeParse({
      transaction_date: "2026-01-15",
      amount: -15.50,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null merchant_name and category", () => {
    const result = csvImportRowSchema.safeParse({
      transaction_date: "2026-01-15",
      amount: -15.50,
      description: "Test",
      merchant_name: null,
      category: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("csvImportSchema", () => {
  const validRow = {
    transaction_date: "2026-01-15",
    amount: -15.50,
    description: "Coffee",
  };

  it("accepts a valid payload with UUID account", () => {
    const result = csvImportSchema.safeParse({
      account_id: "550e8400-e29b-41d4-a716-446655440000",
      rows: [validRow],
      skip_duplicates: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid payload with cash account", () => {
    const result = csvImportSchema.safeParse({
      account_id: "cash",
      rows: [validRow],
      skip_duplicates: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty rows array", () => {
    const result = csvImportSchema.safeParse({
      account_id: "cash",
      rows: [],
      skip_duplicates: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 5000 rows", () => {
    const manyRows = Array.from({ length: 5001 }, (_, i) => ({
      transaction_date: "2026-01-15",
      amount: -i,
      description: `Transaction ${i}`,
    }));
    const result = csvImportSchema.safeParse({
      account_id: "cash",
      rows: manyRows,
      skip_duplicates: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid account_id formats", () => {
    const result = csvImportSchema.safeParse({
      account_id: "not-a-uuid",
      rows: [validRow],
      skip_duplicates: true,
    });
    expect(result.success).toBe(false);
  });

  it("defaults skip_duplicates to true when omitted", () => {
    const result = csvImportSchema.safeParse({
      account_id: "cash",
      rows: [validRow],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skip_duplicates).toBe(true);
    }
  });
});
