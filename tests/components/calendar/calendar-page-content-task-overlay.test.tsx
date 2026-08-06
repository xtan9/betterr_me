import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  overlay: {
    state: {
      status: "failed" as "idle" | "loading" | "complete" | "degraded" | "failed",
      items: [] as unknown[],
      unavailableLayers: ["tasks", "habits", "workouts"] as string[],
    },
    retry: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn().mockResolvedValue({ status: "success" }),
  },
  overlaySelections: [] as { range: unknown; layers: unknown }[],
  mutate: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("view=day&date=2026-04-02"),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { error: state.toastError } }));
vi.mock("swr", () => ({
  default: (key: string | null) => {
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
vi.mock("@/lib/hooks/use-calendar-overlay-feed", async () => {
  const { useState } = await vi.importActual<typeof import("react")>("react");
  return {
    useCalendarOverlayFeed: (selection: { range: unknown; layers: unknown }) => {
      state.overlaySelections.push(selection);
      const [isRetrying, setIsRetrying] = useState(false);
      const retry = async () => {
        setIsRetrying(true);
        try {
          await state.overlay.retry();
        } finally {
          setIsRetrying(false);
        }
      };
      return { ...state.overlay, isRetrying, retry };
    },
  };
});
vi.mock("@/lib/fetcher", () => ({ fetcher: vi.fn() }));
vi.mock("@/lib/hooks/use-localization", () => ({
  useLocalization: () => ({ weekStart: "monday", isLoading: false }),
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({ useKeyboardShortcuts: vi.fn() }));
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
  DayView: ({ onDisplayItemClick }: { onDisplayItemClick: (item: unknown) => void }) => (
    <>
      <div data-testid="day-view" />
      <button
        type="button"
        data-testid="invoke-calendar-event"
        onClick={() => onDisplayItemClick({
          kind: "event",
          id: "event-1",
          title: "Appointment",
          start_date: "2026-04-02",
          end_date: "2026-04-02",
          start_time: null,
          end_time: null,
          color: null,
          event: { id: "event-1" },
        })}
      />
      <button
        type="button"
        data-testid="invoke-habit-action"
        onClick={() => onDisplayItemClick({
          kind: "overlay",
          id: "habits:habit-1:2026-04-02",
          title: "Read",
          start_date: "2026-04-02",
          end_date: "2026-04-02",
          start_time: null,
          end_time: null,
          color: null,
          layer: "habits",
          completed: true,
          action: {
            type: "toggle_habit_completion",
            habitId: "habit-1",
            date: "2026-04-02",
          },
        })}
      />
      <button
        type="button"
        data-testid="invoke-workout-action"
        onClick={() => onDisplayItemClick({
          kind: "overlay",
          id: "workouts:workout-1",
          title: "Morning lift",
          start_date: "2026-04-02",
          end_date: "2026-04-02",
          start_time: "06:30",
          end_time: null,
          color: null,
          layer: "workouts",
          completed: true,
          action: {
            type: "navigate_workout",
            workoutId: "workout-1",
          },
        })}
      />
    </>
  ),
}));
vi.mock("@/components/calendar/event-quick-create", () => ({ EventQuickCreate: () => null }));
vi.mock("@/components/calendar/event-dialog", () => ({
  EventDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="calendar-event-dialog" /> : null,
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CalendarPageContent } from "@/components/calendar/calendar-page-content";

describe("CalendarPageContent task overlay failure seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.mutate = vi.fn().mockResolvedValue(undefined);
    state.overlay = {
      state: { status: "failed", items: [], unavailableLayers: ["tasks", "habits", "workouts"] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "success" }),
    };
    state.overlaySelections = [];
  });

  it("keeps Calendar Events usable and retries only the task overlay", async () => {
    render(<CalendarPageContent />);

    expect(screen.getByTestId("day-view")).toBeInTheDocument();
    expect(screen.getByText("taskOverlay.unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "taskOverlay.retry" }));
    expect(state.overlay.retry).toHaveBeenCalledTimes(1);
    expect(state.mutate).not.toHaveBeenCalledWith(expect.stringContaining("/api/calendar-events"));
  });

  it("keeps an unavailable layer notice visible while its retry is in flight", async () => {
    let resolveMutate!: () => void;
    state.overlay.retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutate = resolve;
        }),
    );
    render(<CalendarPageContent />);

    const notice = screen.getByText("taskOverlay.unavailable");
    const retry = screen.getByRole("button", { name: "taskOverlay.retry" });
    fireEvent.click(retry);

    expect(notice).toBeInTheDocument();
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toHaveTextContent("retrying");

    resolveMutate();
    await waitFor(() => expect(retry).not.toBeDisabled());
  });

  it("does not request the overlay when every overlay Calendar Layer is disabled", () => {
    render(<CalendarPageContent />);

    for (const layer of ["tasks", "habits", "workouts"]) {
      fireEvent.click(screen.getAllByTestId(`toggle-${layer}`)[0]);
    }

    expect(state.overlaySelections.at(-1)?.layers).toEqual([]);
  });

  it("shows a localized unavailable habit notice and retries only the overlay", () => {
    state.overlay = {
      state: { status: "degraded", items: [], unavailableLayers: ["habits"] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "success" }),
    };

    render(<CalendarPageContent />);

    expect(screen.getByText("habitOverlay.unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "habitOverlay.retry" }));
    expect(state.overlay.retry).toHaveBeenCalledTimes(1);
    expect(state.mutate).not.toHaveBeenCalledWith(expect.stringContaining("/api/calendar-events"));
  });

  it("dispatches the typed habit action through the existing UI adapter", async () => {
    state.overlay = {
      state: { status: "complete", items: [], unavailableLayers: [] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "success" }),
    };

    render(<CalendarPageContent />);
    fireEvent.click(screen.getByTestId("invoke-habit-action"));

    await waitFor(() => {
      expect(state.overlay.executeAction).toHaveBeenCalledWith(expect.objectContaining({
        action: {
          type: "toggle_habit_completion",
          habitId: "habit-1",
          date: "2026-04-02",
        },
        completed: true,
      }));
    });
  });

  it("translates an adapter failure through the existing localized toast", async () => {
    state.overlay = {
      state: { status: "complete", items: [], unavailableLayers: [] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "failure", reason: "request-failed" }),
    };

    render(<CalendarPageContent />);
    fireEvent.click(screen.getByTestId("invoke-habit-action"));

    await waitFor(() => {
      expect(state.toastError).toHaveBeenCalledWith("sidebar.actionFailed");
    });
  });

  it("keeps Calendar Event interaction on the Calendar Event path", () => {
    state.overlay = {
      state: { status: "complete", items: [], unavailableLayers: [] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "success" }),
    };

    render(<CalendarPageContent />);
    fireEvent.click(screen.getByTestId("invoke-calendar-event"));

    expect(screen.getByTestId("calendar-event-dialog")).toBeInTheDocument();
    expect(state.overlay.executeAction).not.toHaveBeenCalled();
  });

  it("keeps the calendar visible, localizes workout degradation, and dispatches workout navigation", async () => {
    state.overlay = {
      state: { status: "degraded", items: [], unavailableLayers: ["workouts"] },
      retry: vi.fn().mockResolvedValue(undefined),
      executeAction: vi.fn().mockResolvedValue({ status: "success" }),
    };

    render(<CalendarPageContent />);

    expect(screen.getByTestId("day-view")).toBeInTheDocument();
    expect(screen.getByText("workoutOverlay.unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "workoutOverlay.retry" }));
    expect(state.overlay.retry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("invoke-workout-action"));
    await waitFor(() => {
      expect(state.overlay.executeAction).toHaveBeenCalledWith(expect.objectContaining({
        action: { type: "navigate_workout", workoutId: "workout-1" },
      }));
    });
  });
});
