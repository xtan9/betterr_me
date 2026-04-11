import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatMemoriesDB } from "@/lib/db/chat-memories";
import { mockSupabaseClient } from "../../setup";
import type { ChatMemory } from "@/lib/db/chat-memories";

describe("ChatMemoriesDB", () => {
  let db: ChatMemoriesDB;
  const mockUserId = "user-123";
  const mockMemory: ChatMemory = {
    id: "mem-1",
    user_id: mockUserId,
    path: "/memories/prefs.md",
    content: "favorite color: blue",
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = new ChatMemoriesDB(mockSupabaseClient as any);
  });

  describe("list", () => {
    it("returns memories ordered by path", async () => {
      mockSupabaseClient.setMockResponse([mockMemory]);
      const result = await db.list(mockUserId);
      expect(result).toEqual([mockMemory]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("chat_memories");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
    });

    it("returns empty array when no data", async () => {
      mockSupabaseClient.setMockResponse(null);
      const result = await db.list(mockUserId);
      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("DB error"));
      await expect(db.list(mockUserId)).rejects.toThrow("DB error");
    });
  });

  describe("get", () => {
    it("returns a single memory by path", async () => {
      mockSupabaseClient.setMockResponse(mockMemory);
      const result = await db.get(mockUserId, "/memories/prefs.md");
      expect(result).toEqual(mockMemory);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("path", "/memories/prefs.md");
    });

    it("returns null when not found", async () => {
      mockSupabaseClient.setMockResponse(null);
      const result = await db.get(mockUserId, "/memories/missing.md");
      expect(result).toBeNull();
    });
  });

  describe("upsert", () => {
    it("upserts with correct onConflict constraint", async () => {
      mockSupabaseClient.setMockResponse(mockMemory);
      const result = await db.upsert(mockUserId, "/memories/prefs.md", "new content");
      expect(result).toEqual(mockMemory);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("chat_memories");
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          path: "/memories/prefs.md",
          content: "new content",
        }),
        { onConflict: "user_id,path" },
      );
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("upsert failed"));
      await expect(
        db.upsert(mockUserId, "/memories/prefs.md", "content"),
      ).rejects.toThrow("upsert failed");
    });
  });

  describe("delete", () => {
    it("deletes by user_id and path", async () => {
      mockSupabaseClient.setMockResponse(null);
      await db.delete(mockUserId, "/memories/prefs.md");
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("chat_memories");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("path", "/memories/prefs.md");
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("delete failed"));
      await expect(db.delete(mockUserId, "/memories/prefs.md")).rejects.toThrow(
        "delete failed",
      );
    });
  });

  describe("rename", () => {
    it("updates path from old to new", async () => {
      mockSupabaseClient.setMockResponse(null);
      await db.rename(mockUserId, "/memories/old.md", "/memories/new.md");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/memories/new.md" }),
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("path", "/memories/old.md");
    });
  });
});
