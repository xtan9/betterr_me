"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EventChip } from "./event-chip";
import type { CalendarDisplayItem } from "@/lib/calendar/overlay-adapter";
import { getLocalDateString } from "@/lib/utils";

interface AllDayRowProps {
  /** Array of dates (columns) in the grid */
  dates: Date[];
  /** Map of date string -> events for that date */
  events: Map<string, CalendarDisplayItem[]>;
  /** Callback when an event is clicked */
  onEventClick?: (event: CalendarDisplayItem) => void;
}

const MAX_VISIBLE = 3;

export function AllDayRow({ dates, events, onEventClick }: AllDayRowProps) {
  const t = useTranslations("calendar");
  const [expanded, setExpanded] = useState(false);

  // Filter all-day events for each date
  const allDayByDate = dates.map((date) => {
    const dateStr = getLocalDateString(date);
    const dayEvents = events.get(dateStr) || [];
    return dayEvents.filter((e) => e.start_time === null);
  });

  // Check if any column has overflow
  const hasOverflow = allDayByDate.some((items) => items.length > MAX_VISIBLE);

  // If no all-day events at all, don't render the row
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
        {allDayByDate.map((dayAllDayEvents, colIdx) => {
          const visible = expanded
            ? dayAllDayEvents
            : dayAllDayEvents.slice(0, MAX_VISIBLE);
          const remaining = dayAllDayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={colIdx}
              className="px-1 py-1 space-y-0.5 border-r border-border last:border-r-0 min-h-[28px]"
            >
              {visible.map((event) => (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEventClick?.(event)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onEventClick?.(event);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <EventChip event={event} />
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
