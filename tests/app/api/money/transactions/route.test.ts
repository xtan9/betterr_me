import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/money/transactions/route";
import { NextRequest } from "next/server";

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

const { mockGetByHouseholdFiltered, mockCreate } = vi.hoisted(() => ({
  mockGetByHouseholdFiltered: vi.fn(),
  mockCreate: vi.fn(),
}));

const { mockGetById } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
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
  TransactionsDB: class {
    getByHouseholdFiltered = mockGetByHouseholdFiltered;
    create = mockCreate;
  },
  MoneyAccountsDB: class {
    getById = mockGetById;
    findOrCreateCash = vi.fn();
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/money/transactions", () => {
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
      "http://localhost:3000/api/money/transactions"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return transactions list", async () => {
    const mockTransactions = [
      {
        id: "txn-1",
        description: "Coffee Shop",
        amount_cents: -450,
        transaction_date: "2026-02-20",
        source: "plaid",
      },
      {
        id: "txn-2",
        description: "Salary",
        amount_cents: 500000,
        transaction_date: "2026-02-15",
        source: "plaid",
      },
    ];
    mockGetByHouseholdFiltered.mockResolvedValue({
      transactions: mockTransactions,
      total: 2,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/money/transactions"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toHaveLength(2);
    expect(data.transactions[0].description).toBe("Coffee Shop");
    expect(data.total).toBe(2);
    expect(data.hasMore).toBe(false);
  });

  it("should forward search param to TransactionsDB", async () => {
    mockGetByHouseholdFiltered.mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/money/transactions?search=coffee"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toEqual([]);
    expect(mockGetByHouseholdFiltered).toHaveBeenCalledWith(
      "household-abc",
      "user-123",
      "mine",
      expect.objectContaining({ search: "coffee" })
    );
  });

  it("should forward category_id filter to TransactionsDB", async () => {
    mockGetByHouseholdFiltered.mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const catId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const request = new NextRequest(
      `http://localhost:3000/api/money/transactions?category_id=${catId}`
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetByHouseholdFiltered).toHaveBeenCalledWith(
      "household-abc",
      "user-123",
      "mine",
      expect.objectContaining({ categoryId: catId })
    );
  });

  it("should set hasMore true when more transactions exist", async () => {
    mockGetByHouseholdFiltered.mockResolvedValue({
      transactions: [
        { id: "txn-1", description: "Item 1", amount_cents: -100 },
      ],
      total: 50,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/money/transactions?limit=1&offset=0"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasMore).toBe(true);
    expect(data.total).toBe(50);
  });
});

describe("POST /api/money/transactions", () => {
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

  it("should create manual transaction with 201", async () => {
    mockGetById.mockResolvedValue({
      id: "acc-1",
      household_id: "household-abc",
    });
    const mockTxn = {
      id: "txn-new",
      description: "Lunch",
      amount_cents: 1250,
      transaction_date: "2026-02-22",
      source: "manual",
    };
    mockCreate.mockResolvedValue(mockTxn);

    // Use valid UUID for account_id (schema requires UUID format)
    const validRequest = new NextRequest(
      "http://localhost:3000/api/money/transactions",
      {
        method: "POST",
        body: JSON.stringify({
          amount: 12.50,
          description: "Lunch",
          transaction_date: "2026-02-22",
          account_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        }),
      }
    );

    mockGetById.mockResolvedValue({
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      household_id: "household-abc",
    });

    const response = await POST(validRequest);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.transaction).toBeDefined();
  });

  it("should return 400 with invalid data", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/money/transactions",
      {
        method: "POST",
        body: JSON.stringify({
          amount: -10,
          description: "",
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });
});
