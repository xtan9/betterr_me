import { describe, it, expect } from "vitest";
import { escapeCsvField, transactionsToCsv } from "@/lib/money/csv-export";
import type { Transaction } from "@/lib/db/types";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    household_id: "hh-1",
    account_id: "acc-1",
    amount_cents: 1033,
    description: "Coffee Shop",
    merchant_name: "Starbucks",
    category: "Food & Drink",
    category_id: "cat-1",
    notes: null,
    transaction_date: "2026-01-15",
    is_pending: false,
    is_hidden_from_household: false,
    is_shared_to_household: false,
    plaid_transaction_id: null,
    plaid_category_primary: null,
    plaid_category_detailed: null,
    source: "plaid",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("escapeCsvField", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("returns plain string unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("wraps field containing comma in double quotes", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("escapes internal double quotes and wraps in quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps field containing newline in double quotes", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps field containing carriage return in double quotes", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("handles field with both comma and quotes", () => {
    expect(escapeCsvField('price is $10, or "best offer"')).toBe(
      '"price is $10, or ""best offer"""'
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

describe("transactionsToCsv", () => {
  it("returns headers only for empty array", () => {
    const csv = transactionsToCsv([]);
    const lines = csv.split("\n");
    // First line starts with BOM + headers
    expect(lines[0]).toBe(
      "\uFEFFDate,Description,Merchant,Amount,Category,Account,Source,Notes"
    );
    expect(lines).toHaveLength(1);
  });

  it("starts with UTF-8 BOM character", () => {
    const csv = transactionsToCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("produces correct row for a single transaction", () => {
    const txn = makeTransaction();
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "2026-01-15,Coffee Shop,Starbucks,10.33,Food & Drink,acc-1,plaid,"
    );
  });

  it("formats amounts using centsToDecimal (1033 -> 10.33)", () => {
    const txn = makeTransaction({ amount_cents: 1033 });
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("10.33");
  });

  it("resolves account names from map", () => {
    const txn = makeTransaction({ account_id: "acc-123" });
    const nameMap = { "acc-123": "Chase Checking" };
    const csv = transactionsToCsv([txn], nameMap);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Chase Checking");
    expect(lines[1]).not.toContain("acc-123");
  });

  it("falls back to account_id when not in map", () => {
    const txn = makeTransaction({ account_id: "acc-unknown" });
    const nameMap = { "acc-other": "Other Account" };
    const csv = transactionsToCsv([txn], nameMap);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("acc-unknown");
  });

  it("handles null merchant_name gracefully", () => {
    const txn = makeTransaction({ merchant_name: null });
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    // Merchant column should be empty (between two commas)
    expect(lines[1]).toContain("Coffee Shop,,10.33");
  });

  it("handles null notes gracefully", () => {
    const txn = makeTransaction({ notes: null });
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    // Last field (notes) should be empty
    expect(lines[1]).toMatch(/,plaid,$/);
  });

  it("escapes fields containing commas", () => {
    const txn = makeTransaction({ description: "Whole Foods, Inc." });
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Whole Foods, Inc."');
  });

  it("handles negative amounts (outflows)", () => {
    const txn = makeTransaction({ amount_cents: -5050 });
    const csv = transactionsToCsv([txn]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("-50.50");
  });

  it("handles multiple transactions", () => {
    const txns = [
      makeTransaction({ id: "txn-1", amount_cents: 100 }),
      makeTransaction({ id: "txn-2", amount_cents: 200 }),
      makeTransaction({ id: "txn-3", amount_cents: 300 }),
    ];
    const csv = transactionsToCsv(txns);
    const lines = csv.split("\n");
    // 1 header + 3 data rows
    expect(lines).toHaveLength(4);
  });
});
