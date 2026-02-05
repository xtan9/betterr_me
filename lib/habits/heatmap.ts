import { format, subDays, isSameDay, differenceInDays } from "date-fns";
import type { HabitFrequency, HabitLog } from "@/lib/db/types";
import { shouldTrackOnDate } from "./format";

export type HeatmapCellStatus = "completed" | "missed" | "not_scheduled";

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  status: HeatmapCellStatus;
  isToday: boolean;
  isEditable: boolean;
}

export function buildHeatmapData(
  logs: HabitLog[],
  frequency: HabitFrequency,
  days: number = 30
): HeatmapCell[] {
  const today = new Date();
  const cells: HeatmapCell[] = [];

  // Build a map for quick log lookup
  const logMap = new Map<string, HabitLog>();
  for (const log of logs) {
    logMap.set(log.logged_date, log);
  }

  // Generate cells from oldest to newest
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(today, i);
    const dateStr = format(date, "yyyy-MM-dd");
    const log = logMap.get(dateStr);
    const isScheduled = shouldTrackOnDate(frequency, date);
    const isToday = isSameDay(date, today);
    const daysDiff = differenceInDays(today, date);
    const isEditable = daysDiff <= 7;

    let status: HeatmapCellStatus;
    if (!isScheduled) {
      status = "not_scheduled";
    } else if (log?.completed) {
      status = "completed";
    } else {
      status = "missed";
    }

    cells.push({
      date: dateStr,
      status,
      isToday,
      isEditable,
    });
  }

  return cells;
}
