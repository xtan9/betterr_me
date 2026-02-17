"use client";

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
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function Heatmap30Day({
  frequency,
  logs,
  onToggleDate,
  isLoading = false,
}: Heatmap30DayProps) {
  const t = useTranslations("habits.heatmap");
  const cells = buildHeatmapData(logs, frequency, 30);

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
      statusClass = "bg-slate-200";
    } else {
      statusClass = "border border-dashed border-slate-300 bg-transparent";
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

  // Organize cells into a grid by week (columns = days of week)
  // We need to figure out which day of week each cell starts on
  const organizeByWeeks = (cells: HeatmapCell[]) => {
    const weeks: (HeatmapCell | null)[][] = [];
    let currentWeek: (HeatmapCell | null)[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const date = new Date(cell.date + "T00:00:00");
      const dayOfWeek = date.getDay(); // 0 = Sunday

      // If this is the first cell, fill in empty slots before it
      if (i === 0) {
        for (let j = 0; j < dayOfWeek; j++) {
          currentWeek.push(null);
        }
      }

      currentWeek.push(cell);

      // If it's Saturday or the last cell, end the week
      if (dayOfWeek === 6 || i === cells.length - 1) {
        // Fill remaining slots if needed
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    return weeks;
  };

  const weeks = organizeByWeeks(cells);

  if (isLoading) {
    return (
      <div data-testid="heatmap-loading" className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t("title")}</h3>
        <div className="animate-pulse">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_KEYS.map((day) => (
              <div key={day} className="h-4 bg-slate-100 rounded" />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((week) => (
            <div key={week} className="grid grid-cols-7 gap-1 mb-1">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <div key={day} className="size-8 bg-slate-100 rounded-md" />
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
        {DAY_KEYS.map((day) => (
          <div key={day} className="text-xs text-muted-foreground">
            {t(`days.${day}`)}
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((cell, dayIndex) =>
              cell ? (
                <Tooltip key={cell.date}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-testid={`cell-${cell.date}`}
                      className={cn("heatmap-cell", getCellClasses(cell))}
                      onClick={() => handleCellClick(cell)}
                      aria-label={getTooltipContent(cell)}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{getTooltipContent(cell)}</TooltipContent>
                </Tooltip>
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
          <div className="size-3 rounded bg-slate-200" />
          <span>{t("legend.missed")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded border border-dashed border-slate-300" />
          <span>{t("legend.notScheduled")}</span>
        </div>
      </div>
    </div>
  );
}
