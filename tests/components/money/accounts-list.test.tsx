import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { AccountsList } from "@/components/money/accounts-list";
import type { ConnectionWithAccounts } from "@/lib/hooks/use-accounts";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-plaid-link
vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: true }),
}));

// Mock formatMoney
vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// SWR mock state
const { mockUseAccounts } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
}));

vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: mockUseAccounts,
}));

// Helper to build a connection fixture
function makeConnection(
  overrides: Partial<ConnectionWithAccounts> = {}
): ConnectionWithAccounts {
  return {
    id: "conn-1",
    household_id: "hh-1",
    provider: "plaid",
    status: "connected",
    plaid_item_id: "item-1",
    institution_id: "ins_1",
    institution_name: "Chase Bank",
    vault_secret_name: null,
    sync_cursor: null,
    last_synced_at: "2026-02-22T00:00:00Z",
    error_code: null,
    error_message: null,
    connected_by: null,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
    sync_status: "synced",
    accounts: [
      {
        id: "acc-1",
        household_id: "hh-1",
        bank_connection_id: "conn-1",
        name: "Checking",
        account_type: "depository",
        balance_cents: 150000,
        currency: "USD",
        is_hidden: false,
        plaid_account_id: "plaid-acc-1",
        official_name: "Chase Total Checking",
        mask: "1234",
        subtype: "checking",
        created_at: "2026-02-22T00:00:00Z",
        updated_at: "2026-02-22T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("AccountsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no connections", () => {
    mockUseAccounts.mockReturnValue({
      connections: [],
      netWorthCents: 0,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<AccountsList />);

    // AccountsEmptyState renders the emptyState.heading key
    expect(screen.getByText("emptyState.heading")).toBeInTheDocument();
  });

  it("shows net worth summary", () => {
    mockUseAccounts.mockReturnValue({
      connections: [makeConnection()],
      netWorthCents: 350000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<AccountsList />);

    expect(screen.getByText("accounts.netWorth")).toBeInTheDocument();
    // Net worth is $3500.00 (different from the single account balance of $1500.00)
    expect(screen.getByText("$3500.00")).toBeInTheDocument();
  });

  it("groups accounts by institution", () => {
    const conn1 = makeConnection({
      id: "conn-1",
      institution_name: "Chase Bank",
    });
    const conn2 = makeConnection({
      id: "conn-2",
      institution_name: "Wells Fargo",
      accounts: [
        {
          id: "acc-2",
          household_id: "hh-1",
          bank_connection_id: "conn-2",
          name: "Savings",
          account_type: "depository",
          balance_cents: 250000,
          currency: "USD",
          is_hidden: false,
          plaid_account_id: "plaid-acc-2",
          official_name: "Wells Fargo Savings",
          mask: "5678",
          subtype: "savings",
          created_at: "2026-02-22T00:00:00Z",
          updated_at: "2026-02-22T00:00:00Z",
        },
      ],
    });

    mockUseAccounts.mockReturnValue({
      connections: [conn1, conn2],
      netWorthCents: 400000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<AccountsList />);

    expect(screen.getByText("Chase Bank")).toBeInTheDocument();
    expect(screen.getByText("Wells Fargo")).toBeInTheDocument();
  });

  it("shows sync status badges", () => {
    mockUseAccounts.mockReturnValue({
      connections: [makeConnection({ sync_status: "synced" })],
      netWorthCents: 150000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<AccountsList />);

    expect(screen.getByText("syncStatus.synced")).toBeInTheDocument();
  });

  it("shows dismissable error banner when connection has error status", () => {
    mockUseAccounts.mockReturnValue({
      connections: [
        makeConnection({
          sync_status: "error",
          status: "error",
          error_message: "ITEM_LOGIN_REQUIRED",
        }),
      ],
      netWorthCents: 150000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<AccountsList />);

    // Error banner should be visible (AlertTitle + sr-only AlertDescription both have this text)
    const errorBannerElements = screen.getAllByText("accounts.errorBanner");
    expect(errorBannerElements.length).toBeGreaterThanOrEqual(1);
    // Dismiss button should be present
    expect(
      screen.getByRole("button", { name: "accounts.errorBannerDismiss" })
    ).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    mockUseAccounts.mockReturnValue({
      connections: [makeConnection()],
      netWorthCents: 150000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<AccountsList />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
