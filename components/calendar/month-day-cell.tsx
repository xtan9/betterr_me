"use client";

import { useTranslations } from "next-intl";
import { EventChip } from "./event-chip";
import type { CalendarDisplayItem } from "@/lib/calendar/display";

const MAX_VISIBLE_ITEMS = 3;

interface MonthDayCellProps {
  date: Date;
  displayItems: CalendarDisplayItem[];
  isToday: boolean;
  isOutsideMonth: boolean;
  onClick: () => void;
}

export function MonthDayCell({
  date,
  displayItems,
  isToday,
  isOutsideMonth,
  onClick,
}: MonthDayCellProps) {
  const t = useTranslations("calendar");
  const dayNumber = date.getDate();
  const visibleDisplayItems = displayItems.slice(0, MAX_VISIBLE_ITEMS);
  const overflowCount = displayItems.length - MAX_VISIBLE_ITEMS;

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
            text-caption font-medium inline-flex items-center justify-center
            ${
              isToday
                ? "bg-primary text-primary-foreground rounded-pill w-6 h-6"
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
        {visibleDisplayItems.map((item) => (
          <EventChip key={item.id} item={item} />
        ))}
      </div>

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <div className="text-caption text-muted-foreground mt-0.5 px-1">
          {t("overflow.more", { count: overflowCount })}
        </div>
      )}
    </div>
  );
}
