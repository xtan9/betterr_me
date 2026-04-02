"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";
import {
  getMonthDateRange,
  getMonthGridDates,
  getWeekDateRange,
  getDayDateRange,
  groupEventsByDate,
} from "@/lib/calendar/date-utils";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { CalendarHeader } from "./calendar-header";
import { CalendarSidebar } from "./calendar-sidebar";
import { MonthGrid } from "./month-grid";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { EventQuickCreate } from "./event-quick-create";
import { EventDialog } from "./event-dialog";
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
  const { mutate: globalMutate } = useSWRConfig();

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

  // Fetch user profile for week_start_day
  const {
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useSWR<ProfileResponse>("/api/profile", fetcher);
  const weekStartDay = profileData?.profile?.preferences?.week_start_day ?? 0;

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

  // Default view routing (VIEW-11): detect screen width when no ?view= param
  useEffect(() => {
    if (!viewParam) {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const defaultView = isDesktop ? "week" : "day";
      updateParams({ view: defaultView }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // Compute date range based on current view
  const { startDate, endDate } = useMemo(() => {
    if (view === "week") return getWeekDateRange(currentDate, weekStartDay);
    if (view === "day") return getDayDateRange(currentDate);
    return getMonthDateRange(year, month, weekStartDay);
  }, [view, currentDate, year, month, weekStartDay]);

  // Fetch events for the visible date range
  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
  } = useSWR<EventsResponse>(
    `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    fetcher,
    { keepPreviousData: true },
  );

  // Log SWR fetch errors for debugging
  useEffect(() => {
    if (eventsError) console.error("Failed to fetch calendar events:", eventsError);
    if (profileError) console.error("Failed to fetch user profile:", profileError);
  }, [eventsError, profileError]);

  // Compute grid dates and grouped events
  const gridDates = useMemo(
    () => getMonthGridDates(year, month, weekStartDay),
    [year, month, weekStartDay],
  );

  const eventsByDate = useMemo(
    () => groupEventsByDate(eventsData?.events ?? []),
    [eventsData?.events],
  );

  const today = useMemo(() => getLocalDateString(), []);

  const isLoading = profileLoading || eventsLoading;

  // --- Navigation functions ---

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

  // --- Event creation state ---

  const [quickCreate, setQuickCreate] = useState<{
    isOpen: boolean;
    date: string;
    startTime: string;
    endTime: string;
    anchorPosition: { x: number; y: number };
  } | null>(null);

  const [eventDialog, setEventDialog] = useState<{
    isOpen: boolean;
    event?: ExpandedCalendarEvent | null;
    prefill?: {
      title?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
    };
  } | null>(null);

  const isOverlayOpen = !!(quickCreate?.isOpen || eventDialog?.isOpen);

  // --- Event creation handlers ---

  const handleTimeSlotClick = useCallback(
    (date: Date, time: string, position: { x: number; y: number }) => {
      const [h, m] = time.split(":").map(Number);
      const endMinutes = h * 60 + m + 30;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime: time,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleDragSelect = useCallback(
    (
      date: Date,
      startTime: string,
      endTime: string,
      position: { x: number; y: number },
    ) => {
      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleEventClick = useCallback((event: ExpandedCalendarEvent) => {
    setEventDialog({ isOpen: true, event });
  }, []);

  const handleNewEvent = useCallback(() => {
    setEventDialog({
      isOpen: true,
      event: null,
      prefill: { date: dateParam },
    });
  }, [dateParam]);

  const handleQuickCreateMoreOptions = useCallback(
    (title: string) => {
      if (quickCreate) {
        setQuickCreate(null);
        setEventDialog({
          isOpen: true,
          event: null,
          prefill: {
            title,
            date: quickCreate.date,
            startTime: quickCreate.startTime,
            endTime: quickCreate.endTime,
          },
        });
      }
    },
    [quickCreate],
  );

  const handleEventSaved = useCallback(() => {
    globalMutate(
      `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    );
  }, [startDate, endDate, globalMutate]);

  // --- Keyboard shortcuts ---

  useKeyboardShortcuts({
    onDayView: () => setView("day"),
    onWeekView: () => setView("week"),
    onMonthView: () => setView("month"),
    onToday: goToToday,
    onPrev: goToPrev,
    onNext: goToNext,
    onQuickCreate: () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;
      handleTimeSlotClick(currentDate, time, {
        x: window.innerWidth / 2,
        y: window.innerHeight / 3,
      });
    },
    onNewEvent: handleNewEvent,
    onSearch: () => {},
    onEscape: () => {
      if (quickCreate?.isOpen) setQuickCreate(null);
      else if (eventDialog?.isOpen) setEventDialog(null);
    },
    isOverlayOpen,
  });

  return (
    <>
      <div className="flex h-full gap-0">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border p-4 overflow-y-auto">
          <CalendarSidebar
            currentDate={currentDate}
            onDateSelect={navigateToDate}
            weekStartDay={weekStartDay}
            onNewEvent={handleNewEvent}
          />
        </aside>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <CalendarHeader
            currentDate={currentDate}
            view={view}
            weekStartDay={weekStartDay}
            onPrev={goToPrev}
            onNext={goToNext}
            onToday={goToToday}
            onViewChange={setView}
          />

          <div className="flex-1 overflow-auto p-4">
            {eventsError || profileError ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-destructive">
                <span>{t("error")}</span>
              </div>
            ) : isLoading && !eventsData ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="animate-pulse">{t("title")}...</div>
              </div>
            ) : view === "month" ? (
              <MonthGrid
                dates={gridDates}
                events={eventsByDate}
                currentMonth={month}
                today={today}
                onDayClick={handleDayClick}
                weekStartDay={weekStartDay}
              />
            ) : view === "week" ? (
              <WeekView
                currentDate={currentDate}
                weekStartDay={weekStartDay}
                events={eventsByDate}
                today={today}
                onTimeSlotClick={handleTimeSlotClick}
                onDragSelect={handleDragSelect}
                onEventClick={handleEventClick}
              />
            ) : (
              <DayView
                currentDate={currentDate}
                events={eventsByDate}
                today={today}
                onTimeSlotClick={handleTimeSlotClick}
                onDragSelect={handleDragSelect}
                onEventClick={handleEventClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* Quick-create popover */}
      {quickCreate?.isOpen && (
        <EventQuickCreate
          isOpen={quickCreate.isOpen}
          onClose={() => setQuickCreate(null)}
          date={quickCreate.date}
          startTime={quickCreate.startTime}
          endTime={quickCreate.endTime}
          onMoreOptions={handleQuickCreateMoreOptions}
          onSaved={handleEventSaved}
          anchorPosition={quickCreate.anchorPosition}
        />
      )}

      {/* Full event dialog */}
      {eventDialog?.isOpen && (
        <EventDialog
          isOpen={eventDialog.isOpen}
          onClose={() => setEventDialog(null)}
          event={eventDialog.event}
          prefill={eventDialog.prefill}
          onSaved={handleEventSaved}
        />
      )}
    </>
  );
}
