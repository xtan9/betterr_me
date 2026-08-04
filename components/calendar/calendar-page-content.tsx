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
import { overlayItemsToExpandedEvents, type CalendarDisplayEvent } from "@/lib/calendar/overlay-adapter";
import { CALENDAR_OVERLAY_LAYERS, type CalendarOverlayItem } from "@/lib/calendar/overlay-feed";
import { useLocalization } from "@/lib/hooks/use-localization";
import { weekStartPreferenceToDay } from "@/lib/preferences/owners";

interface EventsResponse {
  events: ExpandedCalendarEvent[];
}

interface OverlayResponse {
  items: CalendarOverlayItem[];
  unavailableLayers?: string[];
}

export function CalendarPageContent() {
  const t = useTranslations("calendar");
  const searchParams = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();

  const localization = useLocalization();
  const profileLoading = localization.isLoading;
  const weekStartDay = weekStartPreferenceToDay(localization.weekStart);

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

  // The overlay owns local-date projection for every non-event layer.
  const userTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const overlayLayers = useMemo(() => {
    return CALENDAR_OVERLAY_LAYERS.filter((layer) => enabledLayers.has(layer)).join(",");
  }, [enabledLayers]);

  const overlayKey = overlayLayers
    ? `/api/calendar/overlay-feed?start_date=${startDate}&end_date=${endDate}&layers=${overlayLayers}&timezone=${encodeURIComponent(userTimezone)}`
    : null;

  const {
    data: overlayData,
    error: overlayError,
  } = useSWR<OverlayResponse>(overlayKey, fetcher, { keepPreviousData: true });

  const [isRetryingOverlay, setIsRetryingOverlay] = useState(false);
  const retryOverlay = useCallback(async () => {
    if (!overlayKey) return;
    setIsRetryingOverlay(true);
    try {
      await globalMutate(overlayKey);
    } finally {
      setIsRetryingOverlay(false);
    }
  }, [globalMutate, overlayKey]);

  const unavailableOverlayLayers = overlayData?.unavailableLayers ?? [];
  const taskOverlayUnavailable = Boolean(
    enabledLayers.has("tasks") && (overlayError || unavailableOverlayLayers.includes("tasks")),
  );
  const habitOverlayUnavailable = Boolean(
    enabledLayers.has("habits") && (overlayError || unavailableOverlayLayers.includes("habits")),
  );
  const workoutOverlayUnavailable = Boolean(
    enabledLayers.has("workouts") && (overlayError || unavailableOverlayLayers.includes("workouts")),
  );

  // Log SWR fetch errors for debugging
  useEffect(() => {
    if (eventsError) console.error("Failed to fetch calendar events:", eventsError);
    if (overlayError) console.error("Failed to fetch calendar overlay:", overlayError);
  }, [eventsError, overlayError]);

  // --- Inline actions ---

  const handleOverlayMutated = useCallback(() => {
    // Re-fetch Calendar Events and the selected overlay layers.
    globalMutate(
      `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    );
    if (overlayKey) globalMutate(overlayKey);
  }, [startDate, endDate, overlayKey, globalMutate]);

  const { toggleTask, toggleHabit, navigateWorkout } = useCalendarActions(handleOverlayMutated);

  const handleItemAction = useCallback(
    async (event: ExpandedCalendarEvent | CalendarDisplayEvent) => {
      const overlayEvent = event as CalendarDisplayEvent;
      if (overlayEvent._taskAction) {
        const result = await toggleTask(overlayEvent._taskAction.taskId);
        if (!result.success) console.error("Calendar task action failed:", result.error);
        return;
      }
      if (overlayEvent._habitAction) {
        const result = await toggleHabit(
          overlayEvent._habitAction.habitId,
          overlayEvent._habitAction.date,
          !overlayEvent._completed,
        );
        if (!result.success) console.error("Calendar habit action failed:", result.error);
        return;
      }
      if (overlayEvent._workoutAction) {
        navigateWorkout(overlayEvent._workoutAction.workoutId);
        return;
      }
    },
    [navigateWorkout, toggleHabit, toggleTask],
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

  // --- Merge Calendar Events + overlay items ---

  const eventsByDate = useMemo(() => {
    const calendarEvents = eventsData?.events ?? [];

    // Convert overlay items to pseudo-events for rendering
    const overlayEvents: CalendarDisplayEvent[] = overlayData?.items
      ? overlayItemsToExpandedEvents(overlayData.items)
      : [];
    // Only include calendar events if the events layer is on
    const visibleCalendarEvents = enabledLayers.has("events")
      ? calendarEvents
      : [];

    const allEvents = [
      ...visibleCalendarEvents,
      ...overlayEvents,
    ] as ExpandedCalendarEvent[];

    return groupEventsByDate(allEvents);
  }, [eventsData?.events, overlayData?.items, enabledLayers]);

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
            {eventsError ? (
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
            {taskOverlayUnavailable && !isRetryingOverlay && (
              <div
                role="status"
                className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span>{t("taskOverlay.unavailable")}</span>
                <button type="button" onClick={retryOverlay}>
                  {t("taskOverlay.retry")}
                </button>
              </div>
            )}
            {habitOverlayUnavailable && !isRetryingOverlay && (
              <div
                role="status"
                className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span>{t("habitOverlay.unavailable")}</span>
                <button type="button" onClick={retryOverlay}>
                  {t("habitOverlay.retry")}
                </button>
              </div>
            )}
            {workoutOverlayUnavailable && !isRetryingOverlay && (
              <div
                role="status"
                className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span>{t("workoutOverlay.unavailable")}</span>
                <button type="button" onClick={retryOverlay}>
                  {t("workoutOverlay.retry")}
                </button>
              </div>
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
