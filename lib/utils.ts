import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the current date as YYYY-MM-DD in the browser's local timezone.
 *
 * Unlike `new Date().toISOString().split("T")[0]` which returns the UTC date,
 * this uses local-timezone-aware methods so the date matches the user's wall clock.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the next day's date as YYYY-MM-DD given a YYYY-MM-DD string.
 *
 * Correctly handles month/year rollovers (e.g., Feb 28 → Mar 1, Dec 31 → Jan 1).
 */
export function getNextDateString(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);
  return getLocalDateString(next);
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
