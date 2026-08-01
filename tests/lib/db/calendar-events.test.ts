import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarEventsDB } from "@/lib/db/calendar-events";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "@/lib/db/types";

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const USER_ID = "user-123";
const EVENT_ID = "event-123";
const START_DATE = "2026-03-01";
const END_DATE = "2026-03-31";

function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: EVENT_ID,
    user_id: USER_ID,
    title: "Team Meeting",
    description: "Weekly sync",
    start_date: "2026-03-30",
    start_time: "10:00:00",
    end_date: "2026-03-30",
    end_time: "11:00:00",
    location: "Conference Room A",
    color: "#4285f4",
    category_id: null,
    is_recurring: false,
    recurrence_rule: null,
    end_type: null,
    end_date_recurrence: null,
    end_count: null,
    recurring_event_id: null,
    original_date: null,
    is_exception: false,
    created_at: "2026-03-25T10:00:00Z",
    updated_at: "2026-03-25T10:00:00Z",
    ...over,
  };
}

describe("CalendarEventsDB query-only persistence", () => {
  let db: CalendarEventsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new CalendarEventsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => restoreMockSupabaseThen());

  describe("getUserEvents", () => {
    const orFilter = `and(start_date.lte.${END_DATE},end_date.gte.${START_DATE},is_recurring.eq.false,is_exception.eq.false),and(is_recurring.eq.true,start_date.lte.${END_DATE}),and(is_exception.eq.true)`;

    it("fetches the owner-scoped date range with recurrence filters and ordering", async () => {
      const events = [makeEvent()];
      queueThenResponses([{ data: events, error: null }]);

      await expect(db.getUserEvents(USER_ID, START_DATE, END_DATE)).resolves.toEqual(events);

      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "from", args: ["calendar_events"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "select", args: ["*"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["user_id", USER_ID] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "or", args: [orFilter] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "order", args: ["start_date", { ascending: true }] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "order", args: ["start_time", { ascending: true }] });
    });

    it("returns an empty array for no rows and propagates query failures", async () => {
      queueThenResponses([{ data: null, error: null }]);
      await expect(db.getUserEvents(USER_ID, START_DATE, END_DATE)).resolves.toEqual([]);

      queueThenResponses([{ data: null, error: new Error("DB error") }]);
      await expect(db.getUserEvents(USER_ID, START_DATE, END_DATE)).rejects.toThrow("DB error");
    });

    it("embeds the supplied range in the filter", async () => {
      const alternate = `and(start_date.lte.2026-05-31,end_date.gte.2026-05-01,is_recurring.eq.false,is_exception.eq.false),and(is_recurring.eq.true,start_date.lte.2026-05-31),and(is_exception.eq.true)`;
      queueThenResponses([{ data: [], error: null }]);

      await db.getUserEvents(USER_ID, "2026-05-01", "2026-05-31");
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "or", args: [alternate] });
    });
  });

  describe("getEvent", () => {
    it("fetches one event by owner and id", async () => {
      const event = makeEvent();
      mockSupabaseClient.setMockResponse(event);

      await expect(db.getEvent(EVENT_ID, USER_ID)).resolves.toEqual(event);
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "from", args: ["calendar_events"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "select", args: ["*"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["id", EVENT_ID] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["user_id", USER_ID] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "single", args: [] });
    });

    it("maps PGRST116 to null and propagates other errors", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });
      await expect(db.getEvent("missing", USER_ID)).resolves.toBeNull();

      mockSupabaseClient.setMockResponse(null, { code: "OTHER_ERROR", message: "DB error" });
      await expect(db.getEvent(EVENT_ID, USER_ID)).rejects.toEqual({ code: "OTHER_ERROR", message: "DB error" });
    });
  });

  describe("getRecurringEvents", () => {
    it("fetches owner-scoped recurring events in date order", async () => {
      const events = [makeEvent({ is_recurring: true })];
      queueThenResponses([{ data: events, error: null }]);

      await expect(db.getRecurringEvents(USER_ID)).resolves.toEqual(events);
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "from", args: ["calendar_events"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "select", args: ["*"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["user_id", USER_ID] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["is_recurring", true] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "order", args: ["start_date", { ascending: true }] });
    });

    it("returns an empty array and propagates errors", async () => {
      queueThenResponses([{ data: null, error: null }]);
      await expect(db.getRecurringEvents(USER_ID)).resolves.toEqual([]);

      queueThenResponses([{ data: null, error: new Error("select failed") }]);
      await expect(db.getRecurringEvents(USER_ID)).rejects.toThrow("select failed");
    });
  });

  describe("getExceptions", () => {
    it("fetches owner-scoped exceptions for a recurring parent", async () => {
      const events = [makeEvent({ is_exception: true, recurring_event_id: "parent-123" })];
      queueThenResponses([{ data: events, error: null }]);

      await expect(db.getExceptions(USER_ID, "parent-123")).resolves.toEqual(events);
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "from", args: ["calendar_events"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "select", args: ["*"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["user_id", USER_ID] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["recurring_event_id", "parent-123"] });
      mockSupabaseClient.expectQuery({ table: "calendar_events", method: "eq", args: ["is_exception", true] });
    });

    it("returns an empty array and propagates errors", async () => {
      queueThenResponses([{ data: null, error: null }]);
      await expect(db.getExceptions(USER_ID, "parent-123")).resolves.toEqual([]);

      queueThenResponses([{ data: null, error: new Error("exceptions query failed") }]);
      await expect(db.getExceptions(USER_ID, "parent-123")).rejects.toThrow("exceptions query failed");
    });
  });
});
