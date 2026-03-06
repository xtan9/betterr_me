import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/money/plaid/create-link-token/route";

const { mockLinkTokenCreate } = vi.hoisted(() => ({
  mockLinkTokenCreate: vi.fn(),
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

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({
    linkTokenCreate: mockLinkTokenCreate,
  })),
}));

vi.mock("plaid", () => ({
  Products: { Transactions: "transactions" },
  CountryCode: { Us: "US" },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("POST /api/money/plaid/create-link-token", () => {
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

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return link_token on success", async () => {
    mockLinkTokenCreate.mockResolvedValue({
      data: { link_token: "link-sandbox-abc123" },
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.link_token).toBe("link-sandbox-abc123");
    expect(mockLinkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { client_user_id: "user-123" },
        client_name: "BetterR.Me",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      })
    );
  });

  it("should return 500 on Plaid API error", async () => {
    mockLinkTokenCreate.mockRejectedValue(new Error("Plaid API error"));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create link token");
  });
});
