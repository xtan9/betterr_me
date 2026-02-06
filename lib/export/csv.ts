import type { Habit, HabitLog, HabitFrequency } from "@/lib/db/types";

/**
 * Escape a value for CSV format
 * - Wraps in quotes if contains comma, newline, or quote
 * - Escapes quotes by doubling them
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  // Check if value needs to be quoted
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of objects to CSV string
 */
function arrayToCSV<T extends object>(
  data: T[],
  columns: { key: keyof T | string; header: string; transform?: (row: T) => string }[]
): string {
  // Header row
  const headers = columns.map((col) => escapeCSVValue(col.header)).join(",");

  // Data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        if (col.transform) {
          return escapeCSVValue(col.transform(row));
        }
        const key = col.key as keyof T;
        const value = key in row ? row[key] : "";
        return escapeCSVValue(value);
      })
      .join(",")
  );

  return [headers, ...rows].join("\n");
}

/**
 * Format frequency for CSV export
 */
function formatFrequency(frequency: HabitFrequency): string {
  switch (frequency.type) {
    case "daily":
      return "daily";
    case "weekdays":
      return "weekdays";
    case "weekly":
      return "weekly";
    case "times_per_week":
      return `${frequency.count}x/week`;
    case "custom":
      return `custom:${frequency.days.join(";")}`;
    default:
      return "unknown";
  }
}

/**
 * Export habits to CSV format
 */
export function exportHabitsToCSV(habits: Habit[]): string {
  return arrayToCSV(habits, [
    { key: "id", header: "id" },
    { key: "name", header: "name" },
    { key: "description", header: "description" },
    { key: "category", header: "category" },
    {
      key: "frequency",
      header: "frequency_type",
      transform: (h) => h.frequency.type,
    },
    {
      key: "frequency",
      header: "frequency_details",
      transform: (h) => formatFrequency(h.frequency),
    },
    { key: "status", header: "status" },
    { key: "current_streak", header: "current_streak" },
    { key: "best_streak", header: "best_streak" },
    { key: "created_at", header: "created_at" },
  ]);
}

export interface HabitLogWithName extends HabitLog {
  habit_name?: string;
}

/**
 * Export habit logs to CSV format
 */
export function exportLogsToCSV(logs: HabitLogWithName[]): string {
  return arrayToCSV(logs, [
    { key: "habit_id", header: "habit_id" },
    { key: "habit_name", header: "habit_name" },
    { key: "logged_date", header: "logged_date" },
    { key: "completed", header: "completed" },
  ]);
}

/**
 * Trigger a file download in the browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename with current date
 */
export function generateExportFilename(type: "habits" | "logs" | "zip"): string {
  const date = new Date().toISOString().split("T")[0];
  if (type === "zip") {
    return `betterrme-export-${date}.zip`;
  }
  return `betterrme-${type}-${date}.csv`;
}
