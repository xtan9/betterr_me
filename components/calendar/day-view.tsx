"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { TimeGrid } from "./time-grid";
import { getLocalDateString } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

interface DayViewProps {
  currentDate: Date;
  events: Map<string, ExpandedCalendarEvent[]>;
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
  onEventClick?: (event: ExpandedCalendarEvent) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
}

export function DayView({
  currentDate,
  events,
  today,
  onTimeSlotClick,
  onDragSelect,
  onEventClick,
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
          <div className="text-xs text-muted-foreground">
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
        events={events}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
        onDragSelect={onDragSelect}
        onEventClick={onEventClick}
      />
    </div>
  );
}
