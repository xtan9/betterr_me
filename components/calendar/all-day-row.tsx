"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EventChip } from "./event-chip";
import type { CalendarDisplayItem } from "@/lib/calendar/display";
import { getLocalDateString } from "@/lib/utils";

interface AllDayRowProps {
  /** Array of dates (columns) in the grid */
  dates: Date[];
  /** Map of date string -> display items for that date */
  displayItems: Map<string, CalendarDisplayItem[]>;
  /** Callback when a display item is clicked */
  onDisplayItemClick?: (item: CalendarDisplayItem) => void;
}

const MAX_VISIBLE = 3;

export function AllDayRow({ dates, displayItems, onDisplayItemClick }: AllDayRowProps) {
  const t = useTranslations("calendar");
  const [expanded, setExpanded] = useState(false);

  // Filter all-day display items for each date
  const allDayByDate = dates.map((date) => {
    const dateStr = getLocalDateString(date);
    const dayItems = displayItems.get(dateStr) || [];
    return dayItems.filter((item) => item.start_time === null);
  });

  // Check if any column has overflow
  const hasOverflow = allDayByDate.some((items) => items.length > MAX_VISIBLE);

  // If no all-day display items exist, don't render the row
  if (allDayByDate.every((items) => items.length === 0)) {
    return null;
  }

  return (
    <div className="border-b border-border bg-background sticky top-0 z-20">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `60px repeat(${dates.length}, 1fr)`,
        }}
      >
        {/* Time gutter label */}
        <div className="flex items-start justify-end pr-2 pt-1 text-caption text-muted-foreground border-r border-border">
          {t("timeGrid.allDay")}
        </div>

        {/* Day columns */}
        {allDayByDate.map((dayAllDayItems, colIdx) => {
          const visible = expanded
            ? dayAllDayItems
            : dayAllDayItems.slice(0, MAX_VISIBLE);
          const remaining = dayAllDayItems.length - MAX_VISIBLE;

          return (
            <div
              key={colIdx}
              className="px-1 py-1 space-y-0.5 border-r border-border last:border-r-0 min-h-[28px]"
            >
              {visible.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onDisplayItemClick?.(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onDisplayItemClick?.(item);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <EventChip item={item} />
                </div>
              ))}
              {!expanded && remaining > 0 && (
                <button
                  type="button"
                  className="text-caption text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setExpanded(true)}
                >
                  {t("timeGrid.allDayMore", { count: remaining })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapse button when expanded */}
      {expanded && hasOverflow && (
        <button
          type="button"
          className="w-full text-caption text-muted-foreground hover:text-foreground py-0.5 text-center cursor-pointer"
          onClick={() => setExpanded(false)}
        >
          {t("timeGrid.collapseAllDay")}
        </button>
      )}
    </div>
  );
}
