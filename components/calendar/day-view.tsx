"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { TimeGrid } from "./time-grid";
import { getLocalDateString } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";
import type { CalendarDisplayItem } from "@/lib/calendar/display";

interface DayViewProps {
  currentDate: Date;
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
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
}

export function DayView({
  currentDate,
  displayItems,
  today,
  onTimeSlotClick,
  onDragSelect,
  onDisplayItemClick,
  onNavigateNext,
  onNavigatePrev,
}: DayViewProps) {
  const locale = useLocale();
  const dates = useMemo(() => [currentDate], [currentDate]);

  const swipeHandlers = useSwipe(
    () => onNavigateNext?.(),
    () => onNavigatePrev?.(),
  );

  const dateStr = getLocalDateString(currentDate);
  const isToday = dateStr === today;

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long" }),
    [locale],
  );

  return (
    <div className="flex flex-col h-full" {...swipeHandlers}>
      {/* Day header */}
      <div
        className="grid border-b border-border"
        style={{ gridTemplateColumns: `60px 1fr` }}
      >
        <div /> {/* Time gutter spacer */}
        <div className="text-center py-2">
          <div className="text-caption text-muted-foreground">
            {dayFormatter.format(currentDate)}
          </div>
          <div
            className={`text-body font-semibold ${
              isToday
                ? "bg-primary text-primary-foreground rounded-pill w-7 h-7 flex items-center justify-center mx-auto"
                : ""
            }`}
          >
            {currentDate.getDate()}
          </div>
        </div>
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
