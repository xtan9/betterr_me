import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  overlay: { data: null as unknown, error: null as Error | null },
  overlayKeys: [] as (string | null)[],
  mutate: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn(),
  actions: {
    dispatch: vi.fn(),
    toggleTask: vi.fn(),
    toggleHabit: vi.fn().mockResolvedValue({ success: true }),
    navigateWorkout: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("view=day&date=2026-04-02"),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("swr", () => ({
  default: (key: string | null) => {
    state.overlayKeys.push(key);
    if (key?.includes("/overlay-feed")) return { ...state.overlay, isLoading: false };
    if (key?.includes("calendar-events")) {
      return {
        data: {
          events: [{
            id: "event-1",
            start_date: "2026-04-02",
            end_date: "2026-04-02",
            start_time: null,
            end_time: null,
          }],
        },
        error: null,
        isLoading: false,
      };
    }
    return { data: null, error: null, isLoading: false };
  },
  useSWRConfig: () => ({ mutate: state.mutate }),
}));
vi.mock("@/lib/fetcher", () => ({ fetcher: vi.fn() }));
vi.mock("@/lib/hooks/use-localization", () => ({
  useLocalization: () => ({ weekStart: "monday", isLoading: false }),
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock("@/hooks/use-calendar-actions", () => ({
  useCalendarActions: () => state.actions,
}));
vi.mock("@/components/calendar/use-calendar-navigation", () => ({
  useCalendarNavigation: () => ({
    view: "day",
    dateParam: "2026-04-02",
    year: 2026,
    month: 3,
    currentDate: new Date(2026, 3, 2),
    goToToday: vi.fn(),
    goToPrev: vi.fn(),
    goToNext: vi.fn(),
    setView: vi.fn(),
    navigateToDate: vi.fn(),
    handleDayClick: vi.fn(),
    updateParams: state.replace,
  }),
}));
vi.mock("@/components/calendar/calendar-header", () => ({ CalendarHeader: () => <div /> }));
vi.mock("@/components/calendar/calendar-sidebar", () => ({
  CalendarSidebar: ({ onToggleLayer }: { onToggleLayer: (layer: string) => void }) => (
    <div>
      {"tasks habits workouts".split(" ").map((layer) => (
        <button key={layer} type="button" data-testid={`toggle-${layer}`} onClick={() => onToggleLayer(layer)} />
      ))}
    </div>
  ),
}));
vi.mock("@/components/calendar/month-grid", () => ({ MonthGrid: () => <div /> }));
vi.mock("@/components/calendar/week-view", () => ({ WeekView: () => <div /> }));
vi.mock("@/components/calendar/day-view", () => ({
  DayView: ({ onEventClick }: { onEventClick: (event: unknown) => void }) => (
    <>
      <div data-testid="day-view" />
      <button
        type="button"
        data-testid="invoke-habit-action"
        onClick={() => onEventClick({
          id: "habits:habit-1:2026-04-02",
          start_date: "2026-04-02",
          _layer: "habits",
          _completed: true,
          _habitAction: {
            type: "toggle_habit_completion",
            habitId: "habit-1",
            date: "2026-04-02",
          },
        })}
      />
      <button
        type="button"
        data-testid="invoke-workout-action"
        onClick={() => onEventClick({
          id: "workouts:workout-1",
          start_date: "2026-04-02",
          _layer: "workouts",
          _completed: true,
          _workoutAction: {
            type: "navigate_workout",
            workoutId: "workout-1",
          },
        })}
      />
    </>
  ),
}));
vi.mock("@/components/calendar/event-quick-create", () => ({ EventQuickCreate: () => null }));
vi.mock("@/components/calendar/event-dialog", () => ({ EventDialog: () => null }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CalendarPageContent } from "@/components/calendar/calendar-page-content";

describe("CalendarPageContent task overlay failure seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.overlay = { data: null, error: new Error("overlay unavailable") };
    state.overlayKeys = [];
  });

  it("keeps Calendar Events usable and retries only the task overlay", async () => {
    render(<CalendarPageContent />);

    expect(screen.getByTestId("day-view")).toBeInTheDocument();
    expect(screen.getByText("taskOverlay.unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "taskOverlay.retry" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.stringContaining("/api/calendar/overlay-feed"));
    expect(state.mutate).not.toHaveBeenCalledWith(expect.stringContaining("/api/calendar-events"));
  });

  it("does not request the overlay when every overlay Calendar Layer is disabled", () => {
    state.overlay = { data: { items: [] }, error: null };
    render(<CalendarPageContent />);

    for (const layer of ["tasks", "habits", "workouts"]) {
      fireEvent.click(screen.getAllByTestId(`toggle-${layer}`)[0]);
    }

    expect(state.overlayKeys.at(-1)).toBeNull();
  });

  it("shows a localized unavailable habit notice and retries only the overlay", () => {
    state.overlay = {
      data: { items: [], unavailableLayers: ["habits"] },
      error: null,
    };

    render(<CalendarPageContent />);

    expect(screen.getByText("habitOverlay.unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "habitOverlay.retry" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.stringContaining("layers=tasks,habits"));
    expect(state.mutate).not.toHaveBeenCalledWith(expect.stringContaining("/api/calendar-events"));
  });

  it("dispatches the typed habit action through the existing UI adapter", async () => {
    state.overlay = { data: { items: [] }, error: null };

    render(<CalendarPageContent />);
    fireEvent.click(screen.getByTestId("invoke-habit-action"));

    await waitFor(() => {
      expect(state.actions.toggleHabit).toHaveBeenCalledWith("habit-1", "2026-04-02", false);
    });
  });

  it("keeps the calendar visible, localizes workout degradation, and dispatches workout navigation", async () => {
    state.overlay = { data: { items: [], unavailableLayers: ["workouts"] }, error: null };

    render(<CalendarPageContent />);

    expect(screen.getByTestId("day-view")).toBeInTheDocument();
    expect(screen.getByText("workoutOverlay.unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "workoutOverlay.retry" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.stringContaining("layers=tasks,habits,workouts"));

    fireEvent.click(screen.getByTestId("invoke-workout-action"));
    await waitFor(() => {
      expect(state.actions.navigateWorkout).toHaveBeenCalledWith("workout-1");
    });
  });
});
