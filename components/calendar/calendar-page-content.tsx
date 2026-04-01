"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";
import { getMonthDateRange, getMonthGridDates, groupEventsByDate, getDateString } from "@/lib/calendar/date-utils";
import { CalendarHeader } from "./calendar-header";
import { CalendarSidebar } from "./calendar-sidebar";
import { MonthGrid } from "./month-grid";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

interface ProfileResponse {
  profile: {
    preferences?: {
      week_start_day?: number;
    };
  };
}

interface EventsResponse {
  events: ExpandedCalendarEvent[];
}

export function CalendarPageContent() {
  const t = useTranslations("calendar");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL state
  const view = searchParams.get("view") || "month";
  const dateParam = searchParams.get("date") || getLocalDateString();

  // Parse the date param into year/month
  const [year, month] = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return [parts[0], parts[1] - 1] as const; // month is 0-indexed
  }, [dateParam]);

  const currentDate = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }, [dateParam]);

  // Fetch user profile for week_start_day
  const { data: profileData } = useSWR<ProfileResponse>("/api/profile", fetcher);
  const weekStartDay = profileData?.profile?.preferences?.week_start_day ?? 0;

  // Compute date range for the month grid
  const { startDate, endDate } = useMemo(
    () => getMonthDateRange(year, month, weekStartDay),
    [year, month, weekStartDay],
  );

  // Fetch events for the visible date range
  const { data: eventsData } = useSWR<EventsResponse>(
    `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    fetcher,
    { keepPreviousData: true },
  );

  const events = eventsData?.events ?? [];

  // Compute grid dates and grouped events
  const gridDates = useMemo(
    () => getMonthGridDates(year, month, weekStartDay),
    [year, month, weekStartDay],
  );

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  const today = getLocalDateString();

  // URL update helper
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  // Navigation functions
  const goToToday = useCallback(() => {
    updateParams({ date: getLocalDateString() });
  }, [updateParams]);

  const goToPrevMonth = useCallback(() => {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const newDate = getDateString(new Date(prevYear, prevMonth, 1));
    updateParams({ date: newDate });
  }, [month, year, updateParams]);

  const goToNextMonth = useCallback(() => {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const newDate = getDateString(new Date(nextYear, nextMonth, 1));
    updateParams({ date: newDate });
  }, [month, year, updateParams]);

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
        updateParams({ date: getDateString(date) });
      }
    },
    [updateParams],
  );

  const handleDayClick = useCallback(
    (date: Date) => {
      updateParams({ view: "day", date: getDateString(date) });
    },
    [updateParams],
  );

  return (
    <div className="flex h-full gap-0">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-border p-4 overflow-y-auto">
        <CalendarSidebar
          currentDate={currentDate}
          onDateSelect={navigateToDate}
          weekStartDay={weekStartDay}
        />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <CalendarHeader
          currentDate={currentDate}
          view={view}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onToday={goToToday}
          onViewChange={setView}
        />

        <div className="flex-1 overflow-auto p-4">
          {view === "month" ? (
            <MonthGrid
              dates={gridDates}
              events={eventsByDate}
              currentMonth={month}
              today={today}
              onDayClick={handleDayClick}
              weekStartDay={weekStartDay}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              {t("comingSoon")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
