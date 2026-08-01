import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RemindersDB } from "@/lib/db/reminders";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reminder, ReminderUpdate } from "@/lib/db/types";

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

  // ─── createReminder ─────────────────────────────────────────────────────────
  // ─── getRemindersBySource ───────────────────────────────────────────────────
  describe("getRemindersBySource", () => {
    it("returns reminders filtered by user/source ordered by fire_at ascending", async () => {
      const rows = [
        makeReminder({ id: "r-1", fire_at: "2026-03-30T09:00:00Z" }),
        makeReminder({ id: "r-2", fire_at: "2026-03-30T10:00:00Z" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getRemindersBySource(
        USER_ID,
        "calendar_event",
        EVENT_ID,
      );

      expect(result).toEqual(rows);

      // Assert every meaningful part of the chain — full positional log so
      // swapping ANY arg (e.g. ascending: true) is caught.
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
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getRemindersBySource(USER_ID, "task", "task-1");

      expect(result).toEqual([]);
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
      mockSupabaseClient.setMockResponse(null);

      await expect(db.getReminder(USER_ID, REMINDER_ID)).resolves.toBeNull();
    });
  });

  describe("transitionCalendarEventReminder", () => {
    it("calls the narrow delivery transition RPC", async () => {
      const expected = makeReminder({ status: "pending", fire_at: "2026-04-01T08:00:00Z" });
      const single = vi.fn().mockResolvedValue({ data: expected, error: null });
      const rpc = vi.fn().mockReturnValue({ single });
      const isolatedDb = new RemindersDB({ rpc } as never);

      await expect(
        isolatedDb.transitionCalendarEventReminder(USER_ID, REMINDER_ID, {
          status: "pending",
          fire_at: "2026-04-01T08:00:00Z",
        }),
      ).resolves.toEqual(expected);
      expect(rpc).toHaveBeenCalledWith("transition_calendar_event_reminder", {
        p_user_id: USER_ID,
        p_reminder_id: REMINDER_ID,
        p_status: "pending",
        p_fire_at: "2026-04-01T08:00:00Z",
        p_sent_at: null,
      });
      expect(single).toHaveBeenCalledOnce();
    });

    it("throws when the delivery transition RPC fails", async () => {
      const single = vi.fn().mockResolvedValue({ data: null, error: new Error("transition failed") });
      const rpc = vi.fn().mockReturnValue({ single });
      const isolatedDb = new RemindersDB({ rpc } as never);
      await expect(
        isolatedDb.transitionCalendarEventReminder(USER_ID, REMINDER_ID, { status: "sent" }),
      ).rejects.toThrow("transition failed");
    });
  });

  // ─── getPendingReminders ────────────────────────────────────────────────────
  describe("getPendingReminders", () => {
    const BEFORE = "2026-03-30T10:00:00Z";

    it("returns pending reminders with fire_at <= beforeTime, ordered ascending", async () => {
      const rows = [
        makeReminder({ id: "p-1", fire_at: "2026-03-30T09:00:00Z" }),
        makeReminder({ id: "p-2", fire_at: "2026-03-30T09:45:00Z" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getPendingReminders(BEFORE);

      expect(result).toEqual(rows);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        { table: "reminders", method: "select", args: ["*"] },
        { table: "reminders", method: "eq", args: ["status", "pending"] },
        {
          table: "reminders",
          method: "in",
          args: ["source_type", ["calendar_event", "task", "habit"]],
        },
        { table: "reminders", method: "lte", args: ["fire_at", BEFORE] },
        {
          table: "reminders",
          method: "order",
          args: ["fire_at", { ascending: true }],
        },
      ]);
    });

    it("returns an empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getPendingReminders(BEFORE);

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("db down"));

      await expect(db.getPendingReminders(BEFORE)).rejects.toThrow("db down");
    });
  });

  // ─── updateReminderStatus ───────────────────────────────────────────────────
  describe("updateReminderStatus", () => {
    it("sets status AND sent_at when sentAt is provided", async () => {
      const SENT_AT = "2026-03-30T09:45:00Z";
      const updated = makeReminder({ status: "sent", sent_at: SENT_AT });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateReminderStatus(
        USER_ID,
        REMINDER_ID,
        "sent",
        SENT_AT,
      );

      expect(result).toEqual(updated);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        {
          table: "reminders",
          method: "update",
          args: [{ status: "sent", sent_at: SENT_AT }],
        },
        { table: "reminders", method: "eq", args: ["id", REMINDER_ID] },
        { table: "reminders", method: "eq", args: ["user_id", USER_ID] },
        { table: "reminders", method: "select", args: [] },
        { table: "reminders", method: "single", args: [] },
      ]);
    });

    it("omits sent_at when sentAt is not provided", async () => {
      const updated = makeReminder({ status: "snoozed" });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateReminderStatus(
        USER_ID,
        REMINDER_ID,
        "snoozed",
      );

      expect(result).toEqual(updated);

      // The update payload must NOT include sent_at. Asserting on the exact
      // object kills mutants that flip `if (sentAt)` semantics.
      mockSupabaseClient.expectQuery({
        table: "reminders",
        method: "update",
        args: [{ status: "snoozed" }],
      });
    });

    it("omits sent_at when sentAt is an empty string (falsy)", async () => {
      // Guards against mutating `if (sentAt)` → `if (true)` — an empty string
      // is falsy, so sent_at must NOT be included.
      const updated = makeReminder({ status: "failed" });
      mockSupabaseClient.setMockResponse(updated);

      await db.updateReminderStatus(USER_ID, REMINDER_ID, "failed", "");

      mockSupabaseClient.expectQuery({
        table: "reminders",
        method: "update",
        args: [{ status: "failed" }],
      });
    });

    it("filters by reminderId AND userId (tenant isolation)", async () => {
      mockSupabaseClient.setMockResponse(makeReminder());

      await db.updateReminderStatus(USER_ID, REMINDER_ID, "sent");

      // Both .eq() calls matter — without both, one user could update
      // another user's reminder.
      mockSupabaseClient.expectQuery({
        table: "reminders",
        method: "eq",
        args: ["id", REMINDER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "reminders",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("throws when the update fails", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("update failed"));

      await expect(
        db.updateReminderStatus(USER_ID, REMINDER_ID, "sent"),
      ).rejects.toThrow("update failed");
    });
  });

  // ─── updateReminder ─────────────────────────────────────────────────────────
  describe("updateReminder", () => {
    it("applies the arbitrary update payload and returns the row", async () => {
      const payload: ReminderUpdate = {
        fire_at: "2026-04-01T08:00:00Z",
        channels: ["email", "push"],
      };
      const updated = makeReminder({
        fire_at: payload.fire_at!,
        channels: payload.channels!,
      });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateReminder(USER_ID, REMINDER_ID, payload);

      expect(result).toEqual(updated);

      // Full chain: from → update(payload) → eq id → eq user_id → select → single.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "reminders", method: "from", args: ["reminders"] },
        { table: "reminders", method: "update", args: [payload] },
        { table: "reminders", method: "eq", args: ["id", REMINDER_ID] },
        { table: "reminders", method: "eq", args: ["user_id", USER_ID] },
        { table: "reminders", method: "select", args: [] },
        { table: "reminders", method: "single", args: [] },
      ]);
    });

    it("passes the update object through as-is (no wrapping/mutation)", async () => {
      // Guards against mutants that wrap or spread the update payload.
      const payload: ReminderUpdate = { status: "sent" };
      mockSupabaseClient.setMockResponse(makeReminder({ status: "sent" }));

      await db.updateReminder(USER_ID, REMINDER_ID, payload);

      mockSupabaseClient.expectQuery({
        table: "reminders",
        method: "update",
        args: [payload],
      });
    });

    it("throws when the update fails", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("conflict"));

      await expect(
        db.updateReminder(USER_ID, REMINDER_ID, { status: "sent" }),
      ).rejects.toThrow("conflict");
    });
  });

  // ─── deleteReminder ─────────────────────────────────────────────────────────
  // ─── deleteRemindersBySource ────────────────────────────────────────────────
});
