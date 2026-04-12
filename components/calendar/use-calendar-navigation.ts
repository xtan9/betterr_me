"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { getLocalDateString } from "@/lib/utils";

export interface CalendarNavigation {
  view: string;
  dateParam: string;
  year: number;
  month: number;
  currentDate: Date;
  goToToday: () => void;
  goToPrev: () => void;
  goToNext: () => void;
  setView: (newView: string) => void;
  navigateToDate: (date: Date | undefined) => void;
  handleDayClick: (date: Date) => void;
  updateParams: (
    updates: Record<string, string>,
    options?: { replace?: boolean },
  ) => void;
}

export function useCalendarNavigation(
  _weekStartDay: number,
): CalendarNavigation {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL state
  const validViews = ["month", "week", "day"];
  const viewParam = searchParams.get("view");
  const rawView = viewParam || "month";
  const view = validViews.includes(rawView) ? rawView : "month";

  const rawDate = searchParams.get("date") || "";
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dateParam = dateRegex.test(rawDate) ? rawDate : getLocalDateString();

  // Parse the date param into year/month
  const [year, month] = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return [parts[0], parts[1] - 1] as const; // month is 0-indexed
  }, [dateParam]);

  const currentDate = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }, [dateParam]);

  // URL update helper
  const updateParams = useCallback(
    (updates: Record<string, string>, options?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.set(key, value);
      }
      const url = `${pathname}?${params.toString()}`;
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [searchParams, router, pathname],
  );

  const goToToday = useCallback(() => {
    updateParams({ date: getLocalDateString() });
  }, [updateParams]);

  const goToPrev = useCallback(() => {
    if (view === "day") {
      const prev = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() - 1,
      );
      updateParams({ date: getLocalDateString(prev) });
    } else if (view === "week") {
      const prev = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() - 7,
      );
      updateParams({ date: getLocalDateString(prev) });
    } else {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      updateParams({
        date: getLocalDateString(new Date(prevYear, prevMonth, 1)),
      });
    }
  }, [view, currentDate, month, year, updateParams]);

  const goToNext = useCallback(() => {
    if (view === "day") {
      const next = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() + 1,
      );
      updateParams({ date: getLocalDateString(next) });
    } else if (view === "week") {
      const next = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() + 7,
      );
      updateParams({ date: getLocalDateString(next) });
    } else {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      updateParams({
        date: getLocalDateString(new Date(nextYear, nextMonth, 1)),
      });
    }
  }, [view, currentDate, month, year, updateParams]);

  const setView = useCallback(
    (newView: string) => {
      if (newView) {
        updateParams({ view: newView });
      }
    },
    [updateParams],
  );

  const navigateToDate = useCallback(
    (date: Date | undefined) => {
      if (date) {
        updateParams({ date: getLocalDateString(date) });
      }
    },
    [updateParams],
  );

  const handleDayClick = useCallback(
    (date: Date) => {
      updateParams({ view: "day", date: getLocalDateString(date) });
    },
    [updateParams],
  );

  return {
    view,
    dateParam,
    year,
    month,
    currentDate,
    goToToday,
    goToPrev,
    goToNext,
    setView,
    navigateToDate,
    handleDayClick,
    updateParams,
  };
}
