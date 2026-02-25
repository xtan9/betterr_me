import { describe, it, expect } from "vitest";
import {
  autoMapColumns,
  transactionDuplicateKey,
  detectDuplicates,
} from "@/lib/money/csv-import";

describe("autoMapColumns", () => {
  it("maps standard headers correctly", () => {
    const headers = ["Date", "Amount", "Description", "Merchant", "Category"];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBe("Date");
    expect(result.amount).toBe("Amount");
    expect(result.description).toBe("Description");
    expect(result.merchant_name).toBe("Merchant");
    expect(result.category).toBe("Category");
  });

  it("handles case-insensitive matching", () => {
    const headers = ["DATE", "AMOUNT", "DESCRIPTION"];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBe("DATE");
    expect(result.amount).toBe("AMOUNT");
    expect(result.description).toBe("DESCRIPTION");
  });

  it("maps common aliases", () => {
    const headers = ["Posting Date", "Debit", "Memo", "Payee"];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBe("Posting Date");
    expect(result.amount).toBe("Debit");
    expect(result.description).toBe("Memo");
    expect(result.merchant_name).toBe("Payee");
  });

  it("returns null for unmapped fields", () => {
    const headers = ["Date", "Amount", "Description"];
    const result = autoMapColumns(headers);

    expect(result.merchant_name).toBeNull();
    expect(result.category).toBeNull();
  });

  it("handles headers with extra whitespace", () => {
    const headers = ["  date  ", " amount ", " description "];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBe("  date  ");
    expect(result.amount).toBe(" amount ");
    expect(result.description).toBe(" description ");
  });

  it("handles includes-based matching for partial aliases", () => {
    const headers = ["Transaction Date", "Transaction Amount", "Transaction Details"];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBe("Transaction Date");
    expect(result.amount).toBe("Transaction Amount");
    expect(result.description).toBe("Transaction Details");
  });

  it("returns empty mapping for unknown headers", () => {
    const headers = ["foo", "bar", "baz"];
    const result = autoMapColumns(headers);

    expect(result.transaction_date).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.description).toBeNull();
    expect(result.merchant_name).toBeNull();
    expect(result.category).toBeNull();
  });
});

describe("transactionDuplicateKey", () => {
  it("generates a consistent key", () => {
    const key = transactionDuplicateKey("2026-01-15", -1500, "Coffee Shop");
    expect(key).toBe("2026-01-15|-1500|coffee shop");
  });

  it("normalizes description to lowercase and trims whitespace", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "  Coffee Shop  ");
    const key2 = transactionDuplicateKey("2026-01-15", 1000, "coffee shop");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different dates", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "Test");
    const key2 = transactionDuplicateKey("2026-01-16", 1000, "Test");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different amounts", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "Test");
    const key2 = transactionDuplicateKey("2026-01-15", 2000, "Test");
    expect(key1).not.toBe(key2);
  });
});

describe("detectDuplicates", () => {
  it("detects duplicates by key", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
      { date: "2026-01-16", amountCents: -2500, description: "Lunch" },
    ];

    const existingRows = [
      { transaction_date: "2026-01-15", amount_cents: -1500, description: "coffee" },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates.size).toBe(1);
    expect(duplicates.has(0)).toBe(true);
    expect(duplicates.has(1)).toBe(false);
  });

  it("returns correct indices for multiple duplicates", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
      { date: "2026-01-16", amountCents: -2500, description: "Lunch" },
      { date: "2026-01-17", amountCents: -3500, description: "Dinner" },
    ];

    const existingRows = [
      { transaction_date: "2026-01-15", amount_cents: -1500, description: "coffee" },
      { transaction_date: "2026-01-17", amount_cents: -3500, description: "dinner" },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates.size).toBe(2);
    expect(duplicates.has(0)).toBe(true);
    expect(duplicates.has(1)).toBe(false);
    expect(duplicates.has(2)).toBe(true);
  });

  it("handles empty arrays", () => {
    expect(detectDuplicates([], []).size).toBe(0);
    expect(
      detectDuplicates(
        [{ date: "2026-01-15", amountCents: -1500, description: "Coffee" }],
        []
      ).size
    ).toBe(0);
    expect(
      detectDuplicates(
        [],
        [{ transaction_date: "2026-01-15", amount_cents: -1500, description: "coffee" }]
      ).size
    ).toBe(0);
  });

  it("returns empty set when no duplicates found", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
    ];

    const existingRows = [
      { transaction_date: "2026-01-16", amount_cents: -2500, description: "Lunch" },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates.size).toBe(0);
  });
});
