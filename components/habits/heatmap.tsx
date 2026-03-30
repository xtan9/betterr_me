"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { buildHeatmapData, type HeatmapCell } from "@/lib/habits/heatmap";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HabitFrequency, HabitLog } from "@/lib/db/types";

interface Heatmap30DayProps {
  habitId: string;
  frequency: HabitFrequency;
  logs: HabitLog[];
  onToggleDate: (date: string) => Promise<void>;
  isLoading?: boolean;
  weekStartDay?: number; // 0 = Sunday, 1 = Monday
}

const ALL_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getDayKeys(weekStartDay: number) {
  return [...ALL_DAY_KEYS.slice(weekStartDay), ...ALL_DAY_KEYS.slice(0, weekStartDay)];
}

function organizeByWeeks(cells: HeatmapCell[], weekStartDay: number) {
  const weeks: (HeatmapCell | null)[][] = [];
  let currentWeek: (HeatmapCell | null)[] = [];
  const weekEndDay = (weekStartDay + 6) % 7;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const date = new Date(cell.date + "T00:00:00");
    const dayOfWeek = date.getDay(); // 0 = Sunday

    // If this is the first cell, fill in empty slots before it
    if (i === 0) {
      const offset = (dayOfWeek - weekStartDay + 7) % 7;
      for (let j = 0; j < offset; j++) {
        currentWeek.push(null);
      }
    }

    currentWeek.push(cell);

    // If it's the last day of the week or the last cell, end the week
    if (dayOfWeek === weekEndDay || i === cells.length - 1) {
      // Fill remaining slots if needed
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}

export const Heatmap30Day = memo(function Heatmap30Day({
  frequency,
  logs,
  onToggleDate,
  isLoading = false,
  weekStartDay = 0,
}: Heatmap30DayProps) {
  const t = useTranslations("habits.heatmap");
  const cells = useMemo(() => buildHeatmapData(logs, frequency, 30), [logs, frequency]);
  const weeks = useMemo(() => organizeByWeeks(cells, weekStartDay), [cells, weekStartDay]);
  const dayKeys = useMemo(() => getDayKeys(weekStartDay), [weekStartDay]);

  const handleCellClick = (cell: HeatmapCell) => {
    if (isLoading) return;
    if (cell.status === "not_scheduled") return;
    if (!cell.isEditable) return;
    onToggleDate(cell.date);
  };

  const getCellClasses = (cell: HeatmapCell) => {
    const base = "size-8 md:size-8 rounded-md transition-colors";

    // Status colors
    let statusClass = "";
    if (cell.status === "completed") {
      statusClass = "bg-primary";
    } else if (cell.status === "missed") {
      statusClass = "bg-muted";
    } else {
      statusClass = "border border-dashed border-border bg-transparent";
    }

    // Today highlight
    const todayClass = cell.isToday ? "ring-2 ring-primary ring-offset-1" : "";

    // Cursor style
    let cursorClass = "";
    if (cell.status === "not_scheduled") {
      cursorClass = "cursor-default";
    } else if (!cell.isEditable) {
      cursorClass = "cursor-not-allowed";
    } else {
      cursorClass = "cursor-pointer hover:opacity-80";
    }

    return cn(base, statusClass, todayClass, cursorClass);
  };

  const getTooltipContent = (cell: HeatmapCell) => {
    const dateFormatted = new Date(cell.date + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    let statusText = "";
    if (cell.status === "completed") {
      statusText = t("completed");
    } else if (cell.status === "missed") {
      statusText = t("missed");
    } else {
      statusText = t("notScheduled");
    }

    const parts = [dateFormatted];
    if (cell.isToday) {
      parts.push(`(${t("today")})`);
    }
    parts.push("—", statusText);

    if (cell.status !== "not_scheduled") {
      if (cell.isEditable) {
        parts.push(`· ${t("clickToToggle")}`);
      } else {
        parts.push(`· ${t("cannotEdit")}`);
      }
    }

    return parts.join(" ");
  };

  if (isLoading) {
    return (
      <div data-testid="heatmap-loading" className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t("title")}</h3>
        <div className="animate-pulse">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayKeys.map((day) => (
              <div key={day} className="h-4 bg-muted rounded" />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((week) => (
            <div key={week} className="grid grid-cols-7 gap-1 mb-1">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <div key={day} className="size-8 bg-muted rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{t("title")}</h3>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {dayKeys.map((day) => (
          <div key={day} className="text-xs text-muted-foreground">
            {t(`days.${day}`)}
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div data-testid="heatmap-grid" className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((cell, dayIndex) =>
              cell ? (
                <div key={cell.date}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-testid={`cell-${cell.date}`}
                        className={cn("heatmap-cell", getCellClasses(cell), "flex items-center justify-center")}
                        onClick={() => handleCellClick(cell)}
                        aria-label={getTooltipContent(cell)}
                      >
                        <span className={cn(
                          "text-[10px] font-medium",
                          cell.status === "completed"
                            ? "text-primary-foreground/70"
                            : cell.status === "not_scheduled"
                              ? "text-muted-foreground/40"
                              : "text-foreground/50"
                        )}>
                          {new Date(cell.date + "T00:00:00").getDate()}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{getTooltipContent(cell)}</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <div key={`empty-${weekIndex}-${dayIndex}`} className="size-8" />
              )
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div data-testid="legend" className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded bg-primary" />
          <span>{t("legend.completed")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded bg-muted" />
          <span>{t("legend.missed")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded border border-dashed border-border" />
          <span>{t("legend.notScheduled")}</span>
        </div>
      </div>
    </div>
  );
});
