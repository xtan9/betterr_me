import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/money/accounts/[id]/sync/route";
import { NextRequest } from "next/server";

const { mockGetById } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
}));

const { mockGetAccessToken } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
}));

const { mockSyncTransactions } = vi.hoisted(() => ({
  mockSyncTransactions: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  BankConnectionsDB: class {
    getById = mockGetById;
  },
}));

vi.mock("@/lib/plaid/token-exchange", () => ({
  getAccessToken: mockGetAccessToken,
}));

vi.mock("@/lib/plaid/sync", () => ({
  syncTransactions: mockSyncTransactions,
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("POST /api/money/accounts/[id]/sync", () => {
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

  const callPost = (id: string) =>
    POST(
      new NextRequest(`http://localhost:3000/api/money/accounts/${id}/sync`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) }
    );

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await callPost("bc-123");
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 200 and trigger sync on valid bank connection", async () => {
    mockGetById.mockResolvedValue({
      id: "bc-123",
      household_id: "hh-123",
      status: "connected",
      sync_cursor: "cursor-abc",
    });
    mockGetAccessToken.mockResolvedValue("access-sandbox-token");
    mockSyncTransactions.mockResolvedValue({
      added: 10,
      modified: 2,
      removed: 1,
      cursor: "cursor-new",
    });

    const response = await callPost("bc-123");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transactions_synced).toBe(13);
    expect(mockSyncTransactions).toHaveBeenCalled();
  });

  it("should return 400 when bank connection is not in connected status", async () => {
    mockGetById.mockResolvedValue({
      id: "bc-123",
      household_id: "hh-123",
      status: "error",
      sync_cursor: null,
    });

    const response = await callPost("bc-123");
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Bank connection is not in connected status");
  });
});
