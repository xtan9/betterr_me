import type { WeightUnitPreference } from "@/lib/preferences/types";
import Decimal from "decimal.js";

const LBS_TO_KG = "0.45359237";
const MeasurementDecimal = Decimal.clone({ precision: 160 });

/** Raw load entry is a complete decimal, never a parsed prefix or rounded display. */
export function parseLoadInput(text: string, unit: WeightUnitPreference): number | null {
  if (text.length > 128 || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  if (!/[1-9]/.test(text.split(/[eE]/)[0])) return 0;
  const value = new MeasurementDecimal(text);
  const canonical = unit === "lbs" ? value.mul(LBS_TO_KG) : value;
  const kg = canonical.toNumber();
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

/** A textual representation can exceed Number.MAX_VALUE in pounds without losing its kg anchor. */
export function weightInputText(kg: number | null, unit: WeightUnitPreference): string {
  if (kg === null) return "";
  if (!Number.isFinite(kg)) return "—";
  if (unit === "kg") return String(kg);
  return new MeasurementDecimal(kg).div(LBS_TO_KG).toSignificantDigits(17).toString();
}

/** Numeric presentation for charts; callers handle unrepresentable derived values. */
export function displayWeight(kg: number, unit: WeightUnitPreference): number {
  if (unit === "lbs") return new MeasurementDecimal(kg).div(LBS_TO_KG).toNumber();
  return kg;
}

/** Convert with the exact international pound, rounding only to the final JS number. */
export function toKg(value: number, unit: WeightUnitPreference): number {
  if (unit === "lbs") return new MeasurementDecimal(value).mul(LBS_TO_KG).toNumber();
  return value;
}

/** Format weight with unit suffix for display. */
export function formatWeight(kg: number, unit: WeightUnitPreference): string {
  return Number.isFinite(kg) ? `${weightInputText(kg, unit)} ${unit}` : "—";
}

/** Unrepresentable derived totals remain unavailable; the performed values are intact. */
export function finiteAggregate(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
