import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthGrid } from "@/components/calendar/month-grid";
import { getMonthGridDates } from "@/lib/calendar/date-utils";
import type { CalendarDisplayItem } from "@/lib/calendar/display";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";
import { toDisplayMap } from "./calendar-display-item-test-utils";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "overflow.more" && params?.count !== undefined) {
      return `+${params.count} more`;
    }
    return key;
  },
  useLocale: () => "en",
}));

/** Helper to create a minimal ExpandedCalendarEvent for testing */
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

describe("MonthGrid", () => {
  // April 2026, weekStartDay=0 (Sunday)
  const dates = getMonthGridDates(2026, 3, 0);
  const emptyDisplayItems = new Map<string, CalendarDisplayItem[]>();
  const mockOnDayClick = vi.fn();

  const defaultProps = {
    dates,
    displayItems: emptyDisplayItems,
    currentMonth: 3, // April
    today: "2026-04-15",
    onDayClick: mockOnDayClick,
    weekStartDay: 0,
  };

  it("renders 7 day-of-week headers", () => {
    render(<MonthGrid {...defaultProps} />);
    // Sun, Mon, Tue, Wed, Thu, Fri, Sat
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("renders correct number of day cells", () => {
    render(<MonthGrid {...defaultProps} />);
    // April 2026 with Sunday start = 35 cells
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(35);
  });

  it("today's cell has primary styling", () => {
    render(<MonthGrid {...defaultProps} />);
    // The day number "15" should have the primary background class
    const todayCell = screen.getByText("15");
    expect(todayCell.className).toContain("bg-primary");
    expect(todayCell.className).toContain("text-primary-foreground");
  });

  it("outside month days have muted styling", () => {
    render(<MonthGrid {...defaultProps} />);
    // March 29 is outside April — its date number "29" should have muted styling
    // Find the first "29" which should be from March (outside month)
    const outsideDayNumbers = screen.getAllByText("29");
    // The first one is March 29 (outside month), should have muted class
    const marchDay = outsideDayNumbers[0];
    expect(marchDay.className).toContain("text-muted-foreground");
  });

  it("events render as chips in correct day cells", () => {
    const eventsMap = new Map<string, ExpandedCalendarEvent[]>();
    eventsMap.set("2026-04-10", [
      makeEvent({ id: "e1", title: "Team Meeting", start_date: "2026-04-10", end_date: "2026-04-10" }),
    ]);

    render(<MonthGrid {...defaultProps} displayItems={toDisplayMap(eventsMap)} />);
    expect(screen.getByText("Team Meeting")).toBeInTheDocument();
  });

  it("+N more shows when more than 3 events on a day", () => {
    const eventsMap = new Map<string, ExpandedCalendarEvent[]>();
    eventsMap.set("2026-04-10", [
      makeEvent({ id: "e1", title: "Event 1", start_date: "2026-04-10", end_date: "2026-04-10" }),
      makeEvent({ id: "e2", title: "Event 2", start_date: "2026-04-10", end_date: "2026-04-10" }),
      makeEvent({ id: "e3", title: "Event 3", start_date: "2026-04-10", end_date: "2026-04-10" }),
      makeEvent({ id: "e4", title: "Event 4", start_date: "2026-04-10", end_date: "2026-04-10" }),
      makeEvent({ id: "e5", title: "Event 5", start_date: "2026-04-10", end_date: "2026-04-10" }),
    ]);

    render(<MonthGrid {...defaultProps} displayItems={toDisplayMap(eventsMap)} />);
    // Only 3 visible
    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
    // Event 4 and 5 should not be visible
    expect(screen.queryByText("Event 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Event 5")).not.toBeInTheDocument();
    // +2 more should show
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("event chip shows time prefix when start_time is set", () => {
    const eventsMap = new Map<string, ExpandedCalendarEvent[]>();
    eventsMap.set("2026-04-10", [
      makeEvent({
        id: "e1",
        title: "Standup",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        start_time: "09:30:00",
      }),
    ]);

    render(<MonthGrid {...defaultProps} displayItems={toDisplayMap(eventsMap)} />);
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText("Standup")).toBeInTheDocument();
  });
});
