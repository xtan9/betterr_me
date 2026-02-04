import { Heart, Brain, BookOpen, Zap, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HabitCategory, HabitFrequency } from "@/lib/db/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatFrequency(freq: HabitFrequency): string {
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
      return dayOfWeek === 1;
    case "times_per_week":
      return true;
    case "custom":
      return frequency.days.includes(dayOfWeek);
  }
}
