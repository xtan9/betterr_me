import { describe, expect, it, vi } from "vitest";
import {
  JournalWrites,
  toJournalEntryResponse,
  toJournalLinkResponse,
  type JournalEntryMutationRecord,
  type JournalLinkMutationRecord,
  type JournalSavePersistence,
} from "@/lib/journal/writes";

const createdEntry: JournalEntryMutationRecord = {
  id: "entry-1",
  userId: "user-1",
  entryDate: "2026-08-01",
  title: "First entry",
  content: { type: "doc", content: [] },
  mood: null,
  wordCount: 0,
  tags: [],
  promptKey: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const linkedRecord: JournalLinkMutationRecord = {
  id: "link-1",
  entryId: "entry-1",
  linkType: "habit",
  targetId: "habit-1",
  createdAt: "2026-08-01T12:00:00.000Z",
};

describe("JournalWrites.save", () => {
  it("maps the domain record back to the established HTTP/AI response shape", () => {
    expect(toJournalEntryResponse(createdEntry)).toEqual({
      id: "entry-1",
      user_id: "user-1",
      entry_date: "2026-08-01",
      title: "First entry",
      content: { type: "doc", content: [] },
      mood: null,
      word_count: 0,
      tags: [],
      prompt_key: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
  });

  it("creates a normalized entry through the storage-independent save seam", async () => {
    const saveEntry = vi.fn().mockResolvedValue({
      type: "created" as const,
      entry: createdEntry,
    });
    const persistence: JournalSavePersistence = { saveEntry };
    const writes = new JournalWrites(persistence);

    await expect(
      writes.save({
        userId: " user-1 ",
        entryDate: "2026-08-01",
        title: "  First entry  ",
        content: { type: "doc", content: [] },
        mood: null,
        wordCount: 0,
        tags: [],
        promptKey: null,
      }),
    ).resolves.toEqual({ type: "created", entry: createdEntry });

    expect(saveEntry).toHaveBeenCalledWith({
      userId: "user-1",
      entryId: null,
      entryDate: "2026-08-01",
      changes: {
        title: "First entry",
        content: { type: "doc", content: [] },
        mood: null,
        wordCount: 0,
        tags: [],
        promptKey: null,
      },
    });
  });

  it("updates only supplied fields and reports a missing owned entry", async () => {
    const saveEntry = vi.fn().mockResolvedValue({ type: "not-found" as const });
    const writes = new JournalWrites({ saveEntry });

    await expect(
      writes.save({
        userId: "user-1",
        entryId: "entry-missing",
        title: "  Updated title  ",
      }),
    ).resolves.toEqual({ type: "not-found" });

    expect(saveEntry).toHaveBeenCalledWith({
      userId: "user-1",
      entryId: "entry-missing",
      entryDate: null,
      changes: { title: "Updated title" },
    });
  });

  it("returns invalid without invoking persistence for malformed save requests", async () => {
    const saveEntry = vi.fn();
    const writes = new JournalWrites({ saveEntry });

    await expect(
      writes.save({
        userId: "user-1",
        entryDate: "2026-02-30",
        title: "Entry",
      }),
    ).resolves.toEqual({
      type: "invalid",
      field: "entryDate",
      message: "Entry date is invalid",
    });
    expect(saveEntry).not.toHaveBeenCalled();
  });

  it("normalizes shared text fields before either transport can persist them", async () => {
    const saveEntry = vi.fn().mockResolvedValue({ type: "updated" as const, entry: createdEntry });
    const writes = new JournalWrites({ saveEntry });

    await writes.save({
      userId: "user-1",
      entryId: "entry-1",
      title: "  Trimmed  ",
      tags: [" reflection ", "reflection", "  "],
      promptKey: "  daily  ",
    });

    expect(saveEntry).toHaveBeenCalledWith({
      userId: "user-1",
      entryId: "entry-1",
      entryDate: null,
      changes: {
        title: "Trimmed",
        tags: ["reflection"],
        promptKey: "daily",
      },
    });
  });

  it.each([
    ["conflict", { type: "conflict" as const }],
    ["not-found", { type: "not-found" as const }],
  ])("preserves the expected %s persistence outcome", async (_label, outcome) => {
    const writes = new JournalWrites({
      saveEntry: vi.fn().mockResolvedValue(outcome),
    });

    await expect(
      writes.save({
        userId: "user-1",
        entryDate: "2026-08-01",
        title: "Entry",
      }),
    ).resolves.toEqual(outcome);
  });
});

describe("JournalWrites.link", () => {
  it.each(["habit", "task", "project"] as const)(
    "normalizes a trusted %s link request before persistence",
    async (linkType) => {
      const linkEntry = vi.fn().mockResolvedValue({
        type: "linked" as const,
        link: { ...linkedRecord, linkType },
      });
      const writes = new JournalWrites({ linkEntry });

      await expect(
        writes.link({
          userId: " user-1 ",
          entryId: " entry-1 ",
          linkType,
          targetId: ` ${linkType}-1 `,
        }),
      ).resolves.toEqual({
        type: "linked",
        link: { ...linkedRecord, linkType },
      });

      expect(linkEntry).toHaveBeenCalledWith({
        userId: "user-1",
        entryId: "entry-1",
        linkType,
        targetId: `${linkType}-1`,
      });
    },
  );

  it("preserves an already-applied duplicate-link outcome", async () => {
    const linkEntry = vi.fn().mockResolvedValue({
      type: "already-applied" as const,
      link: linkedRecord,
    });

    await expect(
      new JournalWrites({ linkEntry }).link({
        userId: "user-1",
        entryId: "entry-1",
        linkType: "habit",
        targetId: "habit-1",
      }),
    ).resolves.toEqual({ type: "already-applied", link: linkedRecord });
  });

  it("rejects malformed link requests without opening persistence", async () => {
    const linkEntry = vi.fn();

    await expect(
      new JournalWrites({ linkEntry }).link({
        userId: "user-1",
        entryId: "entry-1",
        linkType: "habit",
        targetId: " ",
      }),
    ).resolves.toEqual({
      type: "invalid",
      field: "targetId",
      message: "Target identity is required",
    });
    expect(linkEntry).not.toHaveBeenCalled();
  });
});

describe("JournalWrites.unlink", () => {
  it("normalizes a trusted unlink request and returns the unlinked record", async () => {
    const unlinkEntry = vi.fn().mockResolvedValue({
      type: "unlinked" as const,
      link: linkedRecord,
    });

    await expect(
      new JournalWrites({ unlinkEntry }).unlink({
        userId: " user-1 ",
        entryId: " entry-1 ",
        linkId: " link-1 ",
      }),
    ).resolves.toEqual({ type: "unlinked", link: linkedRecord });
    expect(unlinkEntry).toHaveBeenCalledWith({
      userId: "user-1",
      entryId: "entry-1",
      linkId: "link-1",
    });
  });

  it.each([
    ["conflict", { type: "conflict" as const }],
    ["not-found", { type: "not-found" as const }],
  ])("preserves the expected %s unlink outcome", async (_label, outcome) => {
    const unlinkEntry = vi.fn().mockResolvedValue(outcome);

    await expect(
      new JournalWrites({ unlinkEntry }).unlink({
        userId: "user-1",
        entryId: "entry-1",
        linkId: "link-1",
      }),
    ).resolves.toEqual(outcome);
  });

  it("propagates unexpected persistence failures", async () => {
    const failure = new Error("database unavailable");
    const unlinkEntry = vi.fn().mockRejectedValue(failure);

    await expect(
      new JournalWrites({ unlinkEntry }).unlink({
        userId: "user-1",
        entryId: "entry-1",
        linkId: "link-1",
      }),
    ).rejects.toBe(failure);
  });
});

describe("Journal link response mapping", () => {
  it("maps the storage-independent record to the existing transport shape", () => {
    expect(toJournalLinkResponse(linkedRecord)).toEqual({
      id: "link-1",
      entry_id: "entry-1",
      link_type: "habit",
      link_id: "habit-1",
      created_at: "2026-08-01T12:00:00.000Z",
    });
  });
});
