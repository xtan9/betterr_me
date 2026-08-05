"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { TimeGrid } from "./time-grid";
import { getWeekDates } from "@/lib/calendar/date-utils";
import { getLocalDateString } from "@/lib/utils";
import type { CalendarDisplayItem } from "@/lib/calendar/display";

interface WeekViewProps {
  currentDate: Date;
  weekStartDay: number;
  displayItems: Map<string, CalendarDisplayItem[]>;
  today: string;
  onTimeSlotClick?: (
    date: Date,
    time: string,
    position: { x: number; y: number },
  ) => void;
  onDragSelect?: (
    date: Date,
    startTime: string,
    endTime: string,
    position: { x: number; y: number },
  ) => void;
  onDisplayItemClick?: (item: CalendarDisplayItem) => void;
}

export function WeekView({
  currentDate,
  weekStartDay,
  displayItems,
  today,
  onTimeSlotClick,
  onDragSelect,
  onDisplayItemClick,
}: WeekViewProps) {
  const locale = useLocale();
  const dates = useMemo(
    () => getWeekDates(currentDate, weekStartDay),
    [currentDate, weekStartDay],
  );

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Day column headers */}
      <div
        className="grid border-b border-border"
        style={{ gridTemplateColumns: `60px repeat(7, 1fr)` }}
      >
        <div /> {/* Time gutter spacer */}
        {dates.map((date) => {
          const dateStr = getLocalDateString(date);
          const isToday = dateStr === today;
          return (
            <div
              key={dateStr}
              className="text-center py-2 border-r border-border last:border-r-0"
            >
              <div className="text-caption text-muted-foreground">
                {dayFormatter.format(date)}
              </div>
              <div
                className={`text-body font-semibold ${
                  isToday
                    ? "bg-primary text-primary-foreground rounded-pill w-7 h-7 flex items-center justify-center mx-auto"
                    : ""
                }`}
              >
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <TimeGrid
        dates={dates}
        displayItems={displayItems}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
        onDragSelect={onDragSelect}
        onDisplayItemClick={onDisplayItemClick}
      />
    </div>
  );
}
