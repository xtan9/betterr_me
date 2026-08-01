import { describe, it, expect, vi, beforeEach } from "vitest";
import { journalTools } from "@/lib/ai/tools/journal";
import type { ToolContext } from "@/lib/ai/tools/types";

const { mockSaveJournalEntry } = vi.hoisted(() => ({
  mockSaveJournalEntry: vi.fn(),
}));

const mockGetEntryByDate = vi.fn();
const mockGetTimeline = vi.fn();

const mockGetEntry = vi.fn();
const mockDeleteJournalEntry = vi.fn();

vi.mock("@/lib/db", () => ({
  JournalEntriesDB: class {
    getEntryByDate = mockGetEntryByDate;
    getTimeline = mockGetTimeline;
    getEntry = mockGetEntry;
  },
}));

vi.mock("@/lib/journal/writes", () => ({
  createJournalWrites: vi.fn(() => ({
    save: mockSaveJournalEntry,
    delete: mockDeleteJournalEntry,
  })),
  toJournalEntryResponse: (entry: unknown) => entry,
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return journalTools().find((t) => t.name === name)!;
}

describe("journalTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = journalTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getTodayJournal",
      "getRecentJournal",
      "createJournalEntry",
      "deleteJournalEntry",
    ]);
  });

  it("deleteJournalEntry delegates to the mutation command and preserves confirmation", async () => {
    const ctx = makeCtx();
    mockDeleteJournalEntry.mockResolvedValue({ type: "deleted" });
    const tool = findTool("deleteJournalEntry");
    const result = await findTool("deleteJournalEntry").execute(
      { entryId: "j1" },
      ctx,
    );
    expect(tool.description).toContain("Always confirm with the user first");
    expect(mockDeleteJournalEntry).toHaveBeenCalledWith({
      entryId: "j1",
      userId: "user-123",
    });
    expect(mockGetEntry).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it.each(["missing", "repeated", "cross-owner"] as const)(
    "deleteJournalEntry maps the mutation not-found outcome for %s requests",
    async () => {
      const ctx = makeCtx();
      mockDeleteJournalEntry.mockResolvedValue({ type: "not-found" });
      const result = await findTool("deleteJournalEntry").execute(
        { entryId: "j999" },
        ctx,
      );
      expect(result).toEqual({ error: "Journal entry not found" });
    },
  );

  it("deleteJournalEntry propagates unexpected mutation failures", async () => {
    const persistenceError = new Error("database unavailable");
    mockDeleteJournalEntry.mockRejectedValue(persistenceError);

    await expect(
      findTool("deleteJournalEntry").execute({ entryId: "j1" }, makeCtx()),
    ).rejects.toBe(persistenceError);
  });

  it("does not query the generic Journal DB for deletion", async () => {
    const ctx = makeCtx();
    mockDeleteJournalEntry.mockResolvedValue({ type: "not-found" });
    const result = await findTool("deleteJournalEntry").execute(
      { entryId: "j999" },
      ctx,
    );
    expect(result).toEqual({ error: "Journal entry not found" });
    expect(mockGetEntry).not.toHaveBeenCalled();
  });

  it("createJournalEntry translates plain text into the shared journal save request", async () => {
    const entry = { id: "j1", entry_date: "2026-04-10" };
    mockSaveJournalEntry.mockResolvedValue({ type: "created", entry });

    const result = await findTool("createJournalEntry").execute(
      { date: "2026-04-10", content: "  Today was good\nReally good.  ", mood: 4 },
      makeCtx(),
    );

    expect(mockSaveJournalEntry).toHaveBeenCalledWith({
      userId: "user-123",
      entryDate: "2026-04-10",
      title: "",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "  Today was good\nReally good.  " }],
          },
        ],
      },
      mood: 4,
      wordCount: 5,
      tags: [],
      promptKey: null,
    });
    expect(result).toEqual(entry);
  });

  it("createJournalEntry renders expected save outcomes without changing the domain meaning", async () => {
    mockSaveJournalEntry.mockResolvedValue({ type: "conflict" });

    await expect(
      findTool("createJournalEntry").execute(
        { date: "2026-04-10", content: "Entry" },
        makeCtx(),
      ),
    ).resolves.toEqual({ error: "Journal entry conflict" });
  });
});
