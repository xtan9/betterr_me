/**
 * Pure functions for CSV import logic.
 *
 * No DB imports — all inputs are typed function arguments.
 * Used by the CSV import API route and (future) CSV import UI.
 */

/** Maximum number of rows allowed in a single import. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Mapping of target transaction fields to common CSV header aliases.
 * Used by autoMapColumns to match user-uploaded CSV headers to our schema.
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  transaction_date: [
    "date",
    "transaction date",
    "trans date",
    "posting date",
    "posted date",
  ],
  amount: ["amount", "debit", "credit", "transaction amount", "sum"],
  description: [
    "description",
    "memo",
    "details",
    "narrative",
    "payee",
    "name",
  ],
  merchant_name: ["merchant", "merchant name", "payee"],
  category: ["category", "type", "classification"],
};

/** Ordered list of target fields for CSV column mapping. */
export const TARGET_FIELDS = [
  "transaction_date",
  "amount",
  "description",
  "merchant_name",
  "category",
] as const;

/**
 * Auto-map CSV headers to target transaction fields using aliases.
 *
 * Uses case-insensitive matching:
 * 1. Exact match first (normalized)
 * 2. Includes match as fallback
 *
 * @param csvHeaders - Array of CSV header strings from the uploaded file
 * @returns Mapping of target field name -> matched CSV header (or null)
 */
export function autoMapColumns(
  csvHeaders: string[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const normalizedHeaders = csvHeaders.map((h) => h.toLowerCase().trim());

  for (const targetField of TARGET_FIELDS) {
    const aliases = COLUMN_ALIASES[targetField];
    let matched: string | null = null;

    // Pass 1: exact match (normalized)
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.includes(normalizedHeaders[i])) {
        matched = csvHeaders[i];
        break;
      }
    }

    // Pass 2: includes match (if no exact match found)
    if (!matched) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        for (const alias of aliases) {
          if (normalizedHeaders[i].includes(alias)) {
            matched = csvHeaders[i];
            break;
          }
        }
        if (matched) break;
      }
    }

    result[targetField] = matched;
  }

  return result;
}

/**
 * Generate a deterministic key for duplicate detection.
 *
 * Key format: `date|amountCents|normalized_description`
 * where normalized = lowercase trimmed description.
 *
 * @param date - Transaction date (YYYY-MM-DD)
 * @param amountCents - Amount in integer cents
 * @param description - Transaction description
 * @returns Deterministic string key
 */
export function transactionDuplicateKey(
  date: string,
  amountCents: number,
  description: string
): string {
  return `${date}|${amountCents}|${description.toLowerCase().trim()}`;
}

/**
 * Detect which import rows are potential duplicates of existing transactions.
 *
 * Compares import rows against existing transactions using deterministic keys
 * (date + amount + normalized description).
 *
 * @param importRows - Rows from the CSV import
 * @param existingRows - Existing transactions in the household
 * @returns Set of import row indices that are potential duplicates
 */
export function detectDuplicates(
  importRows: Array<{
    date: string;
    amountCents: number;
    description: string;
  }>,
  existingRows: Array<{
    transaction_date: string;
    amount_cents: number;
    description: string;
  }>
): Set<number> {
  // Build a set of existing transaction keys
  const existingKeys = new Set<string>();
  for (const row of existingRows) {
    existingKeys.add(
      transactionDuplicateKey(
        row.transaction_date,
        row.amount_cents,
        row.description
      )
    );
  }

  // Find import rows that match existing keys
  const duplicateIndices = new Set<number>();
  for (let i = 0; i < importRows.length; i++) {
    const key = transactionDuplicateKey(
      importRows[i].date,
      importRows[i].amountCents,
      importRows[i].description
    );
    if (existingKeys.has(key)) {
      duplicateIndices.add(i);
    }
  }

  return duplicateIndices;
}
