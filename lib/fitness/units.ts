import type { WeightUnit } from "@/lib/db/types";

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

/** Convert kg to display unit. Rounds to 2 decimal places. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  if (unit === "lbs") return Math.round(kg * KG_TO_LBS * 100) / 100;
  return kg;
}

/** Convert user input to kg for storage. Rounds to 2 decimal places. */
export function toKg(value: number, unit: WeightUnit): number {
  if (unit === "lbs") return Math.round(value * LBS_TO_KG * 100) / 100;
  return value;
}

/** Format weight with unit suffix for display. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const display = displayWeight(kg, unit);
  return `${display} ${unit}`;
}
