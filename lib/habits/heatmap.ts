import { format, subDays, isSameDay } from "date-fns";
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
    const isEditable = true;

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

export function buildMonthHeatmapData(
  logs: HabitLog[],
  frequency: HabitFrequency,
  year: number,
  month: number // 0-indexed (0 = January)
): HeatmapCell[] {
  const today = new Date();
  const cells: HeatmapCell[] = [];

  const logMap = new Map<string, HabitLog>();
  for (const log of logs) {
    logMap.set(log.logged_date, log);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = format(date, "yyyy-MM-dd");
    const log = logMap.get(dateStr);
    const isScheduled = shouldTrackOnDate(frequency, date);
    const isToday = isSameDay(date, today);

    const isFuture = !isSameDay(date, today) && date.getTime() > today.getTime();

    let status: HeatmapCellStatus;
    if (!isScheduled) {
      status = "not_scheduled";
    } else if (log?.completed) {
      status = "completed";
    } else if (isFuture) {
      status = "not_scheduled";
    } else {
      status = "missed";
    }

    cells.push({
      date: dateStr,
      status,
      isToday,
      isEditable: true,
    });
  }

  return cells;
}
