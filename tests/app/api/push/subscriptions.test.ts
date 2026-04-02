import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSubscriptions } = vi.hoisted(() => ({
  mockGetSubscriptions: vi.fn(),
}));

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

vi.mock("@/lib/db/push-subscriptions", () => ({
  PushSubscriptionsDB: class {
    getSubscriptions = mockGetSubscriptions;
  },
}));

import { GET } from "@/app/api/push/subscriptions/route";

describe("GET /api/push/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  it("returns count of subscriptions", async () => {
    mockGetSubscriptions.mockResolvedValue([
      { id: "sub-1", endpoint: "https://a.example.com" },
      { id: "sub-2", endpoint: "https://b.example.com" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(2);
  });

  it("returns count 0 when no subscriptions", async () => {
    mockGetSubscriptions.mockResolvedValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json.count).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when DB throws", async () => {
    mockGetSubscriptions.mockRejectedValue(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
