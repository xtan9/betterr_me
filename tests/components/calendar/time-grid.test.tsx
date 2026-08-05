import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { TimeGrid, timeToMinutes, computeOverlapColumns } from "@/components/calendar/time-grid";
import type { CalendarDisplayItem } from "@/lib/calendar/display";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";
import { toDisplayItems, toDisplayMap } from "./calendar-display-item-test-utils";

expect.extend(axeMatchers);

// Mock next-intl (used by AllDayRow which TimeGrid renders)
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `+${params.count} more`;
    return key;
  },
  useLocale: () => "en",
}));

// Mock scrollTo for jsdom
Element.prototype.scrollTo = vi.fn();

function makeEvent(
  overrides: Partial<CalendarEvent> & { is_virtual?: boolean } = {},
): ExpandedCalendarEvent {
  return {
    id: "e1",
    user_id: "u1",
    title: "Test Event",
    description: null,
    start_date: "2026-04-01",
    start_time: null,
    end_date: "2026-04-01",
    end_time: null,
    location: null,
    color: null,
    category_id: null,
    is_recurring: false,
    recurrence_rule: null,
    end_type: null,
    end_date_recurrence: null,
    end_count: null,
    recurring_event_id: null,
    original_date: null,
    is_exception: false,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    is_virtual: false,
    ...overrides,
  };
}

describe("timeToMinutes", () => {
  it("converts HH:MM:SS to total minutes", () => {
    expect(timeToMinutes("10:30:00")).toBe(630);
    expect(timeToMinutes("00:00:00")).toBe(0);
    expect(timeToMinutes("23:59:00")).toBe(1439);
  });

  it("converts HH:MM to total minutes", () => {
    expect(timeToMinutes("09:15")).toBe(555);
  });
});

describe("computeOverlapColumns", () => {
  it("assigns single event to column 0 with totalColumns 1", () => {
    const events = [
      makeEvent({ id: "e1", start_time: "10:00:00", end_time: "11:00:00" }),
    ];
    const result = computeOverlapColumns(toDisplayItems(events));
    expect(result.get("e1")).toEqual({ column: 0, totalColumns: 1 });
  });

  it("assigns overlapping events to separate columns", () => {
    const events = [
      makeEvent({ id: "e1", start_time: "10:00:00", end_time: "11:00:00" }),
      makeEvent({ id: "e2", start_time: "10:30:00", end_time: "11:30:00" }),
    ];
    const result = computeOverlapColumns(toDisplayItems(events));
    expect(result.get("e1")!.column).toBe(0);
    expect(result.get("e2")!.column).toBe(1);
    expect(result.get("e1")!.totalColumns).toBe(2);
    expect(result.get("e2")!.totalColumns).toBe(2);
  });

  it("non-overlapping events share column 0", () => {
    const events = [
      makeEvent({ id: "e1", start_time: "10:00:00", end_time: "11:00:00" }),
      makeEvent({ id: "e2", start_time: "12:00:00", end_time: "13:00:00" }),
    ];
    const result = computeOverlapColumns(toDisplayItems(events));
    expect(result.get("e1")!.column).toBe(0);
    expect(result.get("e2")!.column).toBe(0);
    expect(result.get("e1")!.totalColumns).toBe(1);
    expect(result.get("e2")!.totalColumns).toBe(1);
  });
});

describe("TimeGrid", () => {
  const today = "2026-04-01";
  const dates = [new Date(2026, 3, 1)];
  const emptyDisplayItems = new Map<string, CalendarDisplayItem[]>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 10, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 24 hour labels", () => {
    render(
      <TimeGrid dates={dates} displayItems={emptyDisplayItems} today={today} />,
    );
    // Check for some hour labels (hour 0 is empty, starts from "1 AM")
    expect(screen.getByText("1 AM")).toBeInTheDocument();
    expect(screen.getByText("12 PM")).toBeInTheDocument();
    expect(screen.getByText("11 PM")).toBeInTheDocument();
  });

  it("renders correct number of day columns based on dates prop", () => {
    const weekDates = Array.from({ length: 7 }, (_, i) => new Date(2026, 3, i + 1));
    const { container } = render(
      <TimeGrid dates={weekDates} displayItems={emptyDisplayItems} today={today} />,
    );
    // The grid should have gridTemplateColumns with repeat(7, 1fr)
    const grids = container.querySelectorAll(".grid");
    // Find the main grid (not the all-day row grid)
    const mainGrid = Array.from(grids).find(
      (g) => (g as HTMLElement).style.height === "1152px",
    );
    expect(mainGrid).not.toBeNull();
    // Time gutter + 7 day columns = 8 children
    expect(mainGrid!.children.length).toBe(8);
  });

  it("renders EventBlock components for timed events", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Meeting", start_time: "10:00:00", end_time: "11:00:00" }),
    ]);
    render(
      <TimeGrid dates={dates} displayItems={toDisplayMap(events)} today={today} />,
    );
    expect(screen.getByText("Meeting")).toBeInTheDocument();
  });

  it("renders CurrentTimeIndicator on today's column", () => {
    const { container } = render(
      <TimeGrid dates={dates} displayItems={emptyDisplayItems} today={today} />,
    );
    // CurrentTimeIndicator has aria-hidden="true"
    const indicator = container.querySelector("[aria-hidden='true']");
    expect(indicator).not.toBeNull();
  });

  it("does not render CurrentTimeIndicator on non-today columns", () => {
    const { container } = render(
      <TimeGrid
        dates={[new Date(2026, 3, 2)]}
        displayItems={emptyDisplayItems}
        today={today}
      />,
    );
    const indicator = container.querySelector("[aria-hidden='true']");
    expect(indicator).toBeNull();
  });

  /**
   * Helper to find the scrollable grid div — the one with onMouseDown handlers.
   * It's the div with `flex-1 overflow-auto relative` class.
   */
  function getScrollGrid(container: HTMLElement): HTMLElement {
    const el = container.querySelector(".flex-1.overflow-auto");
    if (!el) throw new Error("scroll grid not found");
    return el as HTMLElement;
  }

  it("calls onTimeSlotClick when user clicks (mousedown + mouseup at same position)", () => {
    const onTimeSlotClick = vi.fn();
    const { container } = render(
      <TimeGrid
        dates={dates}
        displayItems={emptyDisplayItems}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
      />,
    );
    const grid = getScrollGrid(container);

    fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 0 });
    fireEvent.mouseUp(grid, { clientX: 200, clientY: 100 });

    expect(onTimeSlotClick).toHaveBeenCalledTimes(1);
    const [date, time, position] = onTimeSlotClick.mock.calls[0];
    expect(date).toBeInstanceOf(Date);
    expect(typeof time).toBe("string");
    expect(time).toMatch(/^\d{2}:\d{2}$/);
    expect(position).toEqual({ x: 200, y: 100 });
  });

  it("calls onDragSelect when user drags to select a time range >= 15 min", () => {
    const onDragSelect = vi.fn();
    const onTimeSlotClick = vi.fn();
    const { container } = render(
      <TimeGrid
        dates={dates}
        displayItems={emptyDisplayItems}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
        onDragSelect={onDragSelect}
      />,
    );
    const grid = getScrollGrid(container);

    // Drag from y=100 to y=400 (clearly > 15 min difference at 48px/hour)
    fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 0 });
    fireEvent.mouseMove(grid, { clientX: 200, clientY: 250 });
    fireEvent.mouseUp(grid, { clientX: 200, clientY: 400 });

    expect(onDragSelect).toHaveBeenCalledTimes(1);
    expect(onTimeSlotClick).not.toHaveBeenCalled();
    const [date, startTime, endTime, position] = onDragSelect.mock.calls[0];
    expect(date).toBeInstanceOf(Date);
    expect(startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(endTime).toMatch(/^\d{2}:\d{2}$/);
    // End time > start time (minMinutes/maxMinutes ordering)
    expect(endTime > startTime).toBe(true);
    expect(position).toEqual({ x: 200, y: 400 });
  });

  it("ignores non-left mouse button clicks", () => {
    const onTimeSlotClick = vi.fn();
    const { container } = render(
      <TimeGrid
        dates={dates}
        displayItems={emptyDisplayItems}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
      />,
    );
    const grid = getScrollGrid(container);

    fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 2 });
    fireEvent.mouseUp(grid, { clientX: 200, clientY: 100 });

    expect(onTimeSlotClick).not.toHaveBeenCalled();
  });

  it("does not start drag when mousedown target is inside a button (event block)", () => {
    const onTimeSlotClick = vi.fn();
    const onDisplayItemClick = vi.fn();
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Meeting", start_time: "10:00:00", end_time: "11:00:00" }),
    ]);
    const { container } = render(
      <TimeGrid
        dates={dates}
        displayItems={toDisplayMap(events)}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
        onDisplayItemClick={onDisplayItemClick}
      />,
    );
    const eventBtn = screen.getByText("Meeting").closest("button")!;

    // mousedown on the event button bubbles up to the grid's handler; because
    // the event's target is inside a <button>, the closest("button") guard
    // should skip drag-start logic.
    fireEvent.mouseDown(eventBtn, { clientX: 200, clientY: 500, button: 0, bubbles: true });
    const grid = getScrollGrid(container);
    // mouseUp without a prior drag-start must also not invoke onTimeSlotClick
    fireEvent.mouseUp(grid, { clientX: 200, clientY: 500 });

    expect(onTimeSlotClick).not.toHaveBeenCalled();
  });

  it("cancels an in-progress drag when the mouse leaves the grid", () => {
    const onDragSelect = vi.fn();
    const onTimeSlotClick = vi.fn();
    const { container } = render(
      <TimeGrid
        dates={dates}
        displayItems={emptyDisplayItems}
        today={today}
        onTimeSlotClick={onTimeSlotClick}
        onDragSelect={onDragSelect}
      />,
    );
    const grid = getScrollGrid(container);

    fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 0 });
    fireEvent.mouseMove(grid, { clientX: 200, clientY: 300 });
    fireEvent.mouseLeave(grid);
    // mouseUp after leave should do nothing
    fireEvent.mouseUp(grid, { clientX: 200, clientY: 400 });

    expect(onDragSelect).not.toHaveBeenCalled();
    expect(onTimeSlotClick).not.toHaveBeenCalled();
  });

  it("renders overlapping events side-by-side (both visible)", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "First", start_time: "10:00:00", end_time: "11:00:00" }),
      makeEvent({ id: "e2", title: "Second", start_time: "10:30:00", end_time: "11:30:00" }),
    ]);
    render(
      <TimeGrid dates={dates} displayItems={toDisplayMap(events)} today={today} />,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("invokes onDisplayItemClick when a display block is clicked", () => {
    const onDisplayItemClick = vi.fn();
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Clickable", start_time: "10:00:00", end_time: "11:00:00" }),
    ]);
    render(
      <TimeGrid dates={dates} displayItems={toDisplayMap(events)} today={today} onDisplayItemClick={onDisplayItemClick} />,
    );
    fireEvent.click(screen.getByText("Clickable"));
    expect(onDisplayItemClick).toHaveBeenCalledTimes(1);
    expect(onDisplayItemClick.mock.calls[0][0].id).toBe("e1");
  });

  it("renders event without end_time using default 60 min duration", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "OpenEnd", start_time: "10:00:00", end_time: null }),
    ]);
    render(<TimeGrid dates={dates} displayItems={toDisplayMap(events)} today={today} />);
    expect(screen.getByText("OpenEnd")).toBeInTheDocument();
  });

  it("renders all-day events via AllDayRow", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "ad1", title: "All Day Event", start_time: null, end_time: null }),
    ]);
    render(<TimeGrid dates={dates} displayItems={toDisplayMap(events)} today={today} />);
    expect(screen.getByText("All Day Event")).toBeInTheDocument();
  });

  it("does not fire drag/click callbacks when they are not provided (no throw)", () => {
    const { container } = render(
      <TimeGrid dates={dates} displayItems={emptyDisplayItems} today={today} />,
    );
    const grid = getScrollGrid(container);
    // Should not throw even without onTimeSlotClick / onDragSelect
    expect(() => {
      fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 0 });
      fireEvent.mouseUp(grid, { clientX: 200, clientY: 100 });
      fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, button: 0 });
      fireEvent.mouseMove(grid, { clientX: 200, clientY: 300 });
      fireEvent.mouseUp(grid, { clientX: 200, clientY: 500 });
    }).not.toThrow();
  });

  it("has no axe accessibility violations", async () => {
    // axe-core uses real timers internally; disable fake timers for this test.
    vi.useRealTimers();
    const { container } = render(
      <TimeGrid dates={dates} displayItems={emptyDisplayItems} today={today} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  }, 15000);
});
