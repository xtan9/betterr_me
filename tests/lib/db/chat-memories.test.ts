import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatMemoriesDB } from "@/lib/db/chat-memories";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMemory } from "@/lib/db/chat-memories";

const USER_ID = "user-123";
const PATH = "/memories/prefs.md";
const FROZEN_NOW = "2026-04-17T12:00:00.000Z";

function makeMemory(over: Partial<ChatMemory> = {}): ChatMemory {
  return {
    id: "mem-1",
    user_id: USER_ID,
    path: PATH,
    content: "favorite color: blue",
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
    ...over,
  };
}

describe("ChatMemoriesDB", () => {
  let db: ChatMemoriesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ChatMemoriesDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── list ─────────────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns memories ordered by path ascending, asserting full query chain", async () => {
      const rows = [makeMemory({ path: "/a.md" }), makeMemory({ path: "/b.md" })];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await db.list(USER_ID);

      expect(result).toEqual(rows);

      // Full SELECT chain: from → select("*") → eq(user_id, USER_ID) → order(path, asc).
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "from",
        args: ["chat_memories"],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "order",
        args: ["path", { ascending: true }],
      });
    });

    it("returns an empty array when data is null (no rows)", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.list(USER_ID);

      expect(result).toEqual([]);
    });

    it("throws when the select errors", async () => {
      queueThenResponses([{ data: null, error: new Error("DB error") }]);

      await expect(db.list(USER_ID)).rejects.toThrow("DB error");
    });
  });

  // ─── get ──────────────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a single memory by (user_id, path) via maybeSingle", async () => {
      const expected = makeMemory();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.get(USER_ID, PATH);

      expect(result).toEqual(expected);

      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "from",
        args: ["chat_memories"],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "eq",
        args: ["path", PATH],
      });
      mockSupabaseClient.expectQuery({
        table: "chat_memories",
        method: "maybeSingle",
        args: [],
      });
    });

    it("returns null when no matching row (maybeSingle → null)", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.get(USER_ID, "/memories/missing.md");

      expect(result).toBeNull();
    });

    it("throws when maybeSingle errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("get failed"));

      await expect(db.get(USER_ID, PATH)).rejects.toThrow("get failed");
    });
  });

  // ─── upsert ───────────────────────────────────────────────────────────────
  describe("upsert", () => {
    it("upserts the memory with exact row shape, onConflict, and frozen updated_at", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        const expected = makeMemory({
          content: "new content",
          updated_at: FROZEN_NOW,
        });
        mockSupabaseClient.setMockResponse(expected);

        const result = await db.upsert(USER_ID, PATH, "new content");

        expect(result).toEqual(expected);

        // Asserting the full queryLog catches any single-position mutation:
        // row shape, onConflict constraint, select(), or single().
        expect(mockSupabaseClient.queryLog).toEqual([
          {
            table: "chat_memories",
            method: "from",
            args: ["chat_memories"],
          },
          {
            table: "chat_memories",
            method: "upsert",
            args: [
              {
                user_id: USER_ID,
                path: PATH,
                content: "new content",
                updated_at: FROZEN_NOW,
              },
              { onConflict: "user_id,path" },
            ],
          },
          { table: "chat_memories", method: "select", args: [] },
          { table: "chat_memories", method: "single", args: [] },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws when the upsert errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("upsert failed"));

      await expect(db.upsert(USER_ID, PATH, "content")).rejects.toThrow(
        "upsert failed",
      );
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes by (user_id, path) with full query chain", async () => {
      queueThenResponses([{ data: null, error: null }]);

      await db.delete(USER_ID, PATH);

      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "chat_memories",
          method: "from",
          args: ["chat_memories"],
        },
        { table: "chat_memories", method: "delete", args: [] },
        {
          table: "chat_memories",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        { table: "chat_memories", method: "eq", args: ["path", PATH] },
      ]);
    });

    it("throws when the delete errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("delete failed") },
      ]);

      await expect(db.delete(USER_ID, PATH)).rejects.toThrow("delete failed");
    });
  });

  // ─── rename ───────────────────────────────────────────────────────────────
  describe("rename", () => {
    it("updates path + updated_at filtering by (user_id, oldPath)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        queueThenResponses([{ data: null, error: null }]);

        await db.rename(USER_ID, "/memories/old.md", "/memories/new.md");

        // Full log catches any arg-position mutation: new path in update,
        // old path in the eq filter, user_id filter, frozen timestamp.
        expect(mockSupabaseClient.queryLog).toEqual([
          {
            table: "chat_memories",
            method: "from",
            args: ["chat_memories"],
          },
          {
            table: "chat_memories",
            method: "update",
            args: [
              { path: "/memories/new.md", updated_at: FROZEN_NOW },
            ],
          },
          {
            table: "chat_memories",
            method: "eq",
            args: ["user_id", USER_ID],
          },
          {
            table: "chat_memories",
            method: "eq",
            args: ["path", "/memories/old.md"],
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws when the rename update errors", async () => {
      queueThenResponses([
        { data: null, error: new Error("rename failed") },
      ]);

      await expect(
        db.rename(USER_ID, "/memories/old.md", "/memories/new.md"),
      ).rejects.toThrow("rename failed");
    });
  });
});
