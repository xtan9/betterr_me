"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getWeekDates } from "@/lib/calendar/date-utils";

interface CalendarHeaderProps {
  currentDate: Date;
  view: string;
  weekStartDay: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: string) => void;
}

export function CalendarHeader({
  currentDate,
  view,
  weekStartDay,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: CalendarHeaderProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();

  const title = useMemo(() => {
    if (view === "week") {
      const weekDates = getWeekDates(currentDate, weekStartDay);
      const startFmt = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }).format(weekDates[0]);
      const endDate = weekDates[6];
      const endFmt = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }).format(endDate);
      const yearFmt = endDate.getFullYear();
      return `${startFmt} \u2013 ${endFmt}, ${yearFmt}`;
    }
    if (view === "day") {
      return new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(currentDate);
    }
    // Month view
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    }).format(currentDate);
  }, [view, currentDate, locale, weekStartDay]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      {/* Left: Today button */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          {t("navigation.today")}
        </Button>
      </div>

      {/* Center: prev/next arrows + title */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          aria-label={t("navigation.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[160px] text-center">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          aria-label={t("navigation.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: View toggle */}
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={onViewChange}
        className="rounded-lg"
      >
        <ToggleGroupItem value="day" className="rounded-l-lg text-xs px-3">
          {t("views.day")}
        </ToggleGroupItem>
        <ToggleGroupItem value="week" className="text-xs px-3">
          {t("views.week")}
        </ToggleGroupItem>
        <ToggleGroupItem value="month" className="rounded-r-lg text-xs px-3">
          {t("views.month")}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
