import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CalendarEventsDB } from "@/lib/db/calendar-events";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarEvent,
  CalendarEventInsert,
  CalendarEventUpdate,
} from "@/lib/db/types";

// Source uses no logger, but we still install a mock so accidental future
// log.* calls fail loud rather than pollute test output.
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

describe("CalendarEventsDB", () => {
  let db: CalendarEventsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new CalendarEventsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getUserEvents ────────────────────────────────────────────────────────
  describe("getUserEvents", () => {
    // The exact .or() filter string source uses. Mutating any part of this
    // changes observable behavior in production, so we assert on it literally.
    const OR_FILTER = `and(start_date.lte.${END_DATE},end_date.gte.${START_DATE},is_recurring.eq.false,is_exception.eq.false),and(is_recurring.eq.true,start_date.lte.${END_DATE}),and(is_exception.eq.true)`;

    it("fetches events in a date range with the full filter + ordering", async () => {
      const events = [makeEvent()];
      queueThenResponses([{ data: events, error: null }]);

      const result = await db.getUserEvents(USER_ID, START_DATE, END_DATE);

      expect(result).toEqual(events);

      // Single-phase method → full chain via expectQuery.
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      // The OR filter is highly specific — mutating any literal in the
      // template breaks this assertion.
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "or",
        args: [OR_FILTER],
      });
      // Two ordered clauses — both column + direction are asserted so
      // Stryker can't flip ascending:true→false silently.
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "order",
        args: ["start_date", { ascending: true }],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "order",
        args: ["start_time", { ascending: true }],
      });
    });

    it("returns an empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getUserEvents(USER_ID, START_DATE, END_DATE);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("DB error") },
      ]);

      await expect(
        db.getUserEvents(USER_ID, START_DATE, END_DATE),
      ).rejects.toThrow("DB error");
    });

    it("embeds the supplied endDate/startDate into the OR filter (catches reversed args)", async () => {
      const alt = `and(start_date.lte.2026-05-31,end_date.gte.2026-05-01,is_recurring.eq.false,is_exception.eq.false),and(is_recurring.eq.true,start_date.lte.2026-05-31),and(is_exception.eq.true)`;
      queueThenResponses([{ data: [], error: null }]);

      await db.getUserEvents(USER_ID, "2026-05-01", "2026-05-31");

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "or",
        args: [alt],
      });
    });
  });

  // ─── getEvent ─────────────────────────────────────────────────────────────
  describe("getEvent", () => {
    it("fetches a single event by id + user and asserts the full chain", async () => {
      const event = makeEvent();
      mockSupabaseClient.setMockResponse(event);

      const result = await db.getEvent(EVENT_ID, USER_ID);

      expect(result).toEqual(event);

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["id", EVENT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "single",
        args: [],
      });
    });

    it("returns null when PGRST116 (row not found) is raised", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getEvent("missing", USER_ID);

      expect(result).toBeNull();
    });

    it("throws when a non-PGRST116 error is raised", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "OTHER_ERROR",
        message: "DB error",
      });

      await expect(db.getEvent(EVENT_ID, USER_ID)).rejects.toEqual({
        code: "OTHER_ERROR",
        message: "DB error",
      });
    });
  });

  // ─── createEvent ──────────────────────────────────────────────────────────
  describe("createEvent", () => {
    const insertPayload: Omit<CalendarEventInsert, "user_id"> = {
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
    };

    it("inserts { ...event, user_id } and returns the new row", async () => {
      const expected = makeEvent();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.createEvent(USER_ID, insertPayload);

      expect(result).toEqual(expected);

      // The insert object literal is asserted in full — catches
      // ObjectLiteral mutations that drop the spread or user_id.
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "insert",
        args: [{ ...insertPayload, user_id: USER_ID }],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "single",
        args: [],
      });
    });

    it("throws when the insert fails", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("Insert error"));

      await expect(db.createEvent(USER_ID, insertPayload)).rejects.toThrow(
        "Insert error",
      );
    });
  });

  // ─── updateEvent ──────────────────────────────────────────────────────────
  describe("updateEvent", () => {
    const updates: CalendarEventUpdate = { title: "Updated Meeting" };

    it("updates and returns the row, scoped by id + user", async () => {
      const expected = makeEvent({ title: "Updated Meeting" });
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.updateEvent(EVENT_ID, USER_ID, updates);

      expect(result).toEqual(expected);

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "update",
        args: [updates],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["id", EVENT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "single",
        args: [],
      });
    });

    it("throws when the update fails", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("Update error"));

      await expect(
        db.updateEvent(EVENT_ID, USER_ID, { title: "New" }),
      ).rejects.toThrow("Update error");
    });
  });

  // ─── deleteEvent ──────────────────────────────────────────────────────────
  describe("deleteEvent", () => {
    it("deletes the row scoped by id + user", async () => {
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteEvent(EVENT_ID, USER_ID);

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "delete",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["id", EVENT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("throws when the delete fails", async () => {
      queueThenResponses([
        { data: null, error: new Error("Delete error") },
      ]);

      await expect(db.deleteEvent(EVENT_ID, USER_ID)).rejects.toThrow(
        "Delete error",
      );
    });
  });

  // ─── getRecurringEvents ───────────────────────────────────────────────────
  describe("getRecurringEvents", () => {
    it("fetches recurring events for a user, ordered by start_date asc", async () => {
      const events = [makeEvent({ is_recurring: true })];
      queueThenResponses([{ data: events, error: null }]);

      const result = await db.getRecurringEvents(USER_ID);

      expect(result).toEqual(events);

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["is_recurring", true],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "order",
        args: ["start_date", { ascending: true }],
      });
    });

    it("returns an empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getRecurringEvents(USER_ID);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("select failed") },
      ]);

      await expect(db.getRecurringEvents(USER_ID)).rejects.toThrow(
        "select failed",
      );
    });
  });

  // ─── getExceptions ────────────────────────────────────────────────────────
  describe("getExceptions", () => {
    const RECURRING_ID = "parent-123";

    it("fetches exceptions scoped by user + recurring parent + is_exception=true", async () => {
      const events = [
        makeEvent({
          is_exception: true,
          recurring_event_id: RECURRING_ID,
        }),
      ];
      queueThenResponses([{ data: events, error: null }]);

      const result = await db.getExceptions(USER_ID, RECURRING_ID);

      expect(result).toEqual(events);

      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "from",
        args: ["calendar_events"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["recurring_event_id", RECURRING_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "calendar_events",
        method: "eq",
        args: ["is_exception", true],
      });
    });

    it("returns an empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getExceptions(USER_ID, RECURRING_ID);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("exceptions query failed") },
      ]);

      await expect(db.getExceptions(USER_ID, RECURRING_ID)).rejects.toThrow(
        "exceptions query failed",
      );
    });
  });
});
