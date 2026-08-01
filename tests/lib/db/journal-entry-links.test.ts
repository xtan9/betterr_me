import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JournalEntryLinksDB } from "@/lib/db/journal-entry-links";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntryLink } from "@/lib/db/types";

// Silence + spy on logger — each error branch explicitly asserts log.error fired
// with scope prefix + context, so the error-path tests kill both the "log.error"
// call and the if-branch condition mutants.
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

const ENTRY_ID = "entry-123";
const LINK_ID = "link-123";

function makeLink(over: Partial<JournalEntryLink> = {}): JournalEntryLink {
  return {
    id: LINK_ID,
    entry_id: ENTRY_ID,
    link_type: "habit",
    link_id: "habit-456",
    created_at: "2026-02-22T10:00:00Z",
    ...over,
  };
}

describe("JournalEntryLinksDB", () => {
  let db: JournalEntryLinksDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new JournalEntryLinksDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  describe("getLinksForEntry", () => {
    it("returns links ordered by created_at ascending with full query chain", async () => {
      const rows = [
        makeLink({ id: "l-1", created_at: "2026-02-20T10:00:00Z" }),
        makeLink({ id: "l-2", created_at: "2026-02-21T10:00:00Z" }),
      ];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await db.getLinksForEntry(ENTRY_ID);

      expect(result).toEqual(rows);

      mockSupabaseClient.expectQuery({
        table: "journal_entry_links",
        method: "from",
        args: ["journal_entry_links"],
      });
      mockSupabaseClient.expectQuery({
        table: "journal_entry_links",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "journal_entry_links",
        method: "eq",
        args: ["entry_id", ENTRY_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "journal_entry_links",
        method: "order",
        args: ["created_at", { ascending: true }],
      });

      expect(log.error).not.toHaveBeenCalled();
    });

    it("returns empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getLinksForEntry(ENTRY_ID);

      expect(result).toEqual([]);
    });

    it("logs and throws on DB error — exact log message + context", async () => {
      const err = { message: "DB error" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(db.getLinksForEntry(ENTRY_ID)).rejects.toEqual(err);

      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        "JournalEntryLinksDB.getLinksForEntry failed",
        err,
        { entryId: ENTRY_ID },
      );
    });
  });
});
