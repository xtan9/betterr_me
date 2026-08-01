import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RemindersDB } from "@/lib/db/reminders";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reminder } from "@/lib/db/types";

const USER_ID = "user-123";
const REMINDER_ID = "reminder-123";
const EVENT_ID = "event-456";

function makeReminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: REMINDER_ID,
    user_id: USER_ID,
    source_type: "calendar_event",
    source_id: EVENT_ID,
    reminder_type: "relative",
    relative_minutes: 15,
    absolute_time: null,
    channels: ["push"],
    status: "pending",
    fire_at: "2026-03-30T09:45:00Z",
    sent_at: null,
    created_at: "2026-03-25T10:00:00Z",
    ...over,
  };
}

describe("RemindersDB", () => {
  let db: RemindersDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new RemindersDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  describe("getRemindersBySource", () => {
    it("returns reminders filtered by user/source ordered by fire_at ascending", async () => {
      const rows = [
        makeReminder({ id: "r-1", fire_at: "2026-03-30T09:00:00Z" }),
        makeReminder({ id: "r-2", fire_at: "2026-03-30T10:00:00Z" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      await expect(
        db.getRemindersBySource(USER_ID, "calendar_event", EVENT_ID),
      ).resolves.toEqual(rows);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        { table: "reminders", method: "select", args: ["*"] },
        { table: "reminders", method: "eq", args: ["user_id", USER_ID] },
        {
          table: "reminders",
          method: "eq",
          args: ["source_type", "calendar_event"],
        },
        { table: "reminders", method: "eq", args: ["source_id", EVENT_ID] },
        {
          table: "reminders",
          method: "order",
          args: ["fire_at", { ascending: true }],
        },
      ]);
    });

    it("returns an empty array when data is null", async () => {
      await expect(
        db.getRemindersBySource(USER_ID, "task", "task-1"),
      ).resolves.toEqual([]);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("select failed"));
      await expect(
        db.getRemindersBySource(USER_ID, "calendar_event", EVENT_ID),
      ).rejects.toThrow("select failed");
    });
  });

  describe("getReminder", () => {
    it("returns one user-owned reminder", async () => {
      const expected = makeReminder();
      mockSupabaseClient.setMockResponse(expected);

      await expect(db.getReminder(USER_ID, REMINDER_ID)).resolves.toEqual(
        expected,
      );
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        { table: "reminders", method: "select", args: ["*"] },
        { table: "reminders", method: "eq", args: ["id", REMINDER_ID] },
        { table: "reminders", method: "eq", args: ["user_id", USER_ID] },
        { table: "reminders", method: "maybeSingle", args: [] },
      ]);
    });

    it("returns null when the reminder does not exist", async () => {
      await expect(db.getReminder(USER_ID, REMINDER_ID)).resolves.toBeNull();
    });
  });

  describe("getPendingReminders", () => {
    const BEFORE = "2026-03-30T10:00:00Z";

    it("returns every pending source, ordered by fire_at ascending", async () => {
      const rows = [
        makeReminder({ id: "p-1", fire_at: "2026-03-30T09:00:00Z" }),
        makeReminder({ id: "p-2", fire_at: "2026-03-30T09:45:00Z" }),
        makeReminder({ id: "p-3", source_type: "task" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      await expect(db.getPendingReminders(BEFORE)).resolves.toEqual(rows);
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        { table: "reminders", method: "select", args: ["*"] },
        { table: "reminders", method: "eq", args: ["status", "pending"] },
        { table: "reminders", method: "lte", args: ["fire_at", BEFORE] },
        {
          table: "reminders",
          method: "order",
          args: ["fire_at", { ascending: true }],
        },
      ]);
    });

    it("returns an empty array when data is null", async () => {
      await expect(db.getPendingReminders(BEFORE)).resolves.toEqual([]);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("db down"));
      await expect(db.getPendingReminders(BEFORE)).rejects.toThrow("db down");
    });
  });
});
