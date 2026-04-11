import { describe, it, expect, vi, beforeEach } from "vitest";
import { journalTools } from "@/lib/ai/tools/journal";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetEntryByDate = vi.fn();
const mockGetTimeline = vi.fn();
const mockUpsertEntry = vi.fn();
const mockDeleteEntry = vi.fn();

const mockGetEntry = vi.fn();

vi.mock("@/lib/db", () => ({
  JournalEntriesDB: class {
    getEntryByDate = mockGetEntryByDate;
    getTimeline = mockGetTimeline;
    upsertEntry = mockUpsertEntry;
    getEntry = mockGetEntry;
    deleteEntry = mockDeleteEntry;
  },
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

  it("deleteJournalEntry verifies existence then deletes", async () => {
    const ctx = makeCtx();
    mockGetEntry.mockResolvedValue({ id: "j1" });
    mockDeleteEntry.mockResolvedValue(undefined);
    const result = await findTool("deleteJournalEntry").execute(
      { entryId: "j1" },
      ctx,
    );
    expect(mockGetEntry).toHaveBeenCalledWith("j1", "user-123");
    expect(mockDeleteEntry).toHaveBeenCalledWith("j1", "user-123");
    expect(result).toEqual({ success: true });
  });

  it("deleteJournalEntry returns error when not found", async () => {
    const ctx = makeCtx();
    mockGetEntry.mockResolvedValue(null);
    const result = await findTool("deleteJournalEntry").execute(
      { entryId: "j999" },
      ctx,
    );
    expect(result).toEqual({ error: "Journal entry not found" });
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });
});
