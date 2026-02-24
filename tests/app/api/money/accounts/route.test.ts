import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/money/accounts/route";
import { NextRequest } from "next/server";

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

const { mockGetByHouseholdConnections, mockGetByHouseholdFiltered } =
  vi.hoisted(() => ({
    mockGetByHouseholdConnections: vi.fn(),
    mockGetByHouseholdFiltered: vi.fn(),
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

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
}));

vi.mock("@/lib/db", () => ({
  BankConnectionsDB: class {
    getByHousehold = mockGetByHouseholdConnections;
  },
  MoneyAccountsDB: class {
    getByHouseholdFiltered = mockGetByHouseholdFiltered;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/money/accounts", () => {
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

    const request = new NextRequest(
      "http://localhost:3000/api/money/accounts"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return grouped accounts with sync status and net_worth_cents", async () => {
    const now = new Date();
    const recentSync = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    mockGetByHouseholdConnections.mockResolvedValue([
      {
        id: "bc-1",
        institution_name: "Chase",
        institution_id: "ins_1",
        status: "connected",
        sync_cursor: "cursor-1",
        last_synced_at: recentSync,
        error_code: null,
        error_message: null,
      },
    ]);

    mockGetByHouseholdFiltered.mockResolvedValue([
      {
        id: "acc-1",
        household_id: "household-abc",
        bank_connection_id: "bc-1",
        name: "Checking",
        account_type: "checking",
        balance_cents: 250000,
        mask: "1234",
        is_hidden: false,
      },
      {
        id: "acc-2",
        household_id: "household-abc",
        bank_connection_id: "bc-1",
        name: "Credit Card",
        account_type: "credit card",
        balance_cents: -50000,
        mask: "5678",
        is_hidden: false,
      },
    ]);

    const request = new NextRequest(
      "http://localhost:3000/api/money/accounts"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].institution_name).toBe("Chase");
    expect(data.connections[0].sync_status).toBe("synced");
    expect(data.connections[0].accounts).toHaveLength(2);
    expect(data.net_worth_cents).toBe(200000); // 250000 + (-50000)
  });

  it("should return empty connections when no bank connections exist", async () => {
    mockGetByHouseholdConnections.mockResolvedValue([]);
    mockGetByHouseholdFiltered.mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost:3000/api/money/accounts"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connections).toHaveLength(0);
    expect(data.net_worth_cents).toBe(0);
  });
});
