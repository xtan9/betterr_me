"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { useCalendarActions } from "@/hooks/use-calendar-actions";
import { useCalendarNavigation } from "./use-calendar-navigation";
import { useCalendarEvents } from "./use-calendar-events";
import { CalendarHeader } from "./calendar-header";
import { CalendarSidebar } from "./calendar-sidebar";
import { MonthGrid } from "./month-grid";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { EventQuickCreate } from "./event-quick-create";
import { EventDialog } from "./event-dialog";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarFeedItem } from "@/lib/calendar/feed-types";
import { feedItemsToExpandedEvents } from "@/lib/calendar/feed-aggregation";
import type { DomainCalendarEvent } from "@/lib/calendar/feed-types";

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

interface FeedResponse {
  items: CalendarFeedItem[];
}

export function CalendarPageContent() {
  const t = useTranslations("calendar");
  const searchParams = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();

  // Fetch user profile for week_start_day
  const {
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useSWR<ProfileResponse>("/api/profile", fetcher);
  const weekStartDay = profileData?.profile?.preferences?.week_start_day ?? 0;

  // Navigation hook
  const {
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
  } = useCalendarNavigation();

  // Default view routing (VIEW-11): detect screen width when no ?view= param
  const viewParam = searchParams.get("view");
  useEffect(() => {
    if (!viewParam) {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const defaultView = isDesktop ? "week" : "day";
      updateParams({ view: defaultView }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // --- Layer state (lifted from sidebar) ---
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(
    new Set(["events", "tasks", "habits", "workouts"]),
  );

  const toggleLayer = useCallback((key: string) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Compute date range based on current view
  const { startDate, endDate } = useMemo(() => {
    if (view === "week") return getWeekDateRange(currentDate, weekStartDay);
    if (view === "day") return getDayDateRange(currentDate);
    return getMonthDateRange(year, month, weekStartDay);
  }, [view, currentDate, year, month, weekStartDay]);

  // --- Data fetching ---

  // Always fetch calendar events (primary data source)
  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
  } = useSWR<EventsResponse>(
    `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    fetcher,
    { keepPreviousData: true },
  );

  // Compute which non-event layers are enabled
  const nonEventLayers = useMemo(() => {
    const layers = Array.from(enabledLayers).filter((l) => l !== "events");
    return layers.sort().join(",");
  }, [enabledLayers]);

  // Detect user timezone for workout time conversion
  const userTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  // Fetch feed items for enabled non-event layers
  const feedKey = nonEventLayers
    ? `/api/calendar/feed?start_date=${startDate}&end_date=${endDate}&layers=${nonEventLayers}&timezone=${encodeURIComponent(userTimezone)}`
    : null;

  const {
    data: feedData,
    error: feedError,
  } = useSWR<FeedResponse>(feedKey, fetcher, { keepPreviousData: true });

  // Log SWR fetch errors for debugging
  useEffect(() => {
    if (eventsError) console.error("Failed to fetch calendar events:", eventsError);
    if (profileError) console.error("Failed to fetch user profile:", profileError);
    if (feedError) console.error("Failed to fetch calendar feed:", feedError);
  }, [eventsError, profileError, feedError]);

  // --- Inline actions ---

  const handleFeedMutated = useCallback(() => {
    // Re-fetch both events and feed
    globalMutate(
      `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    );
    if (feedKey) globalMutate(feedKey);
  }, [startDate, endDate, feedKey, globalMutate]);

  const { dispatch } = useCalendarActions(handleFeedMutated);

  const handleItemAction = useCallback(
    async (event: ExpandedCalendarEvent | DomainCalendarEvent) => {
      const domainEvent = event as DomainCalendarEvent;
      if (!domainEvent._actions?.length || !domainEvent._sourceId) return;

      const action = domainEvent._actions[0];
      // For habits, extract date from the ID (format: habits:habitId:date)
      const date = domainEvent._domain === "habits"
        ? domainEvent.id.split(":")[2]
        : domainEvent.start_date;

      const result = await dispatch(
        action,
        domainEvent._sourceId,
        date,
        !domainEvent._completed,
      );
      if (!result.success) {
        console.error("Calendar inline action failed:", result.error);
      }
    },
    [dispatch],
  );

  const onEventSavedCallback = useCallback(() => {
    globalMutate(
      `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    );
  }, [startDate, endDate, globalMutate]);

  // Event creation state and handlers
  const {
    quickCreate,
    setQuickCreate,
    eventDialog,
    setEventDialog,
    isOverlayOpen,
    handleTimeSlotClick,
    handleDragSelect,
    handleEventClick,
    handleNewEvent,
    handleQuickCreateMoreOptions,
    handleEventSaved,
  } = useCalendarEvents(dateParam, handleItemAction, onEventSavedCallback);

  // --- Merge calendar events + feed items ---

  const eventsByDate = useMemo(() => {
    const calendarEvents = eventsData?.events ?? [];

    // Convert feed items to pseudo-events for rendering
    const feedEvents: DomainCalendarEvent[] = feedData?.items
      ? feedItemsToExpandedEvents(feedData.items)
      : [];

    // Only include calendar events if the events layer is on
    const visibleCalendarEvents = enabledLayers.has("events")
      ? calendarEvents
      : [];

    const allEvents = [
      ...visibleCalendarEvents,
      ...feedEvents,
    ] as ExpandedCalendarEvent[];

    return groupEventsByDate(allEvents);
  }, [eventsData?.events, feedData?.items, enabledLayers]);

  // Compute grid dates
  const gridDates = useMemo(
    () => getMonthGridDates(year, month, weekStartDay),
    [year, month, weekStartDay],
  );

  const today = useMemo(() => getLocalDateString(), []);

  const isLoading = profileLoading || eventsLoading;

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
            enabledLayers={enabledLayers}
            onToggleLayer={toggleLayer}
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
            mobileSidebar={
              <CalendarSidebar
                currentDate={currentDate}
                onDateSelect={navigateToDate}
                weekStartDay={weekStartDay}
                onNewEvent={handleNewEvent}
                enabledLayers={enabledLayers}
                onToggleLayer={toggleLayer}
              />
            }
          />

          <div className="flex-1 overflow-auto p-4">
            {eventsError || profileError || feedError ? (
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
                onNavigateNext={goToNext}
                onNavigatePrev={goToPrev}
              />
            )}
          </div>
        </div>
      </div>

      {/* Floating action button — mobile only */}
      <button
        className="fixed bottom-6 right-6 z-50 md:hidden h-14 w-14 rounded-pill bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
        onClick={handleNewEvent}
        aria-label={t("sidebar.newEvent")}
      >
        <Plus className="h-6 w-6" />
      </button>

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
