import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/money/plaid/exchange-token/route";
import { NextRequest } from "next/server";

const { mockExchangeAndStore } = vi.hoisted(() => ({
  mockExchangeAndStore: vi.fn(),
}));

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
}));

vi.mock("@/lib/plaid/token-exchange", () => ({
  exchangeAndStore: mockExchangeAndStore,
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("POST /api/money/plaid/exchange-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockResolveHousehold.mockResolvedValue("household-abc");
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/money/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({ public_token: "public-sandbox-abc" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 with invalid public_token format", async () => {
    const request = new NextRequest("http://localhost:3000/api/money/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({ public_token: "invalid-token" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("should return 200 with bank_connection and accounts on success", async () => {
    mockExchangeAndStore.mockResolvedValue({
      bankConnectionId: "bc-123",
      accounts: [
        { id: "acc-1", name: "Checking", subtype: "checking", balance_cents: 100000 },
        { id: "acc-2", name: "Savings", subtype: "savings", balance_cents: 500000 },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/money/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({ public_token: "public-sandbox-abc123" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.bank_connection.id).toBe("bc-123");
    expect(data.accounts).toHaveLength(2);
  });

  it("should return 500 on exchange failure", async () => {
    mockExchangeAndStore.mockRejectedValue(new Error("Exchange failed"));

    const request = new NextRequest("http://localhost:3000/api/money/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({ public_token: "public-sandbox-abc123" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to exchange token");
  });
});
