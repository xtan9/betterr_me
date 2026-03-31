import { describe, it, expect } from "vitest";
import {
  expandEventsForRange,
  type ExpandedCalendarEvent,
} from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

/** Helper to create a minimal CalendarEvent for testing */
function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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
    ...overrides,
  };
}

describe("expandEventsForRange", () => {
  // Case 1: Standalone events pass through unchanged
  it("passes through standalone events with is_virtual=false", () => {
    const event = makeEvent({
      id: "e1",
      start_date: "2026-04-01",
      end_date: "2026-04-01",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(1);
    expect(result[0].is_virtual).toBe(false);
    expect(result[0].id).toBe("e1");
    expect(result[0].title).toBe("Test Event");
  });

  // Case 2: Recurring daily event expands to virtual occurrences
  it("expands a daily recurring event into virtual occurrences", () => {
    const event = makeEvent({
      id: "r1",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "never",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-03");
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.is_virtual)).toBe(true);
    expect(result.map((e) => e.id)).toEqual([
      "r1_2026-04-01",
      "r1_2026-04-02",
      "r1_2026-04-03",
    ]);
    expect(result.every((e) => e.recurring_event_id === "r1")).toBe(true);
  });

  // Case 3: end_type 'on_date' limits expansion
  it("limits expansion with end_type on_date", () => {
    const event = makeEvent({
      id: "r2",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "on_date",
      end_date_recurrence: "2026-04-05",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-10");
    expect(result).toHaveLength(5);
    expect(result.map((e) => e.start_date)).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
  });

  // Case 4: end_type 'after_count' limits to N total occurrences
  it("limits expansion with end_type after_count", () => {
    const event = makeEvent({
      id: "r3",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "after_count",
      end_count: 3,
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-10");
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.start_date)).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ]);
  });

  // Case 5: after_count with range starting after some occurrences
  it("handles after_count when range starts after some occurrences", () => {
    const event = makeEvent({
      id: "r4",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "after_count",
      end_count: 5,
    });
    const result = expandEventsForRange([event], "2026-04-03", "2026-04-10");
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.start_date)).toEqual([
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
  });

  // Case 6: Exception suppresses virtual occurrence and replaces it
  it("replaces a virtual occurrence with an exception record", () => {
    const parent = makeEvent({
      id: "r1",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "never",
    });
    const exception = makeEvent({
      id: "exc1",
      title: "Modified",
      is_recurring: false,
      is_exception: true,
      recurring_event_id: "r1",
      original_date: "2026-04-02",
      start_date: "2026-04-02",
      end_date: "2026-04-02",
    });
    const result = expandEventsForRange(
      [parent, exception],
      "2026-04-01",
      "2026-04-03"
    );
    expect(result).toHaveLength(3);

    // First: virtual 04-01
    expect(result[0].id).toBe("r1_2026-04-01");
    expect(result[0].is_virtual).toBe(true);

    // Second: exception for 04-02 (not virtual)
    expect(result[1].id).toBe("exc1");
    expect(result[1].is_virtual).toBe(false);
    expect(result[1].title).toBe("Modified");

    // Third: virtual 04-03
    expect(result[2].id).toBe("r1_2026-04-03");
    expect(result[2].is_virtual).toBe(true);
  });

  // Case 7: Exception moved to different date
  it("handles exceptions moved to a different date", () => {
    const parent = makeEvent({
      id: "r1",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "never",
    });
    const exception = makeEvent({
      id: "exc2",
      title: "Moved Event",
      is_recurring: false,
      is_exception: true,
      recurring_event_id: "r1",
      original_date: "2026-04-02",
      start_date: "2026-04-05",
      end_date: "2026-04-05",
    });
    const result = expandEventsForRange(
      [parent, exception],
      "2026-04-01",
      "2026-04-05"
    );

    // 04-01 virtual, 04-02 suppressed (no occurrence), 04-03 virtual, 04-04 virtual, 04-05 exception (moved here)
    expect(result).toHaveLength(4);

    const dates = result.map((e) => e.start_date);
    expect(dates).toEqual([
      "2026-04-01",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);

    // The event at 04-05 should be the exception, not a virtual
    const movedEvent = result.find((e) => e.start_date === "2026-04-05");
    expect(movedEvent!.id).toBe("exc2");
    expect(movedEvent!.is_virtual).toBe(false);
    expect(movedEvent!.title).toBe("Moved Event");
  });

  // Case 7b: Exception moved outside range still suppresses original date
  it("suppresses virtual occurrence even when exception is outside range", () => {
    const parent = makeEvent({
      id: "r1",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "never",
    });
    const exception = makeEvent({
      id: "exc3",
      is_recurring: false,
      is_exception: true,
      recurring_event_id: "r1",
      original_date: "2026-04-02",
      start_date: "2026-04-15", // Outside the query range
      end_date: "2026-04-15",
    });
    const result = expandEventsForRange(
      [parent, exception],
      "2026-04-01",
      "2026-04-03"
    );

    // 04-02 should be suppressed even though exception is at 04-15
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.start_date)).toEqual([
      "2026-04-01",
      "2026-04-03",
    ]);
  });

  // Case 8: Multi-day recurring event preserves duration
  it("preserves duration for multi-day recurring events", () => {
    const event = makeEvent({
      id: "r5",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-03", // 3-day event (2 day span)
      recurrence_rule: {
        frequency: "weekly",
        interval: 1,
        days_of_week: [3], // Wednesday (04-01 is a Wednesday)
      },
      end_type: "never",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-15");

    // Should have occurrences on Wed Apr 1, Wed Apr 8
    expect(result.length).toBeGreaterThanOrEqual(2);

    // First occurrence: Apr 1 - Apr 3
    const first = result[0];
    expect(first.start_date).toBe("2026-04-01");
    expect(first.end_date).toBe("2026-04-03");

    // Second occurrence: Apr 8 - Apr 10
    const second = result[1];
    expect(second.start_date).toBe("2026-04-08");
    expect(second.end_date).toBe("2026-04-10");
  });

  // Case 9: Empty input returns empty output
  it("returns empty array for empty input", () => {
    const result = expandEventsForRange([], "2026-04-01", "2026-04-30");
    expect(result).toEqual([]);
  });

  // Case 10: Recurring parent without recurrence_rule is skipped
  it("skips recurring events without a recurrence_rule", () => {
    const event = makeEvent({
      id: "r-bad",
      is_recurring: true,
      recurrence_rule: null,
      end_type: "never",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-30");
    expect(result).toEqual([]);
  });

  // Case 11: Sorting by start_date then start_time
  it("sorts results by start_date then start_time", () => {
    const events = [
      makeEvent({
        id: "e2",
        start_date: "2026-04-03",
        end_date: "2026-04-03",
        start_time: "14:00:00",
      }),
      makeEvent({
        id: "e1",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "09:00:00",
      }),
      makeEvent({
        id: "e3",
        start_date: "2026-04-01",
        end_date: "2026-04-01",
        start_time: "15:00:00",
      }),
    ];
    const result = expandEventsForRange(events, "2026-04-01", "2026-04-30");
    expect(result.map((e) => e.id)).toEqual(["e1", "e3", "e2"]);
  });

  // Case 12: Weekly recurring with interval > 1
  it("expands weekly recurring events with interval 2", () => {
    const event = makeEvent({
      id: "r6",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: {
        frequency: "weekly",
        interval: 2,
        days_of_week: [3], // Wednesday
      },
      end_type: "never",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-30");

    // Apr 1 (Wed), skip Apr 8, Apr 15 (Wed), skip Apr 22, Apr 29 (Wed)
    expect(result.map((e) => e.start_date)).toEqual([
      "2026-04-01",
      "2026-04-15",
      "2026-04-29",
    ]);
  });

  // Case 13: Standalone event outside range is excluded
  it("excludes standalone events outside the query range", () => {
    const event = makeEvent({
      id: "e-out",
      start_date: "2026-05-01",
      end_date: "2026-05-01",
    });
    const result = expandEventsForRange([event], "2026-04-01", "2026-04-30");
    expect(result).toEqual([]);
  });

  // Case 14: Multiple exceptions for same parent
  it("handles multiple exceptions for the same recurring parent", () => {
    const parent = makeEvent({
      id: "r1",
      is_recurring: true,
      start_date: "2026-04-01",
      end_date: "2026-04-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      end_type: "never",
    });
    const exc1 = makeEvent({
      id: "exc-a",
      title: "Exception A",
      is_exception: true,
      recurring_event_id: "r1",
      original_date: "2026-04-02",
      start_date: "2026-04-02",
      end_date: "2026-04-02",
    });
    const exc2 = makeEvent({
      id: "exc-b",
      title: "Exception B",
      is_exception: true,
      recurring_event_id: "r1",
      original_date: "2026-04-04",
      start_date: "2026-04-04",
      end_date: "2026-04-04",
    });
    const result = expandEventsForRange(
      [parent, exc1, exc2],
      "2026-04-01",
      "2026-04-05"
    );
    expect(result).toHaveLength(5);

    // 04-01: virtual, 04-02: exc-a, 04-03: virtual, 04-04: exc-b, 04-05: virtual
    expect(result[0].is_virtual).toBe(true);
    expect(result[1].id).toBe("exc-a");
    expect(result[1].is_virtual).toBe(false);
    expect(result[2].is_virtual).toBe(true);
    expect(result[3].id).toBe("exc-b");
    expect(result[3].is_virtual).toBe(false);
    expect(result[4].is_virtual).toBe(true);
  });
});
