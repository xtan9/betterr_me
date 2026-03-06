import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockItemPublicTokenExchange,
  mockItemGet,
  mockInstitutionsGetById,
  mockAccountsGet,
} = vi.hoisted(() => ({
  mockItemPublicTokenExchange: vi.fn(),
  mockItemGet: vi.fn(),
  mockInstitutionsGetById: vi.fn(),
  mockAccountsGet: vi.fn(),
}));

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({
    itemPublicTokenExchange: mockItemPublicTokenExchange,
    itemGet: mockItemGet,
    institutionsGetById: mockInstitutionsGetById,
    accountsGet: mockAccountsGet,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  exchangeAndStore,
  getAccessToken,
  removeAccessToken,
} from "@/lib/plaid/token-exchange";

function createExchangeMockSupabase(overrides?: {
  insertBankConnection?: { data: unknown; error: unknown };
  rpcCreate?: { error: unknown };
  updateVaultName?: { error: unknown };
  insertAccounts?: { data: unknown[]; error: unknown };
}) {
  // Stable mock functions for assertions
  const mockBcInsertSingle = vi.fn().mockResolvedValue(
    overrides?.insertBankConnection ?? {
      data: { id: "bc-uuid-123" },
      error: null,
    }
  );
  const mockBcUpdateEq = vi.fn().mockResolvedValue({
    error: overrides?.updateVaultName?.error ?? null,
  });
  const mockAccInsertSelect = vi.fn().mockResolvedValue(
    overrides?.insertAccounts ?? {
      data: [
        {
          id: "acc-uuid-1",
          name: "Checking",
          subtype: "checking",
          balance_cents: 100050,
        },
      ],
      error: null,
    }
  );
  const mockRpc = vi.fn((rpcName: string) => {
    if (rpcName === "create_plaid_secret") {
      return Promise.resolve({ error: overrides?.rpcCreate?.error ?? null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  // Track the insert args for accounts
  const mockAccInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockImplementation(() => mockAccInsertSelect()),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "bank_connections") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockBcInsertSingle,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: mockBcUpdateEq,
          }),
        };
      }
      if (table === "accounts") {
        return {
          insert: mockAccInsert,
        };
      }
      return {};
    }),
    rpc: mockRpc,
    _mocks: { mockAccInsert, mockAccInsertSelect },
  } as any;
}

function createGetTokenMockSupabase(overrides?: {
  selectVaultName?: { data: unknown; error: unknown };
  rpcGet?: { data: unknown; error: unknown };
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            overrides?.selectVaultName ?? {
              data: { vault_secret_name: "plaid_access_token_bc-uuid-123" },
              error: null,
            }
          ),
        }),
      }),
    })),
    rpc: vi.fn(() =>
      Promise.resolve(
        overrides?.rpcGet ?? { data: "access-sandbox-token", error: null }
      )
    ),
  } as any;
}

function createRemoveTokenMockSupabase(overrides?: {
  rpcDelete?: { error: unknown };
}) {
  const mockRpc = vi.fn((rpcName: string) => {
    if (rpcName === "delete_plaid_secret") {
      return Promise.resolve({ error: overrides?.rpcDelete?.error ?? null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { vault_secret_name: "plaid_access_token_bc-uuid-123" },
            error: null,
          }),
        }),
      }),
    })),
    rpc: mockRpc,
  } as any;
}

function setupExchangeMocks(accountOverrides?: {
  type?: string;
  balanceCurrent?: number | null;
}) {
  mockItemPublicTokenExchange.mockResolvedValue({
    data: { access_token: "access-sandbox-abc", item_id: "item-123" },
  });
  mockItemGet.mockResolvedValue({
    data: { item: { institution_id: "ins_1" } },
  });
  mockInstitutionsGetById.mockResolvedValue({
    data: { institution: { name: "Chase" } },
  });

  const balanceCurrent =
    accountOverrides && "balanceCurrent" in accountOverrides
      ? accountOverrides.balanceCurrent
      : 1000.5;

  mockAccountsGet.mockResolvedValue({
    data: {
      accounts: [
        {
          account_id: "plaid-acc-1",
          name: "Checking",
          official_name: "Chase Total Checking",
          mask: "1234",
          type: accountOverrides?.type ?? "depository",
          subtype: "checking",
          balances: {
            current: balanceCurrent,
            available: 950.0,
          },
        },
      ],
    },
  });
}

describe("exchangeAndStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should exchange token and store bank connection + accounts", async () => {
    setupExchangeMocks();
    const supabase = createExchangeMockSupabase();

    const result = await exchangeAndStore(
      "public-token-abc",
      "hh-123",
      "user-123",
      supabase
    );

    expect(result.bankConnectionId).toBe("bc-uuid-123");
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].name).toBe("Checking");
    expect(mockItemPublicTokenExchange).toHaveBeenCalledWith({
      public_token: "public-token-abc",
    });
  });

  it("should negate liability balance (credit/loan → negative cents)", async () => {
    setupExchangeMocks({ type: "credit", balanceCurrent: 500.0 });
    const supabase = createExchangeMockSupabase();

    await exchangeAndStore("public-token", "hh-123", "user-123", supabase);

    // Credit card with $500 balance should be inserted as -50000 cents
    const { mockAccInsert } = supabase._mocks;
    expect(mockAccInsert).toHaveBeenCalled();
    const insertArgs = mockAccInsert.mock.calls[0][0];
    expect(insertArgs[0].balance_cents).toBe(-50000);
  });

  it("should keep depository balance positive", async () => {
    setupExchangeMocks({ type: "depository", balanceCurrent: 1000.5 });
    const supabase = createExchangeMockSupabase();

    await exchangeAndStore("public-token", "hh-123", "user-123", supabase);

    const { mockAccInsert } = supabase._mocks;
    expect(mockAccInsert).toHaveBeenCalled();
    const insertArgs = mockAccInsert.mock.calls[0][0];
    expect(insertArgs[0].balance_cents).toBe(100050);
  });

  it("should default null balance to 0", async () => {
    setupExchangeMocks({ type: "depository", balanceCurrent: null });
    const supabase = createExchangeMockSupabase();

    await exchangeAndStore("public-token", "hh-123", "user-123", supabase);

    const { mockAccInsert } = supabase._mocks;
    expect(mockAccInsert).toHaveBeenCalled();
    const insertArgs = mockAccInsert.mock.calls[0][0];
    expect(insertArgs[0].balance_cents).toBe(0);
  });

  it("should handle institution name lookup failure (non-critical fallback)", async () => {
    mockItemPublicTokenExchange.mockResolvedValue({
      data: { access_token: "access-sandbox-abc", item_id: "item-123" },
    });
    mockItemGet.mockResolvedValue({
      data: { item: { institution_id: "ins_1" } },
    });
    mockInstitutionsGetById.mockRejectedValue(
      new Error("Institution not found")
    );
    mockAccountsGet.mockResolvedValue({
      data: {
        accounts: [
          {
            account_id: "plaid-acc-1",
            name: "Checking",
            official_name: null,
            mask: "1234",
            type: "depository",
            subtype: "checking",
            balances: { current: 100, available: 100 },
          },
        ],
      },
    });

    const supabase = createExchangeMockSupabase();
    const result = await exchangeAndStore(
      "public-token",
      "hh-123",
      "user-123",
      supabase
    );

    // Should still succeed — institution name lookup failure is non-critical
    expect(result.bankConnectionId).toBe("bc-uuid-123");
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return decrypted access token from vault", async () => {
    const supabase = createGetTokenMockSupabase();
    const token = await getAccessToken("bc-uuid-123", supabase);
    expect(token).toBe("access-sandbox-token");
  });

  it("should throw when vault secret name is missing", async () => {
    const supabase = createGetTokenMockSupabase({
      selectVaultName: { data: { vault_secret_name: null }, error: null },
    });

    await expect(getAccessToken("bc-uuid-123", supabase)).rejects.toThrow(
      "Vault secret not found"
    );
  });

  it("should throw when vault secret is not found", async () => {
    const supabase = createGetTokenMockSupabase({
      rpcGet: { data: null, error: null },
    });

    await expect(getAccessToken("bc-uuid-123", supabase)).rejects.toThrow(
      "Access token not found in Vault"
    );
  });
});

describe("removeAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should remove access token from vault", async () => {
    const supabase = createRemoveTokenMockSupabase();
    await expect(
      removeAccessToken("bc-uuid-123", supabase)
    ).resolves.toBeUndefined();

    expect(supabase.rpc).toHaveBeenCalledWith("delete_plaid_secret", {
      secret_name: "plaid_access_token_bc-uuid-123",
    });
  });

  it("should propagate vault deletion errors", async () => {
    const supabase = createRemoveTokenMockSupabase({
      rpcDelete: { error: new Error("Vault delete failed") },
    });

    await expect(removeAccessToken("bc-uuid-123", supabase)).rejects.toThrow(
      "Vault delete failed"
    );
  });
});
