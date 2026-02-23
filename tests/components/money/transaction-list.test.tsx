import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { TransactionList } from "@/components/money/transaction-list";
import type { Transaction, Category } from "@/lib/db/types";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key}:${JSON.stringify(params)}`;
      }
      return key;
    },
}));

// Mock sub-components to isolate TransactionList logic
vi.mock("@/components/money/transaction-search", () => ({
  TransactionSearch: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string | null) => void;
  }) => (
    <label>
      Search
      <input
        data-testid="transaction-search"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  ),
}));

vi.mock("@/components/money/transaction-filter-bar", () => ({
  TransactionFilterBar: ({
    activeFilterCount,
    onClearAll,
  }: {
    activeFilterCount: number;
    onClearAll: () => void;
  }) => (
    <div data-testid="filter-bar" data-active-count={activeFilterCount}>
      <button onClick={onClearAll}>Clear</button>
    </div>
  ),
}));

vi.mock("@/components/money/transaction-row", () => ({
  TransactionRow: ({
    transaction,
    onClick,
  }: {
    transaction: Transaction;
    category?: Category | null;
    onClick?: () => void;
    isExpanded?: boolean;
  }) => (
    <button data-testid={`tx-row-${transaction.id}`} onClick={onClick}>
      {transaction.merchant_name || transaction.description}
    </button>
  ),
}));

vi.mock("@/components/money/transaction-detail", () => ({
  TransactionDetail: () => <div data-testid="transaction-detail" />,
}));

// Mock formatMoney
vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock getLocalDateString to return consistent dates
vi.mock("@/lib/utils", () => ({
  getLocalDateString: (d?: Date) => {
    if (d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return "2026-02-22";
  },
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// SWR hook mocks
const { mockUseTransactions, mockUseTransactionFilters, mockUseCategories } =
  vi.hoisted(() => ({
    mockUseTransactions: vi.fn(),
    mockUseTransactionFilters: vi.fn(),
    mockUseCategories: vi.fn(),
  }));

vi.mock("@/lib/hooks/use-transactions", () => ({
  useTransactions: (...args: unknown[]) => mockUseTransactions(...args),
}));

vi.mock("@/lib/hooks/use-transaction-filters", () => ({
  useTransactionFilters: () => mockUseTransactionFilters(),
}));

vi.mock("@/lib/hooks/use-categories", () => ({
  useCategories: () => mockUseCategories(),
}));

// Helper to build a transaction fixture
function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    household_id: "hh-1",
    account_id: "acc-1",
    amount_cents: -2500,
    description: "Coffee Shop",
    merchant_name: "Starbucks",
    category: "food",
    category_id: "cat-food",
    notes: null,
    transaction_date: "2026-02-22",
    is_pending: false,
    plaid_transaction_id: null,
    plaid_category_primary: null,
    plaid_category_detailed: null,
    source: "plaid",
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
    ...overrides,
  };
}

function setupDefaultMocks(
  overrides: {
    transactions?: Transaction[];
    total?: number;
    hasMore?: boolean;
    isLoading?: boolean;
    isLoadingMore?: boolean;
    activeFilterCount?: number;
    categories?: Category[];
  } = {}
) {
  mockUseTransactionFilters.mockReturnValue({
    filters: {},
    activeFilterCount: overrides.activeFilterCount ?? 0,
    setFilter: vi.fn(),
    setFilters: vi.fn(),
    clearAll: vi.fn(),
  });

  mockUseTransactions.mockReturnValue({
    transactions: overrides.transactions ?? [],
    total: overrides.total ?? 0,
    hasMore: overrides.hasMore ?? false,
    isLoading: overrides.isLoading ?? false,
    isLoadingMore: overrides.isLoadingMore ?? false,
    error: undefined,
    loadMore: vi.fn(),
    mutate: vi.fn(),
  });

  mockUseCategories.mockReturnValue({
    categories: overrides.categories ?? [],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  });
}

describe("TransactionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeleton when isLoading is true", () => {
    setupDefaultMocks({ isLoading: true });

    const { container } = render(<TransactionList />);

    // Skeleton uses animate-pulse class on div elements
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
    // Should NOT render any transaction rows or empty state
    expect(screen.queryByText("transactions.noTransactions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("transaction-search")).not.toBeInTheDocument();
  });

  it("renders empty state when transactions is empty and no filters active", () => {
    setupDefaultMocks({ transactions: [], activeFilterCount: 0 });

    render(<TransactionList />);

    expect(
      screen.getByText("transactions.noTransactions")
    ).toBeInTheDocument();
    expect(
      screen.getByText("transactions.noTransactionsDescription")
    ).toBeInTheDocument();
  });

  it("renders no-results message when transactions is empty and filters are active", () => {
    setupDefaultMocks({ transactions: [], activeFilterCount: 2 });

    render(<TransactionList />);

    expect(
      screen.getByText("transactions.noMatchingTransactions")
    ).toBeInTheDocument();
    expect(
      screen.getByText("transactions.tryDifferentFilters")
    ).toBeInTheDocument();
    // Clear all button visible
    expect(
      screen.getByText("transactions.filters.clearAll")
    ).toBeInTheDocument();
  });

  it("renders transaction rows grouped by date", () => {
    const tx1 = makeTransaction({
      id: "tx-1",
      transaction_date: "2026-02-22",
      merchant_name: "Starbucks",
    });
    const tx2 = makeTransaction({
      id: "tx-2",
      transaction_date: "2026-02-22",
      merchant_name: "Amazon",
    });
    const tx3 = makeTransaction({
      id: "tx-3",
      transaction_date: "2026-02-20",
      merchant_name: "Target",
    });

    setupDefaultMocks({
      transactions: [tx1, tx2, tx3],
      total: 3,
    });

    render(<TransactionList />);

    // Should show date group headers
    expect(screen.getByText("transactions.today")).toBeInTheDocument();
    // Should show all transaction rows
    expect(screen.getByTestId("tx-row-tx-1")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-tx-2")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-tx-3")).toBeInTheDocument();
  });

  it("shows 'Today' header for today's transactions", () => {
    const tx = makeTransaction({
      id: "tx-today",
      transaction_date: "2026-02-22", // matches our mocked "today"
    });

    setupDefaultMocks({ transactions: [tx], total: 1 });

    render(<TransactionList />);

    expect(screen.getByText("transactions.today")).toBeInTheDocument();
  });

  it("shows 'Yesterday' header for yesterday's transactions", () => {
    const tx = makeTransaction({
      id: "tx-yesterday",
      transaction_date: "2026-02-21", // yesterday relative to mocked today
    });

    setupDefaultMocks({ transactions: [tx], total: 1 });

    render(<TransactionList />);

    expect(screen.getByText("transactions.yesterday")).toBeInTheDocument();
  });

  it("shows correct number of transaction rows", () => {
    const transactions = [
      makeTransaction({ id: "tx-1", merchant_name: "Shop A" }),
      makeTransaction({ id: "tx-2", merchant_name: "Shop B" }),
      makeTransaction({ id: "tx-3", merchant_name: "Shop C" }),
      makeTransaction({ id: "tx-4", merchant_name: "Shop D" }),
    ];

    setupDefaultMocks({ transactions, total: 4 });

    render(<TransactionList />);

    expect(screen.getByTestId("tx-row-tx-1")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-tx-2")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-tx-3")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-tx-4")).toBeInTheDocument();
  });

  it("shows Load More button when hasMore is true", () => {
    const tx = makeTransaction({ id: "tx-1" });

    setupDefaultMocks({ transactions: [tx], total: 100, hasMore: true });

    render(<TransactionList />);

    expect(screen.getByText("transactions.loadMore")).toBeInTheDocument();
  });

  it("hides Load More button when hasMore is false", () => {
    const tx = makeTransaction({ id: "tx-1" });

    setupDefaultMocks({ transactions: [tx], total: 1, hasMore: false });

    render(<TransactionList />);

    expect(
      screen.queryByText("transactions.loadMore")
    ).not.toBeInTheDocument();
  });

  it("displays total count showing X of Y transactions", () => {
    const transactions = [
      makeTransaction({ id: "tx-1" }),
      makeTransaction({ id: "tx-2" }),
    ];

    setupDefaultMocks({ transactions, total: 50, hasMore: true });

    render(<TransactionList />);

    // The i18n mock returns key:params format
    expect(
      screen.getByText('transactions.showingCount:{"shown":2,"total":50}')
    ).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const tx = makeTransaction({ id: "tx-1" });
    setupDefaultMocks({ transactions: [tx], total: 1 });

    const { container } = render(<TransactionList />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
