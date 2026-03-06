/**
 * Pure projection functions for cash flow computation.
 *
 * Sign convention (consistent with project):
 * - amount_cents < 0 = outflow (expenses, bills)
 * - amount_cents > 0 = inflow (income, deposits)
 * - Bills in the DB are stored as negative cents (e.g., -9999 for a $99.99 bill)
 * - Income is positive cents
 *
 * All functions are pure: no DB calls, no side effects.
 * All amounts are integer cents.
 */

import { addDays, differenceInDays, format, addMonths } from "date-fns";
import type { DailyBalance } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectionInput {
  currentBalanceCents: number;
  /** Bills with negative amount_cents (outflow). */
  upcomingBills: { amount_cents: number; due_date: string }[];
  /** Positive cents/day representing average discretionary outflow. */
  dailySpendingRateCents: number;
  /** Confirmed income sources with positive amount_cents. */
  confirmedIncome: {
    amount_cents: number;
    next_date: string;
    frequency: string;
  }[] | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Income date projection helper
// ---------------------------------------------------------------------------

/**
 * Given a last/next income date and frequency, generate all income dates
 * that fall within [startDate, endDate].
 */
function getIncomeDatesInRange(
  nextDate: string,
  frequency: string,
  startDate: string,
  endDate: string
): string[] {
  const dates: string[] = [];
  let current = new Date(nextDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  const start = new Date(startDate + "T12:00:00");

  // Walk backward if nextDate is ahead, to find the first occurrence >= startDate
  // (only needed for frequencies that might skip back)
  // Actually, we just walk forward from nextDate and collect all in range.
  // If nextDate is before startDate, we advance it until it's in range.
  while (current < start) {
    current = advanceByFrequency(current, frequency);
  }

  while (current <= end) {
    dates.push(format(current, "yyyy-MM-dd"));
    current = advanceByFrequency(current, frequency);
  }

  return dates;
}

function advanceByFrequency(date: Date, frequency: string): Date {
  switch (frequency) {
    case "WEEKLY":
      return addDays(date, 7);
    case "BIWEEKLY":
      return addDays(date, 14);
    case "SEMI_MONTHLY": {
      // 1st and 15th pattern: if on 1st, next is 15th; if on 15th, next is 1st of next month
      const day = date.getDate();
      if (day <= 14) {
        return new Date(date.getFullYear(), date.getMonth(), 15, 12, 0, 0);
      } else {
        return new Date(date.getFullYear(), date.getMonth() + 1, 1, 12, 0, 0);
      }
    }
    case "MONTHLY":
      return addMonths(date, 1);
    default:
      // Fallback: monthly
      return addMonths(date, 1);
  }
}

// ---------------------------------------------------------------------------
// projectDailyBalances
// ---------------------------------------------------------------------------

/**
 * Walk forward day-by-day from startDate to endDate, computing a projected
 * balance for each day.
 *
 * Each day:
 * 1. Subtract dailySpendingRateCents (discretionary outflow)
 * 2. Add bill amount_cents on due dates (bills are negative, so this subtracts)
 * 3. Add income amount_cents on pay dates (positive, so this adds)
 */
export function projectDailyBalances(input: ProjectionInput): DailyBalance[] {
  const {
    currentBalanceCents,
    upcomingBills,
    dailySpendingRateCents,
    confirmedIncome,
    startDate,
    endDate,
  } = input;

  // Pre-compute bill amounts by date
  const billsByDate = new Map<string, number>();
  for (const bill of upcomingBills) {
    const key = bill.due_date;
    billsByDate.set(key, (billsByDate.get(key) ?? 0) + bill.amount_cents);
  }

  // Pre-compute income dates
  const incomeByDate = new Map<string, number>();
  if (confirmedIncome) {
    for (const income of confirmedIncome) {
      const dates = getIncomeDatesInRange(
        income.next_date,
        income.frequency,
        startDate,
        endDate
      );
      for (const d of dates) {
        incomeByDate.set(d, (incomeByDate.get(d) ?? 0) + income.amount_cents);
      }
    }
  }

  const results: DailyBalance[] = [];
  let runningBalance = currentBalanceCents;
  const totalDays = differenceInDays(
    new Date(endDate + "T12:00:00"),
    new Date(startDate + "T12:00:00")
  );

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = addDays(new Date(startDate + "T12:00:00"), i);
    const dateKey = format(currentDate, "yyyy-MM-dd");

    // Day 0 (startDate) is the current balance, no spending deducted yet
    if (i > 0) {
      runningBalance -= dailySpendingRateCents;
    }

    // Bills on this date (negative = outflow, adding negative subtracts)
    const billTotal = billsByDate.get(dateKey) ?? 0;
    runningBalance += billTotal;

    // Income on this date (positive = inflow)
    const incomeTotal = incomeByDate.get(dateKey) ?? 0;
    runningBalance += incomeTotal;

    results.push({
      date: dateKey,
      projected_balance_cents: Math.round(runningBalance),
      has_income: incomeTotal > 0,
      bill_total_cents: billTotal,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// computeAvailableMoney
// ---------------------------------------------------------------------------

/**
 * Compute "available until next paycheck" metric.
 *
 * available = currentBalance + sum(bills before payday)
 * Bills are negative, so adding them effectively subtracts the bill amounts.
 *
 * The caller should pre-filter bills to only include those due before
 * the next pay date (or end-of-month if no confirmed income).
 */
export function computeAvailableMoney(
  currentBalanceCents: number,
  billsDueBeforePayday: { amount_cents: number }[]
): number {
  // Sum of all bill amounts (negative values, so sum will be negative)
  const billsTotal = billsDueBeforePayday.reduce(
    (sum, b) => sum + b.amount_cents,
    0
  );

  // available = current balance + bills total (bills are negative)
  return currentBalanceCents + billsTotal;
}

// ---------------------------------------------------------------------------
// computeEndOfMonthBalance
// ---------------------------------------------------------------------------

/**
 * Simple end-of-month balance projection.
 *
 * result = current + expectedIncome + upcomingBills - (dailyRate * daysRemaining)
 *
 * Sign convention:
 * - upcomingBillsCents: negative (sum of bill amounts, which are negative)
 * - expectedIncomeCents: positive
 * - dailySpendingRateCents: positive (deducted as outflow)
 */
export function computeEndOfMonthBalance(
  currentBalanceCents: number,
  dailySpendingRateCents: number,
  daysRemaining: number,
  upcomingBillsCents: number,
  expectedIncomeCents: number
): number {
  return Math.round(
    currentBalanceCents +
    expectedIncomeCents +
    upcomingBillsCents - // negative, so this subtracts
    (dailySpendingRateCents * daysRemaining)
  );
}

// ---------------------------------------------------------------------------
// computeDailySpendingRate
// ---------------------------------------------------------------------------

/**
 * Compute the average daily discretionary spending rate from transactions.
 *
 * Filters transactions with amount_cents < 0 (outflows only),
 * sums absolute values, divides by number of days in the range.
 * Returns positive cents/day.
 */
export function computeDailySpendingRate(
  transactions: { amount_cents: number; transaction_date: string }[],
  startDate: string,
  endDate: string
): number {
  const outflows = transactions.filter((t) => t.amount_cents < 0);

  if (outflows.length === 0) return 0;

  const totalAbsCents = outflows.reduce(
    (sum, t) => sum + Math.abs(t.amount_cents),
    0
  );

  const days = differenceInDays(
    new Date(endDate + "T12:00:00"),
    new Date(startDate + "T12:00:00")
  );

  if (days <= 0) return 0;

  return Math.round(totalAbsCents / days);
}

// ---------------------------------------------------------------------------
// getDangerZoneStatus
// ---------------------------------------------------------------------------

/**
 * Determine the danger zone status based on projected balance and daily spending rate.
 *
 * - danger: projected balance <= 0
 * - tight: projected balance > 0 but less than 2 days of spending
 * - safe: otherwise
 */
export function getDangerZoneStatus(
  projectedBalanceCents: number,
  dailySpendingRateCents: number
): "safe" | "tight" | "danger" {
  if (projectedBalanceCents <= 0) return "danger";
  if (projectedBalanceCents < 2 * dailySpendingRateCents) return "tight";
  return "safe";
}
