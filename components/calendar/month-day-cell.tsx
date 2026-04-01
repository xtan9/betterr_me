"use client";

import { useTranslations } from "next-intl";
import { EventChip } from "./event-chip";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

const MAX_VISIBLE_EVENTS = 3;

interface MonthDayCellProps {
  date: Date;
  events: ExpandedCalendarEvent[];
  isToday: boolean;
  isOutsideMonth: boolean;
  onClick: () => void;
}

export function MonthDayCell({
  date,
  events,
  isToday,
  isOutsideMonth,
  onClick,
}: MonthDayCellProps) {
  const t = useTranslations("calendar");
  const dayNumber = date.getDate();
  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflowCount = events.length - MAX_VISIBLE_EVENTS;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`
        min-h-[100px] sm:min-h-[60px] md:min-h-[100px]
        border-r border-b border-border
        p-1 cursor-pointer overflow-hidden
        hover:bg-accent/50 transition-colors
        ${isOutsideMonth ? "bg-muted/30" : ""}
      `}
    >
      {/* Date number */}
      <div className="flex justify-start mb-0.5">
        <span
          className={`
            text-xs font-medium inline-flex items-center justify-center
            ${
              isToday
                ? "bg-primary text-primary-foreground rounded-full w-6 h-6"
                : isOutsideMonth
                  ? "text-muted-foreground"
                  : "text-foreground"
            }
          `}
        >
          {dayNumber}
        </span>
      </div>

      {/* Event chips */}
      <div className="space-y-0.5">
        {visibleEvents.map((event) => (
          <EventChip key={event.id} event={event} />
        ))}
      </div>

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <div className="text-xs text-muted-foreground mt-0.5 px-1">
          {t("overflow.more", { count: overflowCount })}
        </div>
      )}
    </div>
  );
}
