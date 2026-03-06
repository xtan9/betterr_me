import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/money/accounts/[id]/disconnect/route";
import { NextRequest } from "next/server";

const { mockGetById, mockUpdateStatus } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockUpdateStatus: vi.fn(),
}));

const { mockGetByBankConnection } = vi.hoisted(() => ({
  mockGetByBankConnection: vi.fn(),
}));

const { mockGetAccessToken, mockRemoveAccessToken } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
  mockRemoveAccessToken: vi.fn(),
}));

const { mockItemRemove } = vi.hoisted(() => ({
  mockItemRemove: vi.fn(),
}));

const { mockAdminDelete } = vi.hoisted(() => ({
  mockAdminDelete: vi.fn(),
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
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: mockAdminDelete,
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/db", () => ({
  BankConnectionsDB: class {
    getById = mockGetById;
    updateStatus = mockUpdateStatus;
  },
  MoneyAccountsDB: class {
    getByBankConnection = mockGetByBankConnection;
  },
}));

vi.mock("@/lib/plaid/token-exchange", () => ({
  getAccessToken: mockGetAccessToken,
  removeAccessToken: mockRemoveAccessToken,
}));

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({
    itemRemove: mockItemRemove,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("POST /api/money/accounts/[id]/disconnect", () => {
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

  const callPost = (id: string, body: object) =>
    POST(
      new NextRequest(
        `http://localhost:3000/api/money/accounts/${id}/disconnect`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      ),
      { params: Promise.resolve({ id }) }
    );

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await callPost("bc-123", { keep_transactions: true });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 200 and disconnect with keep_transactions=true", async () => {
    mockGetById.mockResolvedValue({
      id: "bc-123",
      household_id: "hh-123",
      status: "connected",
    });
    mockGetAccessToken.mockResolvedValue("access-token");
    mockItemRemove.mockResolvedValue({});
    mockRemoveAccessToken.mockResolvedValue(undefined);
    mockUpdateStatus.mockResolvedValue({});

    const response = await callPost("bc-123", { keep_transactions: true });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockItemRemove).toHaveBeenCalledWith({
      access_token: "access-token",
    });
    expect(mockUpdateStatus).toHaveBeenCalledWith("bc-123", "disconnected");
    // Should NOT delete transactions
    expect(mockGetByBankConnection).not.toHaveBeenCalled();
  });

  it("should return 200 and delete transactions with keep_transactions=false", async () => {
    mockGetById.mockResolvedValue({
      id: "bc-123",
      household_id: "hh-123",
      status: "connected",
    });
    mockGetAccessToken.mockResolvedValue("access-token");
    mockItemRemove.mockResolvedValue({});
    mockRemoveAccessToken.mockResolvedValue(undefined);
    mockGetByBankConnection.mockResolvedValue([
      { id: "acc-1" },
      { id: "acc-2" },
    ]);
    mockAdminDelete.mockResolvedValue({ error: null });
    mockUpdateStatus.mockResolvedValue({});

    const response = await callPost("bc-123", { keep_transactions: false });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGetByBankConnection).toHaveBeenCalledWith("bc-123");
    expect(mockUpdateStatus).toHaveBeenCalledWith("bc-123", "disconnected");
  });
});
