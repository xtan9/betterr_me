/**
 * Income pattern detection algorithm.
 *
 * Analyzes positive-amount transactions to detect recurring income deposits.
 * Pure function: no DB calls, no side effects.
 * All amounts are integer cents.
 */

import { differenceInDays, format, addDays, addMonths } from "date-fns";
import type { DetectedIncome } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the median of a sorted array of numbers.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Compute the standard deviation of an array of numbers.
 */
function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Classify a median interval (in days) into a frequency category.
 * Returns null if the interval doesn't match any known pattern.
 */
function classifyFrequency(
  medianInterval: number
): "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | null {
  if (medianInterval >= 5 && medianInterval <= 9) return "WEEKLY";
  if (medianInterval >= 12 && medianInterval <= 16) {
    // Could be BIWEEKLY (14d) or SEMI_MONTHLY (15d)
    // Use BIWEEKLY as default; the distinction is subtle
    return medianInterval >= 15 ? "SEMI_MONTHLY" : "BIWEEKLY";
  }
  if (medianInterval >= 26 && medianInterval <= 35) return "MONTHLY";
  return null;
}

/**
 * Predict the next income date based on the last occurrence and frequency.
 */
export function predictNextIncomeDate(
  lastDate: string,
  frequency: string
): string {
  const date = new Date(lastDate + "T12:00:00");

  switch (frequency) {
    case "WEEKLY":
      return format(addDays(date, 7), "yyyy-MM-dd");
    case "BIWEEKLY":
      return format(addDays(date, 14), "yyyy-MM-dd");
    case "SEMI_MONTHLY": {
      // If on/before 15th, next is 15th or 1st of next month
      const day = date.getDate();
      if (day <= 14) {
        return format(
          new Date(date.getFullYear(), date.getMonth(), 15, 12, 0, 0),
          "yyyy-MM-dd"
        );
      } else {
        return format(
          new Date(date.getFullYear(), date.getMonth() + 1, 1, 12, 0, 0),
          "yyyy-MM-dd"
        );
      }
    }
    case "MONTHLY":
      return format(addMonths(date, 1), "yyyy-MM-dd");
    default:
      return format(addMonths(date, 1), "yyyy-MM-dd");
  }
}

// ---------------------------------------------------------------------------
// detectIncomePatterns
// ---------------------------------------------------------------------------

/**
 * Detect recurring income patterns from transaction history.
 *
 * Algorithm:
 * 1. Filter positive amount transactions (income/deposits only)
 * 2. Filter out transactions without merchant_name
 * 3. Group by normalized merchant_name (trimmed, lowercase)
 * 4. For each group with >= 3 occurrences:
 *    a. Sort by transaction_date ascending
 *    b. Compute intervals between consecutive dates
 *    c. Compute median interval
 *    d. Classify frequency (WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY)
 *    e. Compute confidence = 1 - (stddev / median), clamped to [0, 1]
 *    f. Compute median amount_cents
 *    g. Predict next date
 * 5. Return patterns with confidence >= 0.7
 * 6. Sort by amount_cents descending (largest income first)
 */
export function detectIncomePatterns(
  transactions: {
    merchant_name: string | null;
    amount_cents: number;
    transaction_date: string;
  }[]
): DetectedIncome[] {
  // Step 1 & 2: Filter income transactions with merchant names
  const incomeTransactions = transactions.filter(
    (t) => t.amount_cents > 0 && t.merchant_name !== null && t.merchant_name.trim() !== ""
  );

  // Step 3: Group by normalized merchant name
  const groups = new Map<
    string,
    { amount_cents: number; transaction_date: string }[]
  >();

  for (const t of incomeTransactions) {
    const key = t.merchant_name!.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      amount_cents: t.amount_cents,
      transaction_date: t.transaction_date,
    });
  }

  const patterns: DetectedIncome[] = [];

  // Step 4: Analyze each group
  for (const [normalizedName, txns] of groups) {
    // Need at least 3 occurrences to detect a pattern
    if (txns.length < 3) continue;

    // Sort by date ascending
    txns.sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() -
        new Date(b.transaction_date).getTime()
    );

    // Compute intervals between consecutive dates
    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const days = differenceInDays(
        new Date(txns[i].transaction_date + "T12:00:00"),
        new Date(txns[i - 1].transaction_date + "T12:00:00")
      );
      intervals.push(days);
    }

    // Compute median interval
    const medianInterval = median(intervals);

    // Classify frequency
    const frequency = classifyFrequency(medianInterval);
    if (!frequency) continue; // Interval doesn't match a known pattern

    // Compute confidence = 1 - (stddev / median), clamped to [0, 1]
    const intervalStddev = stddev(intervals);
    const confidence = Math.max(
      0,
      Math.min(1, 1 - intervalStddev / medianInterval)
    );

    // Step 5: Only include patterns with confidence >= 0.7
    if (confidence < 0.7) continue;

    // Compute median amount
    const amounts = txns.map((t) => t.amount_cents);
    const medianAmount = Math.round(median(amounts));

    // Last occurrence and predicted next
    const lastOccurrence = txns[txns.length - 1].transaction_date;
    const nextPredicted = predictNextIncomeDate(lastOccurrence, frequency);

    // Use the original merchant name from the first transaction for display,
    // but we store normalized in the key
    patterns.push({
      merchant_name: normalizedName,
      amount_cents: medianAmount,
      frequency,
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
      last_occurrence: lastOccurrence,
      next_predicted: nextPredicted,
    });
  }

  // Step 6: Sort by amount descending (largest income first)
  patterns.sort((a, b) => b.amount_cents - a.amount_cents);

  return patterns;
}
