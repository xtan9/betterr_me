import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTransactionsSync } = vi.hoisted(() => ({
  mockTransactionsSync: vi.fn(),
}));

const { mockLogWarn } = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
}));

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({
    transactionsSync: mockTransactionsSync,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: mockLogWarn, info: vi.fn() },
}));

import { syncTransactions } from "@/lib/plaid/sync";

function createMockSupabase(overrides?: {
  selectAccounts?: { data: unknown[]; error: unknown };
  upsert?: { error: unknown };
  delete?: { error: unknown };
  updateCursor?: { error: unknown };
}) {
  const defaultSelectAccounts = {
    data: [{ id: "acc-uuid-1", plaid_account_id: "plaid-acc-1" }],
    error: null,
  };

  // Stable mock functions so assertions can track calls
  const mockUpsert = vi
    .fn()
    .mockResolvedValue({ error: overrides?.upsert?.error ?? null });
  const mockDeleteIn = vi
    .fn()
    .mockResolvedValue({ error: overrides?.delete?.error ?? null });
  const mockCursorUpdateEq = vi
    .fn()
    .mockResolvedValue({ error: overrides?.updateCursor?.error ?? null });
  const mockAccountSelectIn = vi
    .fn()
    .mockResolvedValue(overrides?.selectAccounts ?? defaultSelectAccounts);

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: mockAccountSelectIn,
            }),
          }),
        };
      }
      if (table === "transactions") {
        return {
          upsert: mockUpsert,
          delete: vi.fn().mockReturnValue({
            in: mockDeleteIn,
          }),
        };
      }
      if (table === "bank_connections") {
        return {
          update: vi.fn().mockReturnValue({
            eq: mockCursorUpdateEq,
          }),
        };
      }
      return {};
    }),
    // Expose stable mocks for assertions
    _mocks: { mockUpsert, mockDeleteIn, mockCursorUpdateEq },
  } as any;

  return supabase;
}

function makePlaidTxn(
  id: string,
  accountId: string,
  amount: number,
  name: string
) {
  return {
    transaction_id: id,
    account_id: accountId,
    amount,
    name,
    merchant_name: null,
    date: "2026-01-15",
    pending: false,
    personal_finance_category: { primary: "FOOD", detailed: "FOOD_GROCERIES" },
  };
}

describe("syncTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should sync a single page of added/modified/removed transactions", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [makePlaidTxn("txn-1", "plaid-acc-1", 25.5, "Grocery Store")],
        modified: [
          makePlaidTxn("txn-2", "plaid-acc-1", 10.0, "Updated Merchant"),
        ],
        removed: [{ transaction_id: "txn-3" }],
        has_more: false,
        next_cursor: "cursor-new",
      },
    });

    const supabase = createMockSupabase();
    const result = await syncTransactions(
      "access-token",
      "cursor-old",
      "bc-123",
      "hh-123",
      supabase
    );

    expect(result).toEqual({
      added: 1,
      modified: 1,
      removed: 1,
      cursor: "cursor-new",
    });

    expect(mockTransactionsSync).toHaveBeenCalledWith({
      access_token: "access-token",
      cursor: "cursor-old",
    });
  });

  it("should handle multi-page pagination (has_more loop)", async () => {
    mockTransactionsSync
      .mockResolvedValueOnce({
        data: {
          added: [makePlaidTxn("txn-1", "plaid-acc-1", 10, "Store 1")],
          modified: [],
          removed: [],
          has_more: true,
          next_cursor: "cursor-page2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          added: [makePlaidTxn("txn-2", "plaid-acc-1", 20, "Store 2")],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor-final",
        },
      });

    const supabase = createMockSupabase();
    const result = await syncTransactions(
      "access-token",
      null,
      "bc-123",
      "hh-123",
      supabase
    );

    expect(result.added).toBe(2);
    expect(result.cursor).toBe("cursor-final");
    expect(mockTransactionsSync).toHaveBeenCalledTimes(2);
  });

  it("should invert Plaid sign (positive → negative cents)", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [makePlaidTxn("txn-1", "plaid-acc-1", 25.5, "Coffee")],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor-1",
      },
    });

    const supabase = createMockSupabase();
    await syncTransactions(
      "access-token",
      null,
      "bc-123",
      "hh-123",
      supabase
    );

    // Plaid positive 25.50 → our -2550 cents
    const { mockUpsert } = supabase._mocks;
    expect(mockUpsert).toHaveBeenCalled();
    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs[0].amount_cents).toBe(-2550);
  });

  it("should map plaid_account_id to our account_id", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [makePlaidTxn("txn-1", "plaid-acc-1", 10, "Store")],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor-1",
      },
    });

    const supabase = createMockSupabase();
    await syncTransactions(
      "access-token",
      null,
      "bc-123",
      "hh-123",
      supabase
    );

    // Verify the account lookup was made
    const fromCalls = supabase.from.mock.calls;
    const accountsCalls = fromCalls.filter(
      (c: string[]) => c[0] === "accounts"
    );
    expect(accountsCalls.length).toBeGreaterThan(0);

    // Verify the upserted transaction has our account_id, not plaid's
    const { mockUpsert } = supabase._mocks;
    expect(mockUpsert).toHaveBeenCalled();
    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs[0].account_id).toBe("acc-uuid-1");
  });

  it("should skip transactions with unresolvable account and log warning", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [makePlaidTxn("txn-1", "unknown-plaid-acc", 10, "Store")],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor-1",
      },
    });

    const supabase = createMockSupabase({
      selectAccounts: { data: [], error: null },
    });

    const result = await syncTransactions(
      "access-token",
      null,
      "bc-123",
      "hh-123",
      supabase
    );

    expect(result.added).toBe(0);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining("no account found"),
      expect.objectContaining({ plaid_account_id: "unknown-plaid-acc" })
    );
  });

  it("should update cursor after sync", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor-updated",
      },
    });

    const supabase = createMockSupabase();
    const result = await syncTransactions(
      "access-token",
      null,
      "bc-123",
      "hh-123",
      supabase
    );

    expect(result.cursor).toBe("cursor-updated");
    const bankConnCalls = supabase.from.mock.calls.filter(
      (c: string[]) => c[0] === "bank_connections"
    );
    expect(bankConnCalls.length).toBeGreaterThan(0);
  });

  it("should handle empty sync response", async () => {
    mockTransactionsSync.mockResolvedValue({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor-same",
      },
    });

    const supabase = createMockSupabase();
    const result = await syncTransactions(
      "access-token",
      "cursor-same",
      "bc-123",
      "hh-123",
      supabase
    );

    expect(result).toEqual({
      added: 0,
      modified: 0,
      removed: 0,
      cursor: "cursor-same",
    });
  });
});
