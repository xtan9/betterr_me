import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockUpsertSubscription } = vi.hoisted(() => ({
  mockUpsertSubscription: vi.fn(),
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
    upsertSubscription = mockUpsertSubscription;
  },
}));

import { POST } from "@/app/api/push/subscribe/route";

describe("POST /api/push/subscribe", () => {
  const validBody = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    p256dh: "BNcRdreALRFXTkOOUHK1",
    auth: "tBHItJI5svbpC7",
    user_agent: "Mozilla/5.0",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockUpsertSubscription.mockResolvedValue({
      id: "sub-1",
      user_id: "user-1",
      ...validBody,
      created_at: "2026-04-02T00:00:00Z",
    });
  });

  it("returns 201 with subscription on success", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.subscription).toBeDefined();
    expect(json.subscription.endpoint).toBe(validBody.endpoint);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing endpoint)", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ p256dh: "key", auth: "auth" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid endpoint URL", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ ...validBody, endpoint: "not-a-url" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls upsertSubscription with correct args", async () => {
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await POST(req);
    expect(mockUpsertSubscription).toHaveBeenCalledWith("user-1", {
      endpoint: validBody.endpoint,
      p256dh: validBody.p256dh,
      auth: validBody.auth,
      user_agent: validBody.user_agent,
    });
  });

  it("returns 500 when DB throws", async () => {
    mockUpsertSubscription.mockRejectedValue(new Error("DB error"));
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
