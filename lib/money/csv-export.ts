import type { Transaction } from "@/lib/db/types";
import { centsToDecimal } from "@/lib/money/arithmetic";

/**
 * Escape a CSV field per RFC 4180.
 *
 * Rules:
 * - Wrap field in double quotes if it contains comma, double quote, or newline.
 * - Escape internal double quotes by doubling them ("" inside quotes).
 * - Return empty string for null/undefined.
 */
export function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return "";

  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a CSV string from an array of transactions.
 *
 * - Starts with UTF-8 BOM (\uFEFF) for Excel compatibility.
 * - Headers: Date, Description, Merchant, Amount, Category, Account, Source, Notes.
 * - Amounts formatted in dollars via centsToDecimal (e.g. 1033 -> "10.33").
 * - If accountNameMap is provided, resolves account_id to a human-readable name.
 *
 * @param transactions - Array of Transaction objects to export
 * @param accountNameMap - Optional mapping of account_id -> display name
 * @returns CSV string with BOM prefix
 */
export function transactionsToCsv(
  transactions: Transaction[],
  accountNameMap?: Record<string, string>
): string {
  const headers = [
    "Date",
    "Description",
    "Merchant",
    "Amount",
    "Category",
    "Account",
    "Source",
    "Notes",
  ];

  const rows = transactions.map((t) => [
    escapeCsvField(t.transaction_date),
    escapeCsvField(t.description),
    escapeCsvField(t.merchant_name),
    escapeCsvField(centsToDecimal(t.amount_cents)),
    escapeCsvField(t.category),
    escapeCsvField(
      accountNameMap ? (accountNameMap[t.account_id] || t.account_id) : t.account_id
    ),
    escapeCsvField(t.source),
    escapeCsvField(t.notes),
  ]);

  const csvLines = [headers.join(","), ...rows.map((row) => row.join(","))];

  // UTF-8 BOM + CSV content
  return "\uFEFF" + csvLines.join("\n");
}
