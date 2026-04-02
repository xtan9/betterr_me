import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AllDayRow } from "@/components/calendar/all-day-row";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "timeGrid.allDayMore" && params?.count !== undefined) {
      return `+${params.count} more`;
    }
    return key;
  },
  useLocale: () => "en",
}));

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

describe("AllDayRow", () => {
  const dates = [new Date(2026, 3, 1)]; // Single column for simplicity

  it("renders nothing when no all-day events exist", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    const { container } = render(
      <AllDayRow dates={dates} events={events} />,
    );
    // Should not render anything
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when only timed events exist (no all-day)", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Timed", start_time: "10:00:00", end_time: "11:00:00" }),
    ]);
    const { container } = render(
      <AllDayRow dates={dates} events={events} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all-day events using EventChip", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "All Day Meeting" }),
    ]);
    render(<AllDayRow dates={dates} events={events} />);
    expect(screen.getByText("All Day Meeting")).toBeInTheDocument();
  });

  it("shows up to 3 events per column", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Event 1" }),
      makeEvent({ id: "e2", title: "Event 2" }),
      makeEvent({ id: "e3", title: "Event 3" }),
    ]);
    render(<AllDayRow dates={dates} events={events} />);
    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
  });

  it("shows +N more when more than 3 all-day events", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Event 1" }),
      makeEvent({ id: "e2", title: "Event 2" }),
      makeEvent({ id: "e3", title: "Event 3" }),
      makeEvent({ id: "e4", title: "Event 4" }),
      makeEvent({ id: "e5", title: "Event 5" }),
    ]);
    render(<AllDayRow dates={dates} events={events} />);
    // Only first 3 visible
    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
    // Events 4 and 5 hidden
    expect(screen.queryByText("Event 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Event 5")).not.toBeInTheDocument();
    // +2 more button
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("clicking +N more expands to show all events", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Event 1" }),
      makeEvent({ id: "e2", title: "Event 2" }),
      makeEvent({ id: "e3", title: "Event 3" }),
      makeEvent({ id: "e4", title: "Event 4" }),
    ]);
    render(<AllDayRow dates={dates} events={events} />);

    // Click +1 more
    fireEvent.click(screen.getByText("+1 more"));

    // All events visible now
    expect(screen.getByText("Event 4")).toBeInTheDocument();
    // +N more is gone
    expect(screen.queryByText("+1 more")).not.toBeInTheDocument();
  });

  it("Show less button appears when expanded", () => {
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [
      makeEvent({ id: "e1", title: "Event 1" }),
      makeEvent({ id: "e2", title: "Event 2" }),
      makeEvent({ id: "e3", title: "Event 3" }),
      makeEvent({ id: "e4", title: "Event 4" }),
    ]);
    render(<AllDayRow dates={dates} events={events} />);

    fireEvent.click(screen.getByText("+1 more"));

    // "Show less" / collapseAllDay button should appear
    expect(screen.getByText("timeGrid.collapseAllDay")).toBeInTheDocument();
  });

  it("renders correct number of columns matching dates.length", () => {
    const threeDates = [
      new Date(2026, 3, 1),
      new Date(2026, 3, 2),
      new Date(2026, 3, 3),
    ];
    const events = new Map<string, ExpandedCalendarEvent[]>();
    events.set("2026-04-01", [makeEvent({ id: "e1", title: "Day 1 Event" })]);

    const { container } = render(
      <AllDayRow dates={threeDates} events={events} />,
    );
    // Grid should have the time gutter + 3 day columns = 4 children
    const grid = container.querySelector(".grid");
    expect(grid).not.toBeNull();
    // 1 gutter + 3 day columns = 4 direct children
    expect(grid!.children.length).toBe(4);
  });
});
