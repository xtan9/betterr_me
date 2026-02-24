import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/journal/today/route";
import { NextRequest } from "next/server";

const mockJournalDB = {
  getEntryByDate: vi.fn(),
  getRecentEntryDates: vi.fn(),
  getEntriesForDates: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  JournalEntriesDB: class {
    constructor() {
      return mockJournalDB;
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

const mockEntry = {
  id: "entry-123",
  user_id: "user-123",
  entry_date: "2026-02-23",
  title: "Today Entry",
  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
  mood: 4,
  word_count: 1,
  tags: [],
  prompt_key: null,
  created_at: "2026-02-23T10:00:00Z",
  updated_at: "2026-02-23T10:00:00Z",
};

const mockOnThisDayEntry = {
  id: "otd-entry-1",
  user_id: "user-123",
  entry_date: "2026-01-24",
  title: "30 Days Ago",
  content: { type: "doc", content: [] },
  mood: 3,
  word_count: 10,
  tags: [],
  prompt_key: null,
  created_at: "2026-01-24T10:00:00Z",
  updated_at: "2026-01-24T10:00:00Z",
};

describe("GET /api/journal/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/journal/today?date=2026-02-23");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when date param is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/journal/today");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const request = new NextRequest("http://localhost:3000/api/journal/today?date=not-valid");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns entry + streak + on_this_day when entry exists", async () => {
    const recentDates = [
      "2026-02-23",
      "2026-02-22",
      "2026-02-21",
    ];
    mockJournalDB.getEntryByDate.mockResolvedValue(mockEntry);
    mockJournalDB.getRecentEntryDates.mockResolvedValue(recentDates);
    mockJournalDB.getEntriesForDates.mockResolvedValue([mockOnThisDayEntry]);

    const request = new NextRequest("http://localhost:3000/api/journal/today?date=2026-02-23");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toEqual({
      id: "entry-123",
      mood: 4,
      title: "Today Entry",
      content: mockEntry.content,
      word_count: 1,
    });
    expect(data.streak).toBe(3);
    expect(data.on_this_day).toHaveLength(1);
    expect(data.on_this_day[0].period).toBe("30_days_ago");
    expect(data.on_this_day[0].id).toBe("otd-entry-1");
  });

  it("returns null entry with streak 0 when no entries exist", async () => {
    mockJournalDB.getEntryByDate.mockResolvedValue(null);
    mockJournalDB.getRecentEntryDates.mockResolvedValue([]);
    mockJournalDB.getEntriesForDates.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/journal/today?date=2026-02-23");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeNull();
    expect(data.streak).toBe(0);
    expect(data.on_this_day).toEqual([]);
  });

  it("reads date from query param", async () => {
    mockJournalDB.getEntryByDate.mockResolvedValue(null);
    mockJournalDB.getRecentEntryDates.mockResolvedValue([]);
    mockJournalDB.getEntriesForDates.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/journal/today?date=2026-03-15");
    await GET(request);

    expect(mockJournalDB.getEntryByDate).toHaveBeenCalledWith("user-123", "2026-03-15");
    expect(mockJournalDB.getRecentEntryDates).toHaveBeenCalledWith("user-123", "2026-03-15", 400);
  });
});
