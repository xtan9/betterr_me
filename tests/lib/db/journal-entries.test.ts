import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JournalEntriesDB } from "@/lib/db/journal-entries";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  JournalEntry,
  JournalCalendarDay,
} from "@/lib/db/types";

// Mock logger so we can assert exact args for error paths (Stryker loves
// mutating log.error message strings and context objects).
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

const USER_ID = "user-123";
const ENTRY_ID = "entry-123";

function makeEntry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: ENTRY_ID,
    user_id: USER_ID,
    entry_date: "2026-02-22",
    title: "Test Entry",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      ],
    },
    mood: 4,
    word_count: 1,
    tags: ["test"],
    prompt_key: null,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
    ...over,
  };
}

describe("JournalEntriesDB", () => {
  let db: JournalEntriesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new JournalEntriesDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getEntryByDate ───────────────────────────────────────────────────────
  describe("getEntryByDate", () => {
    const DATE = "2026-02-22";

    it("returns the entry for the given user + date", async () => {
      const expected = makeEntry();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.getEntryByDate(USER_ID, DATE);

      expect(result).toEqual(expected);

      // Full ordered chain — each phase is asserted to catch string/arg
      // mutations (table name, select *, eq cols).
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        { table: "journal_entries", method: "select", args: ["*"] },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["entry_date", DATE],
        },
        { table: "journal_entries", method: "maybeSingle", args: [] },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("returns null when no entry exists for that date", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getEntryByDate(USER_ID, DATE);

      expect(result).toBeNull();
      expect(log.error).not.toHaveBeenCalled();
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("select failed");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(db.getEntryByDate(USER_ID, DATE)).rejects.toThrow(
        "select failed",
      );

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getEntryByDate failed",
        dbErr,
        { date: DATE },
      );
    });
  });

  // ─── getEntry ─────────────────────────────────────────────────────────────
  describe("getEntry", () => {
    it("returns the entry when found", async () => {
      const expected = makeEntry();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.getEntry(ENTRY_ID, USER_ID);

      expect(result).toEqual(expected);

      // Full chain catches table/select/eq-column mutations.
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        { table: "journal_entries", method: "select", args: ["*"] },
        {
          table: "journal_entries",
          method: "eq",
          args: ["id", ENTRY_ID],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "journal_entries", method: "single", args: [] },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("returns null when the error code is PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getEntry("nonexistent", USER_ID);

      expect(result).toBeNull();
      // PGRST116 must NOT trigger log.error — it's the "not found" sentinel.
      expect(log.error).not.toHaveBeenCalled();
    });

    it("logs and throws on non-PGRST116 errors", async () => {
      const dbErr = { code: "OTHER", message: "select failed" };
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(db.getEntry(ENTRY_ID, USER_ID)).rejects.toEqual(dbErr);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getEntry failed",
        dbErr,
        { entryId: ENTRY_ID },
      );
    });
  });

  // ─── deleteEntry ──────────────────────────────────────────────────────────
  describe("deleteEntry", () => {
    it("deletes the entry scoped by id + user", async () => {
      // delete builder is thenable-terminal; setMockResponse with no error
      // makes the awaited destructure return { error: null }.
      mockSupabaseClient.setMockResponse(null);

      await db.deleteEntry(ENTRY_ID, USER_ID);

      // Full chain: from → delete() → eq(id) → eq(user_id).
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        { table: "journal_entries", method: "delete", args: [] },
        {
          table: "journal_entries",
          method: "eq",
          args: ["id", ENTRY_ID],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("FK constraint");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(db.deleteEntry(ENTRY_ID, USER_ID)).rejects.toThrow(
        "FK constraint",
      );

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.deleteEntry failed",
        dbErr,
        { entryId: ENTRY_ID },
      );
    });
  });

  // ─── getCalendarMonth ─────────────────────────────────────────────────────
  describe("getCalendarMonth", () => {
    it("queries entries for a 31-day month (December)", async () => {
      const rows: JournalCalendarDay[] = [
        { entry_date: "2026-12-01", mood: 4, title: "Day 1" },
        { entry_date: "2026-12-31", mood: 3, title: "Day 31" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getCalendarMonth(USER_ID, 2026, 12);

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        {
          table: "journal_entries",
          method: "select",
          args: ["entry_date, mood, title"],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "gte",
          args: ["entry_date", "2026-12-01"],
        },
        {
          table: "journal_entries",
          method: "lte",
          args: ["entry_date", "2026-12-31"],
        },
        {
          table: "journal_entries",
          method: "order",
          args: ["entry_date", { ascending: true }],
        },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("zero-pads single-digit months in the date range", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getCalendarMonth(USER_ID, 2026, 3);

      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["entry_date", "2026-03-01"],
      });
      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["entry_date", "2026-03-31"],
      });
    });

    it("uses 30 as the last day for April", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getCalendarMonth(USER_ID, 2026, 4);

      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["entry_date", "2026-04-01"],
      });
      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["entry_date", "2026-04-30"],
      });
    });

    it("uses 28 as last day for February in a non-leap year", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getCalendarMonth(USER_ID, 2026, 2);

      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["entry_date", "2026-02-28"],
      });
    });

    it("uses 29 as last day for February in a leap year", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getCalendarMonth(USER_ID, 2028, 2);

      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["entry_date", "2028-02-29"],
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getCalendarMonth(USER_ID, 2026, 3);

      expect(result).toEqual([]);
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("select failed");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(db.getCalendarMonth(USER_ID, 2026, 2)).rejects.toThrow(
        "select failed",
      );

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getCalendarMonth failed",
        dbErr,
        { year: 2026, month: 2 },
      );
    });
  });

  // ─── getTimeline ──────────────────────────────────────────────────────────
  describe("getTimeline", () => {
    it("returns entries ordered DESC with the given limit and no cursor", async () => {
      const rows = [makeEntry()];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getTimeline(USER_ID, 10);

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        { table: "journal_entries", method: "select", args: ["*"] },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "order",
          args: ["entry_date", { ascending: false }],
        },
        { table: "journal_entries", method: "limit", args: [10] },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("uses the default limit (10) when none is passed", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getTimeline(USER_ID);

      mockSupabaseClient.expectQuery({ method: "limit", args: [10] });
    });

    it("applies .lt('entry_date', cursor) when a cursor is provided", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getTimeline(USER_ID, 5, "2026-02-01");

      // Full chain including the cursor filter.
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        { table: "journal_entries", method: "select", args: ["*"] },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "order",
          args: ["entry_date", { ascending: false }],
        },
        { table: "journal_entries", method: "limit", args: [5] },
        {
          table: "journal_entries",
          method: "lt",
          args: ["entry_date", "2026-02-01"],
        },
      ]);
    });

    it("does NOT call .lt when cursor is undefined", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getTimeline(USER_ID, 10);

      // Absence of `lt` proves the `if (cursor)` branch did not execute.
      const ltCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "lt",
      );
      expect(ltCalls).toHaveLength(0);
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getTimeline(USER_ID);

      expect(result).toEqual([]);
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("timeline failed");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(db.getTimeline(USER_ID)).rejects.toThrow("timeline failed");

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getTimeline failed",
        dbErr,
      );
    });
  });

  // ─── getRecentEntryDates ──────────────────────────────────────────────────
  describe("getRecentEntryDates", () => {
    const BEFORE = "2026-04-17";

    it("returns the flattened entry_date strings in DESC order", async () => {
      const rows = [
        { entry_date: "2026-04-16" },
        { entry_date: "2026-04-10" },
        { entry_date: "2026-04-01" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getRecentEntryDates(USER_ID, BEFORE, 50);

      // Exact value + order — catches `.map(() => undefined)` and
      // `data || ["Stryker was here"]` mutants.
      expect(result).toEqual(["2026-04-16", "2026-04-10", "2026-04-01"]);

      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        {
          table: "journal_entries",
          method: "select",
          args: ["entry_date"],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "lte",
          args: ["entry_date", BEFORE],
        },
        {
          table: "journal_entries",
          method: "order",
          args: ["entry_date", { ascending: false }],
        },
        { table: "journal_entries", method: "limit", args: [50] },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("uses the default limit (400) when none is passed", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getRecentEntryDates(USER_ID, BEFORE);

      mockSupabaseClient.expectQuery({ method: "limit", args: [400] });
    });

    it("returns an empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getRecentEntryDates(USER_ID, BEFORE);

      expect(result).toEqual([]);
    });

    it("returns an empty array when data is an empty array", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await db.getRecentEntryDates(USER_ID, BEFORE);

      expect(result).toEqual([]);
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("dates failed");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(
        db.getRecentEntryDates(USER_ID, BEFORE),
      ).rejects.toThrow("dates failed");

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getRecentEntryDates failed",
        dbErr,
        { beforeDate: BEFORE },
      );
    });
  });

  // ─── getEntriesForDates ───────────────────────────────────────────────────
  describe("getEntriesForDates", () => {
    const DATES = ["2026-04-17", "2025-04-17", "2024-04-17"];

    it("returns [] and does NOT query the DB when dates is empty", async () => {
      const result = await db.getEntriesForDates(USER_ID, []);

      expect(result).toEqual([]);
      // No supabase call should be made at all.
      expect(mockSupabaseClient.queryLog).toEqual([]);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it("fetches entries for the provided dates in DESC order", async () => {
      const rows = [
        makeEntry({ id: "e1", entry_date: "2026-04-17" }),
        makeEntry({ id: "e2", entry_date: "2025-04-17" }),
        makeEntry({ id: "e3", entry_date: "2024-04-17" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getEntriesForDates(USER_ID, DATES);

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "journal_entries",
          method: "from",
          args: ["journal_entries"],
        },
        {
          table: "journal_entries",
          method: "select",
          args: [
            "id, entry_date, mood, title, content, word_count, user_id, tags, prompt_key, created_at, updated_at",
          ],
        },
        {
          table: "journal_entries",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "journal_entries",
          method: "in",
          args: ["entry_date", DATES],
        },
        {
          table: "journal_entries",
          method: "order",
          args: ["entry_date", { ascending: false }],
        },
      ]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getEntriesForDates(USER_ID, DATES);

      expect(result).toEqual([]);
    });

    it("logs and throws on db error", async () => {
      const dbErr = new Error("fetch for dates failed");
      mockSupabaseClient.setMockResponse(null, dbErr);

      await expect(
        db.getEntriesForDates(USER_ID, DATES),
      ).rejects.toThrow("fetch for dates failed");

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntriesDB.getEntriesForDates failed",
        dbErr,
        { dates: DATES },
      );
    });
  });
});
