import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDeleteSubscription } = vi.hoisted(() => ({
  mockDeleteSubscription: vi.fn(),
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
    deleteSubscription = mockDeleteSubscription;
  },
}));

import { POST } from "@/app/api/push/unsubscribe/route";

describe("POST /api/push/unsubscribe", () => {
  const validBody = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockDeleteSubscription.mockResolvedValue(undefined);
  });

  it("returns 200 with success on valid unsubscribe", async () => {
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid endpoint URL", async () => {
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: "not-a-url" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when endpoint is missing", async () => {
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls deleteSubscription with correct args", async () => {
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await POST(req);
    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      "user-1",
      validBody.endpoint
    );
  });

  it("returns 500 when DB throws", async () => {
    mockDeleteSubscription.mockRejectedValue(new Error("DB error"));
    const req = new NextRequest("http://localhost/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
