import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/money/plaid/webhook/route";
import { NextRequest } from "next/server";

const { mockVerifyPlaidWebhook } = vi.hoisted(() => ({
  mockVerifyPlaidWebhook: vi.fn(),
}));

const { mockSyncTransactions } = vi.hoisted(() => ({
  mockSyncTransactions: vi.fn(),
}));

const { mockGetAccessToken } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
}));

const { mockAdminFrom } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/plaid/webhooks", () => ({
  verifyPlaidWebhook: mockVerifyPlaidWebhook,
}));

vi.mock("@/lib/plaid/sync", () => ({
  syncTransactions: mockSyncTransactions,
}));

vi.mock("@/lib/plaid/token-exchange", () => ({
  getAccessToken: mockGetAccessToken,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function createWebhookRequest(
  payload: object,
  verification = "valid-jwt"
): NextRequest {
  return new NextRequest("http://localhost:3000/api/money/plaid/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      "Plaid-Verification": verification,
    },
  });
}

describe("POST /api/money/plaid/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when verification fails", async () => {
    mockVerifyPlaidWebhook.mockResolvedValue(false);

    const request = createWebhookRequest({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item-123",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Webhook verification failed");
  });

  it("should return 200 and trigger sync on SYNC_UPDATES_AVAILABLE", async () => {
    mockVerifyPlaidWebhook.mockResolvedValue(true);
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "bc-123",
                household_id: "hh-123",
                sync_cursor: "cursor-abc",
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockGetAccessToken.mockResolvedValue("access-sandbox-token");
    mockSyncTransactions.mockResolvedValue({
      added: 5,
      modified: 1,
      removed: 0,
      cursor: "cursor-new",
    });

    const request = createWebhookRequest({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item-123",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockSyncTransactions).toHaveBeenCalled();
  });

  it("should return 200 and update error on ITEM/ERROR", async () => {
    mockVerifyPlaidWebhook.mockResolvedValue(true);
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValue({ update: mockUpdate });

    const request = createWebhookRequest({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: "item-123",
      error: {
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "User login required",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockAdminFrom).toHaveBeenCalledWith("bank_connections");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "User login required",
      })
    );
  });

  it("should return 200 for unknown webhook types (acknowledge but ignore)", async () => {
    mockVerifyPlaidWebhook.mockResolvedValue(true);

    const request = createWebhookRequest({
      webhook_type: "UNKNOWN",
      webhook_code: "SOMETHING",
      item_id: "item-123",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
  });
});
