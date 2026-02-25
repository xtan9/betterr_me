import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/journal/on-this-day/route";
import { NextRequest } from "next/server";

const mockJournalDB = {
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

const mockOnThisDayEntry = {
  id: "otd-1",
  user_id: "user-123",
  entry_date: "2026-01-24",
  title: "30 Days Ago Entry",
  content: { type: "doc", content: [] },
  mood: 3,
  word_count: 50,
  tags: ["reflection"],
  prompt_key: null,
  created_at: "2026-01-24T10:00:00Z",
  updated_at: "2026-01-24T10:00:00Z",
};

describe("GET /api/journal/on-this-day", () => {
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

    const request = new NextRequest("http://localhost:3000/api/journal/on-this-day?date=2026-02-23");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when date param is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/journal/on-this-day");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns entries with period labels", async () => {
    mockJournalDB.getEntriesForDates.mockResolvedValue([mockOnThisDayEntry]);

    const request = new NextRequest("http://localhost:3000/api/journal/on-this-day?date=2026-02-23");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toEqual({
      id: "otd-1",
      entry_date: "2026-01-24",
      mood: 3,
      title: "30 Days Ago Entry",
      content: { type: "doc", content: [] },
      word_count: 50,
      period: "30_days_ago",
    });
  });

  it("returns empty array when no On This Day entries exist", async () => {
    mockJournalDB.getEntriesForDates.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/journal/on-this-day?date=2026-02-23");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([]);
  });

  it("passes correct lookback dates to DB method", async () => {
    mockJournalDB.getEntriesForDates.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/journal/on-this-day?date=2026-02-23");
    await GET(request);

    // Should query for 30d, 90d, 1y ago from 2026-02-23
    expect(mockJournalDB.getEntriesForDates).toHaveBeenCalledWith(
      "user-123",
      ["2026-01-24", "2025-11-25", "2025-02-23"]
    );
  });
});
