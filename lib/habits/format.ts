import type { HabitFrequency } from "@/lib/db/types";

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

// Locale-independent frequency formatting for CSV export
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
