import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JournalWrites,
  SupabaseJournalSavePersistence,
  type JournalEntryMutationRecord,
} from "@/lib/journal/writes";

const entryRow = {
  id: "entry-1",
  user_id: "user-1",
  entry_date: "2026-08-01",
  title: "Saved entry",
  content: { type: "doc", content: [] },
  mood: 4,
  word_count: 2,
  tags: ["reflection"],
  prompt_key: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:01:00.000Z",
};

const linkRow = {
  id: "link-1",
  entry_id: "entry-1",
  link_type: "habit" as const,
  link_id: "habit-1",
  created_at: "2026-08-01T12:00:00.000Z",
};

describe("SupabaseJournalSavePersistence", () => {
  const rpc = vi.fn();
  let persistence: SupabaseJournalSavePersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseJournalSavePersistence({ rpc } as never);
  });

  it("maps the atomic save RPC into a domain record without exposing row names", async () => {
    rpc.mockResolvedValue({
      data: { type: "created", entry: entryRow },
      error: null,
    });

    await expect(
      persistence.saveEntry({
        userId: "user-1",
        entryId: null,
        entryDate: "2026-08-01",
        changes: {
          title: "Saved entry",
          content: entryRow.content,
          mood: 4,
          wordCount: 2,
          tags: ["reflection"],
          promptKey: null,
        },
      }),
    ).resolves.toEqual({
      type: "created",
      entry: {
        id: "entry-1",
        userId: "user-1",
        entryDate: "2026-08-01",
        title: "Saved entry",
        content: entryRow.content,
        mood: 4,
        wordCount: 2,
        tags: ["reflection"],
        promptKey: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:01:00.000Z",
      } satisfies JournalEntryMutationRecord,
    });

    expect(rpc).toHaveBeenCalledWith("save_journal_entry", {
      p_user_id: "user-1",
      p_entry_id: null,
      p_entry_date: "2026-08-01",
      p_changes: {
        title: "Saved entry",
        content: entryRow.content,
        mood: 4,
        word_count: 2,
        tags: ["reflection"],
        prompt_key: null,
      },
    });
  });

  it.each([
    ["updated", { type: "updated" as const, entry: entryRow }],
    ["conflict", { type: "conflict" as const }],
    ["not-found", { type: "not-found" as const }],
  ])("preserves the %s database outcome", async (_label, outcome) => {
    rpc.mockResolvedValue({ data: outcome, error: null });

    await expect(
      persistence.saveEntry({
        userId: "user-1",
        entryId: "entry-1",
        entryDate: null,
        changes: { title: "Updated" },
      }),
    ).resolves.toMatchObject({ type: outcome.type });
  });

  it("throws infrastructure failures and malformed database outcomes", async () => {
    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });

    await expect(
      persistence.saveEntry({
        userId: "user-1",
        entryId: null,
        entryDate: "2026-08-01",
        changes: { title: "Entry" },
      }),
    ).rejects.toBe(failure);

    rpc.mockResolvedValue({
      data: { type: "updated", entry: { id: "entry-1" } },
      error: null,
    });
    await expect(
      persistence.saveEntry({
        userId: "user-1",
        entryId: "entry-1",
        entryDate: null,
        changes: { title: "Entry" },
      }),
    ).rejects.toThrow("Invalid journal entry");
  });

  it("preserves one entry identity when concurrent date saves resolve as create then update", async () => {
    rpc
      .mockResolvedValueOnce({
        data: { type: "created", entry: entryRow },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          type: "updated",
          entry: { ...entryRow, title: "Latest save" },
        },
        error: null,
      });
    const writes = new JournalWrites(persistence);

    const [first, second] = await Promise.all([
      writes.save({
        userId: "user-1",
        entryDate: "2026-08-01",
        title: "First save",
      }),
      writes.save({
        userId: "user-1",
        entryDate: "2026-08-01",
        title: "Latest save",
      }),
    ]);

    expect(first).toMatchObject({ type: "created", entry: { id: "entry-1" } });
    expect(second).toMatchObject({ type: "updated", entry: { id: "entry-1" } });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["habit", "task", "project"] as const)(
    "maps the ownership-aware %s link RPC into a domain record",
    async (linkType) => {
      rpc.mockResolvedValue({
        data: {
          type: "linked",
          link: { ...linkRow, link_type: linkType, link_id: `${linkType}-1` },
        },
        error: null,
      });

      await expect(
        persistence.linkEntry({
          userId: "user-1",
          entryId: "entry-1",
          linkType,
          targetId: `${linkType}-1`,
        }),
      ).resolves.toEqual({
        type: "linked",
        link: {
          id: "link-1",
          entryId: "entry-1",
          linkType,
          targetId: `${linkType}-1`,
          createdAt: "2026-08-01T12:00:00.000Z",
        },
      });

      expect(rpc).toHaveBeenCalledWith("link_journal_entry", {
        p_user_id: "user-1",
        p_entry_id: "entry-1",
        p_link_type: linkType,
        p_link_id: `${linkType}-1`,
      });
    },
  );

  it.each([
    ["already-applied", { type: "already-applied" as const, link: linkRow }],
    ["conflict", { type: "conflict" as const }],
    ["not-found", { type: "not-found" as const }],
  ])("preserves the %s link database outcome", async (_label, outcome) => {
    rpc.mockResolvedValue({ data: outcome, error: null });

    await expect(
      persistence.linkEntry({
        userId: "user-1",
        entryId: "entry-1",
        linkType: "habit",
        targetId: "habit-1",
      }),
    ).resolves.toMatchObject({ type: outcome.type });
  });

  it("maps an unlink RPC and propagates unexpected link failures", async () => {
    rpc.mockResolvedValueOnce({
      data: { type: "unlinked", link: linkRow },
      error: null,
    });

    await expect(
      persistence.unlinkEntry({
        userId: "user-1",
        entryId: "entry-1",
        linkId: "link-1",
      }),
    ).resolves.toEqual({
      type: "unlinked",
      link: {
        id: "link-1",
        entryId: "entry-1",
        linkType: "habit",
        targetId: "habit-1",
        createdAt: "2026-08-01T12:00:00.000Z",
      },
    });
    expect(rpc).toHaveBeenCalledWith("unlink_journal_entry", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_link_id: "link-1",
    });

    const failure = { code: "42P01", message: "function missing" };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(
      persistence.unlinkEntry({
        userId: "user-1",
        entryId: "entry-1",
        linkId: "link-1",
      }),
    ).rejects.toBe(failure);

    rpc.mockResolvedValue({
      data: { type: "unlinked", link: { id: "link-1" } },
      error: null,
    });
    await expect(
      persistence.unlinkEntry({
        userId: "user-1",
        entryId: "entry-1",
        linkId: "link-1",
      }),
    ).rejects.toThrow("Invalid journal link");
  });

  describe("deleteEntry", () => {
    it("uses one atomic owner-scoped RPC and maps a deleted outcome", async () => {
      rpc.mockResolvedValue({ data: { type: "deleted" }, error: null });

      await expect(
        persistence.deleteEntry({
          userId: "trusted-user",
          entryId: "entry-1",
        }),
      ).resolves.toEqual({ type: "deleted" });
      expect(rpc).toHaveBeenCalledWith("delete_journal_entry_atomically", {
        p_entry_id: "entry-1",
        p_user_id: "trusted-user",
      });
    });

    it.each(["missing", "repeated", "cross-owner"] as const)(
      "maps the same not-found database outcome for %s requests",
      async () => {
        rpc.mockResolvedValue({ data: { type: "not-found" }, error: null });

        await expect(
          persistence.deleteEntry({
            userId: "trusted-user",
            entryId: "entry-1",
          }),
        ).resolves.toEqual({ type: "not-found" });
        expect(rpc).toHaveBeenCalledTimes(1);
      },
    );

    it("propagates an atomic RPC failure without compensating writes", async () => {
      const persistenceError = new Error("deletion transaction failed");
      rpc.mockResolvedValue({ data: null, error: persistenceError });

      await expect(
        persistence.deleteEntry({
          userId: "trusted-user",
          entryId: "entry-1",
        }),
      ).rejects.toBe(persistenceError);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed database outcomes", async () => {
      rpc.mockResolvedValue({ data: { type: "unexpected" }, error: null });

      await expect(
        persistence.deleteEntry({
          userId: "trusted-user",
          entryId: "entry-1",
        }),
      ).rejects.toThrow("Invalid journal deletion outcome returned by the database");
    });
  });
});
