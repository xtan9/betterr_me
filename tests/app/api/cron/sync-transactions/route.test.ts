import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/cron/sync-transactions/route";
import { NextRequest } from "next/server";

const { mockGetAccessToken } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
}));

const { mockSyncTransactions } = vi.hoisted(() => ({
  mockSyncTransactions: vi.fn(),
}));

const { mockAdminFrom } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
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

describe("GET /api/cron/sync-transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  const callGet = (authHeader?: string) => {
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    return GET(
      new NextRequest("http://localhost:3000/api/cron/sync-transactions", {
        headers,
      })
    );
  };

  it("should return 401 when CRON_SECRET is missing or wrong", async () => {
    const responseMissing = await callGet();
    expect(responseMissing.status).toBe(401);

    const responseWrong = await callGet("Bearer wrong-secret");
    expect(responseWrong.status).toBe(401);
  });

  it("should return 200 and sync all connected bank connections", async () => {
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: "bc-1", household_id: "hh-1", sync_cursor: "cursor-1" },
            { id: "bc-2", household_id: "hh-2", sync_cursor: null },
          ],
          error: null,
        }),
      }),
    });

    mockGetAccessToken.mockResolvedValue("access-token");
    mockSyncTransactions.mockResolvedValue({
      added: 5,
      modified: 0,
      removed: 0,
      cursor: "new-cursor",
    });

    const response = await callGet("Bearer test-cron-secret");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(2);
    expect(data.errors).toBe(0);
    expect(mockSyncTransactions).toHaveBeenCalledTimes(2);
  });

  it("should handle individual sync errors without stopping the entire batch", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "bank_connections") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: "bc-1", household_id: "hh-1", sync_cursor: "cursor-1" },
                { id: "bc-2", household_id: "hh-2", sync_cursor: null },
              ],
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    });

    mockGetAccessToken
      .mockResolvedValueOnce("access-token-1")
      .mockResolvedValueOnce("access-token-2");

    mockSyncTransactions
      .mockRejectedValueOnce(new Error("Plaid rate limit"))
      .mockResolvedValueOnce({
        added: 3,
        modified: 0,
        removed: 0,
        cursor: "new-cursor",
      });

    const response = await callGet("Bearer test-cron-secret");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.errors).toBe(1);
    // Both connections should have been attempted
    expect(mockSyncTransactions).toHaveBeenCalledTimes(2);
  });
});
