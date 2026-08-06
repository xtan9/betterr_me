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
import {
  calendarEventToDisplayItem,
  groupCalendarDisplayItemsByDate,
  type CalendarDisplayItem,
  type CalendarLayer,
  type CalendarOverlayDisplayItem,
} from "@/lib/calendar/display";
import {
  CALENDAR_OVERLAY_LAYERS,
  type CalendarOverlayLayer,
} from "@/lib/calendar/overlay-feed";
import { useCalendarOverlayFeed } from "@/lib/hooks/use-calendar-overlay-feed";
import { useLocalization } from "@/lib/hooks/use-localization";
import { weekStartPreferenceToDay } from "@/lib/preferences/owners";

interface EventsResponse {
  events: ExpandedCalendarEvent[];
}

type OverlayNoticeTranslationKey = "taskOverlay" | "habitOverlay" | "workoutOverlay";

const OVERLAY_NOTICE_DEFINITIONS = [
  { layer: "tasks", translationKey: "taskOverlay" },
  { layer: "habits", translationKey: "habitOverlay" },
  { layer: "workouts", translationKey: "workoutOverlay" },
] as const satisfies ReadonlyArray<{
  layer: CalendarOverlayLayer;
  translationKey: OverlayNoticeTranslationKey;
}>;

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
  const [enabledLayers, setEnabledLayers] = useState<Set<CalendarLayer>>(
    new Set<CalendarLayer>(["events", "tasks", "habits", "workouts"]),
  );

  const toggleLayer = useCallback((key: CalendarLayer) => {
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

  const overlayLayers = useMemo(
    () => CALENDAR_OVERLAY_LAYERS.filter((layer) => enabledLayers.has(layer)),
    [enabledLayers],
  );
  const overlayFeed = useCalendarOverlayFeed({
    range: { from: startDate, to: endDate },
    layers: overlayLayers,
  });
  const { retry: retryOverlayFeed } = overlayFeed;

  const unavailableOverlayNotices = useMemo(() => {
    const unavailableLayers = new Set(overlayFeed.state.unavailableLayers);

    return OVERLAY_NOTICE_DEFINITIONS.filter(
      ({ layer }) =>
        enabledLayers.has(layer) &&
        unavailableLayers.has(layer),
    );
  }, [enabledLayers, overlayFeed.state.unavailableLayers]);

  // Log SWR fetch errors for debugging
  useEffect(() => {
    if (eventsError) console.error("Failed to fetch calendar events:", eventsError);
  }, [eventsError]);

  const handleOverlayMutated = useCallback(() => {
    globalMutate(
      `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
    );
    void retryOverlayFeed();
  }, [endDate, globalMutate, retryOverlayFeed, startDate]);

  const { toggleTask, toggleHabit, navigateWorkout } = useCalendarActions(handleOverlayMutated);

  const handleOverlayItemAction = useCallback(
    async (item: CalendarOverlayDisplayItem) => {
      if (item.action.type === "toggle_task_completion") {
        const result = await toggleTask(item.action.taskId);
        if (!result.success) console.error("Calendar task action failed:", result.error);
        return;
      }
      if (item.action.type === "toggle_habit_completion") {
        const result = await toggleHabit(
          item.action.habitId,
          item.action.date,
          !item.completed,
        );
        if (!result.success) console.error("Calendar habit action failed:", result.error);
        return;
      }
      navigateWorkout(item.action.workoutId);
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
  } = useCalendarEvents(dateParam, onEventSavedCallback);

  const handleDisplayItemClick = useCallback(
    (item: CalendarDisplayItem) => {
      if (item.kind === "event") {
        handleEventClick(item);
        return;
      }
      handleOverlayItemAction(item);
    },
    [handleEventClick, handleOverlayItemAction],
  );

  // --- Merge Calendar Events + overlay items ---

  const displayItemsByDate = useMemo(() => {
    const calendarEvents = eventsData?.events ?? [];

    // Compose Calendar Events with the adapter's flat overlay display items.
    // Only include calendar events if the events layer is on
    const visibleCalendarEvents = enabledLayers.has("events")
      ? calendarEvents.map(calendarEventToDisplayItem)
      : [];

    const allItems = [
      ...visibleCalendarEvents,
      ...overlayFeed.state.items,
    ];

    return groupCalendarDisplayItemsByDate(allItems);
  }, [eventsData?.events, overlayFeed.state.items, enabledLayers]);

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
                displayItems={displayItemsByDate}
                currentMonth={month}
                today={today}
                onDayClick={handleDayClick}
                weekStartDay={weekStartDay}
              />
            ) : view === "week" ? (
              <WeekView
                currentDate={currentDate}
                weekStartDay={weekStartDay}
                displayItems={displayItemsByDate}
                today={today}
                onTimeSlotClick={handleTimeSlotClick}
                onDragSelect={handleDragSelect}
                onDisplayItemClick={handleDisplayItemClick}
              />
            ) : (
              <DayView
                currentDate={currentDate}
                displayItems={displayItemsByDate}
                today={today}
                onTimeSlotClick={handleTimeSlotClick}
                onDragSelect={handleDragSelect}
                onDisplayItemClick={handleDisplayItemClick}
                onNavigateNext={goToNext}
                onNavigatePrev={goToPrev}
              />
            )}
            {unavailableOverlayNotices.map(({ layer, translationKey }) => (
              <div
                key={layer}
                role="status"
                className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span>{t(`${translationKey}.unavailable`)}</span>
                <button
                  type="button"
                  onClick={overlayFeed.retry}
                  disabled={overlayFeed.isRetrying}
                  aria-busy={overlayFeed.isRetrying}
                >
                  {overlayFeed.isRetrying ? t("retrying") : t(`${translationKey}.retry`)}
                </button>
              </div>
            ))}
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
