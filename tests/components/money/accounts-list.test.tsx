import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
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
const { mockUseAccounts, mockUseHousehold } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
  mockUseHousehold: vi.fn(() => ({
    viewMode: "mine",
    setViewMode: vi.fn(),
    isMultiMember: false,
  })),
}));

vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: mockUseAccounts,
}));

vi.mock("@/lib/hooks/use-household", () => ({
  useHousehold: mockUseHousehold,
}));

// Mock sub-components to isolate AccountsList
vi.mock("@/components/money/plaid-link-button", () => ({
  PlaidLinkButton: () => <button>connectBank</button>,
}));

vi.mock("@/components/money/manual-transaction-dialog", () => ({
  ManualTransactionDialog: ({
    open,
    onOpenChange,
    onSuccess,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="manual-dialog">
        <button onClick={() => onOpenChange(false)}>close-manual</button>
        <button onClick={onSuccess}>manual-success</button>
      </div>
    ) : null,
}));

vi.mock("@/components/money/disconnect-dialog", () => ({
  DisconnectDialog: ({
    open,
    onOpenChange,
    institutionName,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    institutionName: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={`disconnect-${institutionName}`}>
        <button onClick={() => onOpenChange(false)}>close-disconnect</button>
      </div>
    ) : null,
}));

vi.mock("@/components/money/household-view-tabs", () => ({
  HouseholdViewTabs: ({
    isMultiMember,
  }: {
    isMultiMember: boolean;
  }) => <div data-testid="household-view-tabs">multi={String(isMultiMember)}</div>,
}));

vi.mock("@/components/money/account-visibility-selector", () => ({
  AccountVisibilitySelector: ({
    accountId,
  }: {
    accountId: string;
  }) => <div data-testid={`visibility-${accountId}`}>visibility</div>,
}));

vi.mock("@/components/money/account-group", () => ({
  AccountGroup: ({
    connection,
    onSync,
    onDisconnect,
    renderAccountExtra,
  }: {
    connection: ConnectionWithAccounts;
    onSync: (id: string) => void;
    onDisconnect: (id: string) => void;
    renderAccountExtra?: (id: string) => React.ReactNode;
  }) => (
    <div data-testid={`account-group-${connection.id}`}>
      <span>{connection.institution_name}</span>
      {connection.sync_status === "synced" && <span>syncStatus.synced</span>}
      <button onClick={() => onSync(connection.id)}>sync-{connection.id}</button>
      <button onClick={() => onDisconnect(connection.id)}>
        disconnect-{connection.id}
      </button>
      {connection.accounts.map((a) => (
        <div key={a.id}>{renderAccountExtra?.(a.id)}</div>
      ))}
    </div>
  ),
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

  describe("additional coverage", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("renders loading skeletons while loading", () => {
      mockUseAccounts.mockReturnValue({
        connections: [],
        netWorthCents: 0,
        error: undefined,
        isLoading: true,
        mutate: vi.fn(),
      });

      const { container } = render(<AccountsList />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders error state with retry button that calls mutate", () => {
      const mutate = vi.fn();
      mockUseAccounts.mockReturnValue({
        connections: [],
        netWorthCents: 0,
        error: new Error("boom"),
        isLoading: false,
        mutate,
      });

      render(<AccountsList />);

      expect(screen.getByText("accounts.errorTitle")).toBeInTheDocument();
      const retry = screen.getByRole("button", { name: "accounts.retry" });
      fireEvent.click(retry);
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("dismisses error banner when close button is clicked", () => {
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
      const dismiss = screen.getByRole("button", {
        name: "accounts.errorBannerDismiss",
      });
      fireEvent.click(dismiss);
      expect(
        screen.queryByRole("button", { name: "accounts.errorBannerDismiss" })
      ).not.toBeInTheDocument();
    });

    it("sync success calls toast and mutate", async () => {
      const mutate = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      vi.stubGlobal("fetch", fetchMock);

      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate,
      });

      render(<AccountsList />);
      fireEvent.click(screen.getByRole("button", { name: "sync-conn-1" }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("accounts.syncSuccess");
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/money/accounts/conn-1/sync",
        expect.objectContaining({ method: "POST" })
      );
      expect(mutate).toHaveBeenCalledWith(undefined, { revalidate: false });
    });

    it("sync failure with ok=false shows error toast", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Plaid down" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      render(<AccountsList />);
      fireEvent.click(screen.getByRole("button", { name: "sync-conn-1" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("accounts.syncError");
      });
    });

    it("sync failure with non-json body still shows error toast", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("no json");
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      render(<AccountsList />);
      fireEvent.click(screen.getByRole("button", { name: "sync-conn-1" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("accounts.syncError");
      });
    });

    it("disconnect opens the disconnect dialog then closes it", () => {
      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      render(<AccountsList />);
      fireEvent.click(screen.getByRole("button", { name: "disconnect-conn-1" }));
      expect(
        screen.getByRole("dialog", { name: "disconnect-Chase Bank" })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "close-disconnect" }));
      expect(
        screen.queryByRole("dialog", { name: "disconnect-Chase Bank" })
      ).not.toBeInTheDocument();
    });

    it("disconnect falls back to empty institution name when connection missing", () => {
      mockUseAccounts.mockReturnValue({
        connections: [makeConnection({ id: "conn-1", institution_name: "" })],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      render(<AccountsList />);
      fireEvent.click(screen.getByRole("button", { name: "disconnect-conn-1" }));
      expect(screen.getByRole("dialog", { name: "disconnect-" })).toBeInTheDocument();
    });

    it("opens manual transaction dialog from dropdown", async () => {
      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      const user = userEvent.setup();
      render(<AccountsList />);
      await user.click(
        screen.getByRole("button", { name: /accounts\.otherOptions/ })
      );
      const item = await screen.findByRole("menuitem", {
        name: /accounts\.manualEntry/,
      });
      await user.click(item);
      expect(
        await screen.findByRole("dialog", { name: "manual-dialog" })
      ).toBeInTheDocument();
    });

    it("manual dialog onSuccess triggers mutate without revalidate", async () => {
      const mutate = vi.fn();
      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate,
      });

      const user = userEvent.setup();
      render(<AccountsList />);
      await user.click(
        screen.getByRole("button", { name: /accounts\.otherOptions/ })
      );
      const item = await screen.findByRole("menuitem", {
        name: /accounts\.manualEntry/,
      });
      await user.click(item);
      fireEvent.click(
        await screen.findByRole("button", { name: "manual-success" })
      );
      expect(mutate).toHaveBeenCalledWith(undefined, { revalidate: false });
    });

    it("renders AccountVisibilitySelector extras when household is multi-member", () => {
      mockUseHousehold.mockReturnValueOnce({
        viewMode: "mine",
        setViewMode: vi.fn(),
        isMultiMember: true,
      });
      mockUseAccounts.mockReturnValue({
        connections: [makeConnection()],
        netWorthCents: 150000,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      });

      render(<AccountsList />);
      expect(screen.getByTestId("visibility-acc-1")).toBeInTheDocument();
      expect(screen.getByTestId("household-view-tabs")).toHaveTextContent(
        "multi=true"
      );
    });
  });
});
