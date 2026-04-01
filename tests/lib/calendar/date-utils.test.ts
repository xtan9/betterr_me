import { describe, it, expect } from "vitest";
import {
  getDateString,
  getMonthGridDates,
  getMonthDateRange,
  groupEventsByDate,
} from "@/lib/calendar/date-utils";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

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

// =============================================================================
// getDateString
// =============================================================================

describe("getDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    const date = new Date(2026, 3, 15); // April 15, 2026
    expect(getDateString(date)).toBe("2026-04-15");
  });

  it("pads single-digit months with 0", () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(getDateString(date)).toBe("2026-01-05");
  });

  it("pads single-digit days with 0", () => {
    const date = new Date(2026, 11, 3); // December 3, 2026
    expect(getDateString(date)).toBe("2026-12-03");
  });

  it("works for December 31", () => {
    const date = new Date(2026, 11, 31);
    expect(getDateString(date)).toBe("2026-12-31");
  });
});

// =============================================================================
// getMonthGridDates
// =============================================================================

describe("getMonthGridDates", () => {
  it("returns 35 dates for April 2026 with weekStartDay=0 (Sunday)", () => {
    // April 2026: 1st is Wednesday
    // Grid starts from Sunday March 29
    const dates = getMonthGridDates(2026, 3, 0); // month=3 is April (0-indexed)
    expect(dates.length).toBe(35);
    expect(getDateString(dates[0])).toBe("2026-03-29");
    expect(getDateString(dates[dates.length - 1])).toBe("2026-05-02");
  });

  it("returns correct dates for February 2028 (leap year) with weekStartDay=0", () => {
    // February 2028: 1st is Tuesday, 29 days (leap year)
    const dates = getMonthGridDates(2028, 1, 0);
    // Should be multiple of 7
    expect(dates.length % 7).toBe(0);
    // First date should be a Sunday before or on Feb 1
    expect(dates[0].getDay()).toBe(0); // Sunday
    // February 29 should be in the grid
    const feb29 = dates.find(
      (d) => d.getMonth() === 1 && d.getDate() === 29 && d.getFullYear() === 2028,
    );
    expect(feb29).toBeDefined();
  });

  it("returns correct dates for January 2026 with weekStartDay=1 (Monday)", () => {
    // January 2026: 1st is Thursday
    // Grid should start on Monday Dec 29 2025
    const dates = getMonthGridDates(2026, 0, 1);
    expect(dates.length % 7).toBe(0);
    expect(getDateString(dates[0])).toBe("2025-12-29");
    expect(dates[0].getDay()).toBe(1); // Monday
  });

  it("always returns dates in multiples of 7", () => {
    // Test several months
    for (let month = 0; month < 12; month++) {
      const dates = getMonthGridDates(2026, month, 0);
      expect(dates.length % 7).toBe(0);
      expect([35, 42]).toContain(dates.length);
    }
  });

  it("returns 42 dates when needed (e.g., month spanning 6 weeks)", () => {
    // May 2026: 1st is Friday (weekStartDay=0)
    // Need 6 rows: Apr 26 to Jun 6
    const dates = getMonthGridDates(2026, 4, 0);
    expect(dates.length).toBe(42);
  });

  it("first date is always on the weekStartDay", () => {
    for (let weekStart = 0; weekStart < 7; weekStart++) {
      const dates = getMonthGridDates(2026, 3, weekStart);
      expect(dates[0].getDay()).toBe(weekStart);
    }
  });
});

// =============================================================================
// getMonthDateRange
// =============================================================================

describe("getMonthDateRange", () => {
  it("returns correct start/end dates matching getMonthGridDates boundaries", () => {
    const range = getMonthDateRange(2026, 3, 0); // April 2026, Sunday start
    expect(range.startDate).toBe("2026-03-29");
    expect(range.endDate).toBe("2026-05-02");
  });

  it("handles weekStartDay=1", () => {
    const range = getMonthDateRange(2026, 0, 1); // January 2026, Monday start
    expect(range.startDate).toBe("2025-12-29");
  });
});

// =============================================================================
// groupEventsByDate
// =============================================================================

describe("groupEventsByDate", () => {
  it("groups single-day events by start_date", () => {
    const events = [
      makeEvent({ id: "e1", start_date: "2026-04-01", end_date: "2026-04-01" }),
      makeEvent({ id: "e2", start_date: "2026-04-01", end_date: "2026-04-01" }),
      makeEvent({ id: "e3", start_date: "2026-04-02", end_date: "2026-04-02" }),
    ];

    const map = groupEventsByDate(events);
    expect(map.get("2026-04-01")?.length).toBe(2);
    expect(map.get("2026-04-02")?.length).toBe(1);
  });

  it("multi-day event appears in each date it spans", () => {
    const event = makeEvent({
      id: "e1",
      start_date: "2026-04-01",
      end_date: "2026-04-03",
    });

    const map = groupEventsByDate([event]);
    expect(map.get("2026-04-01")?.length).toBe(1);
    expect(map.get("2026-04-02")?.length).toBe(1);
    expect(map.get("2026-04-03")?.length).toBe(1);
    // Same event in all three
    expect(map.get("2026-04-01")?.[0].id).toBe("e1");
    expect(map.get("2026-04-02")?.[0].id).toBe("e1");
  });

  it("all-day events (start_time=null) sort before timed events", () => {
    const events = [
      makeEvent({
        id: "timed",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "10:00:00",
      }),
      makeEvent({
        id: "allday",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: null,
      }),
    ];

    const map = groupEventsByDate(events);
    const dayEvents = map.get("2026-04-01")!;
    expect(dayEvents[0].id).toBe("allday");
    expect(dayEvents[1].id).toBe("timed");
  });

  it("events within same day sorted by start_time ascending", () => {
    const events = [
      makeEvent({
        id: "late",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "15:00:00",
      }),
      makeEvent({
        id: "early",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "09:00:00",
      }),
      makeEvent({
        id: "mid",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "12:00:00",
      }),
    ];

    const map = groupEventsByDate(events);
    const dayEvents = map.get("2026-04-01")!;
    expect(dayEvents[0].id).toBe("early");
    expect(dayEvents[1].id).toBe("mid");
    expect(dayEvents[2].id).toBe("late");
  });

  it("returns empty map for empty input", () => {
    const map = groupEventsByDate([]);
    expect(map.size).toBe(0);
  });
});
