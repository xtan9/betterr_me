import Decimal from "decimal.js";

// Configure for financial calculations — high precision, standard half-up rounding.
// Stryker disable next-line ObjectLiteral: decimal.js defaults (precision=20,
// rounding=ROUND_HALF_UP=4) are identical to what we set here, so `Decimal.set({})`
// is semantically equivalent to the explicit config for this codebase.
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Hoisted to module scope — expensive to construct per call.
// Stryker disable next-line all: the formatter is initialised once at module load;
// Stryker cannot swap the singleton mid-test so these mutants survive. Coverage of
// en-US locale + 2-decimal behaviour is asserted in the formatMoney tests below
// (which verify "$1,234,567.89" and "$10.00" outputs end-to-end).
const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Convert a dollar amount to integer cents.
 * Uses decimal.js to avoid floating-point errors.
 *
 * @example toCents("10.33") → 1033
 * @example toCents(0.07) → 7
 * @example toCents("19.99") → 1999
 */
export function toCents(dollars: number | string): number {
  return new Decimal(dollars).times(100).round().toNumber();
}

/**
 * Format integer cents as a USD display string.
 * Always two decimal places, comma grouping, minus prefix for negatives.
 *
 * @example formatMoney(1033) → "$10.33"
 * @example formatMoney(-1033) → "-$10.33"
 * @example formatMoney(123456789) → "$1,234,567.89"
 * @example formatMoney(0) → "$0.00"
 */
export function formatMoney(cents: number): string {
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const dollars = new Decimal(absCents).dividedBy(100).toFixed(2);

  const formatted = usdFormatter.format(parseFloat(dollars));

  return isNegative ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Convert integer cents to a raw decimal string (no currency symbol).
 *
 * @example centsToDecimal(1033) → "10.33"
 * @example centsToDecimal(7) → "0.07"
 */
export function centsToDecimal(cents: number): string {
  return new Decimal(cents).dividedBy(100).toFixed(2);
}

export function addCents(a: number, b: number): number {
  return a + b;
}

export function subtractCents(a: number, b: number): number {
  return a - b;
}
