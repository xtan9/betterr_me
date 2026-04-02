import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeGrid, timeToMinutes, computeOverlapColumns } from "@/components/calendar/time-grid";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

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
    const result = computeOverlapColumns(events);
    expect(result.get("e1")).toEqual({ column: 0, totalColumns: 1 });
  });

  it("assigns overlapping events to separate columns", () => {
    const events = [
      makeEvent({ id: "e1", start_time: "10:00:00", end_time: "11:00:00" }),
      makeEvent({ id: "e2", start_time: "10:30:00", end_time: "11:30:00" }),
    ];
    const result = computeOverlapColumns(events);
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
    const result = computeOverlapColumns(events);
    expect(result.get("e1")!.column).toBe(0);
    expect(result.get("e2")!.column).toBe(0);
    expect(result.get("e1")!.totalColumns).toBe(1);
    expect(result.get("e2")!.totalColumns).toBe(1);
  });
});

describe("TimeGrid", () => {
  const today = "2026-04-01";
  const dates = [new Date(2026, 3, 1)];
  const emptyEvents = new Map<string, ExpandedCalendarEvent[]>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 10, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 24 hour labels", () => {
    render(
      <TimeGrid dates={dates} events={emptyEvents} today={today} />,
    );
    // Check for some hour labels (hour 0 is empty, starts from "1 AM")
    expect(screen.getByText("1 AM")).toBeInTheDocument();
    expect(screen.getByText("12 PM")).toBeInTheDocument();
    expect(screen.getByText("11 PM")).toBeInTheDocument();
  });

  it("renders correct number of day columns based on dates prop", () => {
    const weekDates = Array.from({ length: 7 }, (_, i) => new Date(2026, 3, i + 1));
    const { container } = render(
      <TimeGrid dates={weekDates} events={emptyEvents} today={today} />,
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
      <TimeGrid dates={dates} events={events} today={today} />,
    );
    expect(screen.getByText("Meeting")).toBeInTheDocument();
  });

  it("renders CurrentTimeIndicator on today's column", () => {
    const { container } = render(
      <TimeGrid dates={dates} events={emptyEvents} today={today} />,
    );
    // CurrentTimeIndicator has aria-hidden="true"
    const indicator = container.querySelector("[aria-hidden='true']");
    expect(indicator).not.toBeNull();
  });

  it("does not render CurrentTimeIndicator on non-today columns", () => {
    const { container } = render(
      <TimeGrid
        dates={[new Date(2026, 3, 2)]}
        events={emptyEvents}
        today={today}
      />,
    );
    const indicator = container.querySelector("[aria-hidden='true']");
    expect(indicator).toBeNull();
  });
});
