import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "@/app/api/journal/[id]/links/route";
import { NextRequest } from "next/server";

const mockLinksDB = {
  getLinksForEntry: vi.fn(),
  addLink: vi.fn(),
  removeLink: vi.fn(),
};

const mockJournalDB = {
  getEntry: vi.fn(),
};

// Track supabase query calls for enrichment
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/db", () => ({
  JournalEntriesDB: class {
    constructor() {
      return mockJournalDB;
    }
  },
  JournalEntryLinksDB: class {
    constructor() {
      return mockLinksDB;
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

const makeParams = (id: string) => Promise.resolve({ id });

const mockLink = {
  id: "link-1",
  entry_id: "entry-123",
  link_type: "habit" as const,
  link_id: "habit-abc",
  created_at: "2026-02-23T10:00:00Z",
};

describe("GET /api/journal/[id]/links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
      from: mockFrom,
    } as any);
    // Ownership check: entry exists by default
    mockJournalDB.getEntry.mockResolvedValue({ id: "entry-123", user_id: "user-123" });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
      from: mockFrom,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links");
    const response = await GET(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(401);
  });

  it("returns enriched links with habit names", async () => {
    mockLinksDB.getLinksForEntry.mockResolvedValue([mockLink]);

    // Mock the supabase chain for habits enrichment
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: "habit-abc", name: "Morning Meditation" }],
        }),
      }),
    });

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links");
    const response = await GET(request, { params: makeParams("entry-123") });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.links).toHaveLength(1);
    expect(data.links[0]).toEqual({
      id: "link-1",
      link_type: "habit",
      link_id: "habit-abc",
      name: "Morning Meditation",
      created_at: "2026-02-23T10:00:00Z",
    });
  });

  it("uses (deleted) fallback for missing linked items", async () => {
    mockLinksDB.getLinksForEntry.mockResolvedValue([mockLink]);

    // Return empty results from habits query (item deleted)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [] }),
      }),
    });

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links");
    const response = await GET(request, { params: makeParams("entry-123") });
    const data = await response.json();

    expect(data.links[0].name).toBe("(deleted)");
  });

  it("returns empty array when no links", async () => {
    mockLinksDB.getLinksForEntry.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links");
    const response = await GET(request, { params: makeParams("entry-123") });
    const data = await response.json();

    expect(data.links).toEqual([]);
  });

  it("returns 404 when entry not owned by user", async () => {
    mockJournalDB.getEntry.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links");
    const response = await GET(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/journal/[id]/links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
      from: mockFrom,
    } as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
      from: mockFrom,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links", {
      method: "POST",
      body: JSON.stringify({ link_type: "habit", link_id: "habit-abc" }),
    });
    const response = await POST(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(401);
  });

  it("creates link with valid body and returns 201", async () => {
    mockJournalDB.getEntry.mockResolvedValue({
      id: "entry-123",
      user_id: "user-123",
    });
    mockLinksDB.addLink.mockResolvedValue(mockLink);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links", {
      method: "POST",
      body: JSON.stringify({
        link_type: "habit",
        link_id: "d47f3c2a-1234-4abc-9def-0123456789ab",
      }),
    });
    const response = await POST(request, { params: makeParams("entry-123") });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.link).toEqual(mockLink);
  });

  it("returns 400 for invalid body", async () => {
    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links", {
      method: "POST",
      body: JSON.stringify({ link_type: "invalid_type" }),
    });
    const response = await POST(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(400);
  });

  it("returns 404 when entry not found", async () => {
    mockJournalDB.getEntry.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links", {
      method: "POST",
      body: JSON.stringify({
        link_type: "habit",
        link_id: "d47f3c2a-1234-4abc-9def-0123456789ab",
      }),
    });
    const response = await POST(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/journal/[id]/links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
      from: mockFrom,
    } as any);
    // Ownership check: entry exists by default
    mockJournalDB.getEntry.mockResolvedValue({ id: "entry-123", user_id: "user-123" });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
      from: mockFrom,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links?link_id=link-1", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(401);
  });

  it("removes link and returns success", async () => {
    mockLinksDB.removeLink.mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links?link_id=link-1", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: makeParams("entry-123") });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockLinksDB.removeLink).toHaveBeenCalledWith("link-1", "entry-123");
  });

  it("returns 400 when link_id param is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(400);
  });

  it("returns 404 when entry not owned by user", async () => {
    mockJournalDB.getEntry.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/journal/entry-123/links?link_id=link-1", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: makeParams("entry-123") });

    expect(response.status).toBe(404);
  });
});
