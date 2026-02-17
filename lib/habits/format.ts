import { Heart, Brain, BookOpen, Zap, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HabitCategory, HabitFrequency } from "@/lib/db/types";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Returns a translation key and optional params for frequency formatting
export type FrequencyTranslation = {
  key: string;
  params?: Record<string, string | number>;
};

export function getFrequencyTranslation(freq: HabitFrequency): FrequencyTranslation {
  switch (freq.type) {
    case "daily":
      return { key: "frequency.daily" };
    case "weekdays":
      return { key: "frequency.weekdays" };
    case "weekly":
      return { key: "frequency.weekly" };
    case "times_per_week":
      return { key: "frequency.timesPerWeek", params: { count: freq.count } };
    case "custom":
      // For custom days, we need to pass the formatted days string
      const dayKeys = [...freq.days].sort((a, b) => a - b).map((d) => DAY_KEYS[d]);
      return { key: "frequency.custom", params: { days: dayKeys.join(", ") } };
  }
}

// Legacy function for backwards compatibility - returns English strings
export function formatFrequency(freq: HabitFrequency): string {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (freq.type) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Mon – Fri";
    case "weekly":
      return "Once a week";
    case "times_per_week":
      return `${freq.count}x/week`;
    case "custom":
      return [...freq.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
  }
}

export function getCategoryColor(category: HabitCategory | null): string {
  switch (category) {
    case "health":
      return "text-rose-500 bg-rose-50";
    case "wellness":
      return "text-purple-500 bg-purple-50";
    case "learning":
      return "text-blue-500 bg-blue-50";
    case "productivity":
      return "text-amber-500 bg-amber-50";
    case "other":
    default:
      return "text-slate-500 bg-slate-50";
  }
}

export function getCategoryIcon(category: HabitCategory | null): LucideIcon {
  switch (category) {
    case "health":
      return Heart;
    case "wellness":
      return Brain;
    case "learning":
      return BookOpen;
    case "productivity":
      return Zap;
    case "other":
    default:
      return MoreHorizontal;
  }
}

export function shouldTrackOnDate(frequency: HabitFrequency, date: Date): boolean {
  const dayOfWeek = date.getDay();
  switch (frequency.type) {
    case "daily":
      return true;
    case "weekdays":
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case "weekly":
      return true;
    case "times_per_week":
      return true;
    case "custom":
      return frequency.days.includes(dayOfWeek);
  }
}
