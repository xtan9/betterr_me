"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { getLocalDateString } from "@/lib/utils";
import { MonthDayCell } from "./month-day-cell";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

interface MonthGridProps {
  dates: Date[];
  events: Map<string, ExpandedCalendarEvent[]>;
  currentMonth: number;
  today: string;
  onDayClick: (date: Date) => void;
  weekStartDay: number;
}

export function MonthGrid({
  dates,
  events,
  currentMonth,
  today,
  onDayClick,
  weekStartDay,
}: MonthGridProps) {
  const locale = useLocale();

  // Generate localized day-of-week headers starting from weekStartDay
  const dayHeaders = useMemo(() => {
    const headers: string[] = [];
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    for (let i = 0; i < 7; i++) {
      // Use a known Sunday (Jan 4, 2026 is a Sunday) + offset
      const day = new Date(2026, 0, 4 + ((weekStartDay + i) % 7));
      headers.push(formatter.format(day));
    }
    return headers;
  }, [locale, weekStartDay]);

  return (
    <div className="flex flex-col h-full">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {dayHeaders.map((header, i) => (
          <div
            key={i}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {header}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 flex-1 border-l border-t border-border">
        {dates.map((date) => {
          const dateStr = getLocalDateString(date);
          const dayEvents = events.get(dateStr) || [];
          const isToday = dateStr === today;
          const isOutsideMonth = date.getMonth() !== currentMonth;

          return (
            <MonthDayCell
              key={dateStr}
              date={date}
              events={dayEvents}
              isToday={isToday}
              isOutsideMonth={isOutsideMonth}
              onClick={() => onDayClick(date)}
            />
          );
        })}
      </div>
    </div>
  );
}
