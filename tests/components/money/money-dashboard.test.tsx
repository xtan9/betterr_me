import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyDashboard } from "@/components/money/money-dashboard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock sub-components to isolate MoneyDashboard tests
vi.mock("@/components/money/dashboard-hero", () => ({
  DashboardHero: (props: Record<string, unknown>) => (
    <div data-testid="dashboard-hero" data-available={props.availableCents}>
      DashboardHero
    </div>
  ),
}));

vi.mock("@/components/money/upcoming-bills-list", () => ({
  UpcomingBillsList: () => <div data-testid="upcoming-bills">UpcomingBillsList</div>,
}));

vi.mock("@/components/money/cash-flow-projection", () => ({
  CashFlowProjection: () => (
    <div data-testid="cash-flow-projection">CashFlowProjection</div>
  ),
}));

vi.mock("@/components/money/income-confirmation", () => ({
  IncomeConfirmation: () => (
    <div data-testid="income-confirmation">IncomeConfirmation</div>
  ),
}));

vi.mock("@/components/money/insight-list", () => ({
  InsightList: () => <div data-testid="insight-list">InsightList</div>,
}));

// Mock useDashboardMoney hook
const { mockUseDashboardMoney } = vi.hoisted(() => ({
  mockUseDashboardMoney: vi.fn(),
}));

vi.mock("@/lib/hooks/use-dashboard-money", () => ({
  useDashboardMoney: mockUseDashboardMoney,
}));

// ---------------------------------------------------------------------------
// Mock dashboard data
// ---------------------------------------------------------------------------

const baseDashboard = {
  available_cents: 150_000,
  upcoming_bills_total_cents: -35_000,
  end_of_month_balance_cents: 120_000,
  daily_spending_rate_cents: 5_000,
  daily_balances: [],
  upcoming_bills: [],
  income_status: {
    detected: null,
    confirmed: null,
    needs_confirmation: false,
  },
  has_confirmed_income: false,
  confidence_label: "estimated" as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MoneyDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hero section when data loaded", () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: baseDashboard,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<MoneyDashboard viewMode="mine" />);

    expect(screen.getByTestId("dashboard-hero")).toBeInTheDocument();
    expect(screen.getByTestId("upcoming-bills")).toBeInTheDocument();
    expect(screen.getByTestId("cash-flow-projection")).toBeInTheDocument();
    expect(screen.getByTestId("insight-list")).toBeInTheDocument();
  });

  it("shows income confirmation when needs_confirmation true", () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: {
        ...baseDashboard,
        income_status: {
          detected: [
            {
              merchant_name: "Acme Corp",
              amount_cents: 500_000,
              frequency: "MONTHLY",
              confidence: 0.92,
              last_occurrence: "2026-02-01",
              next_predicted: "2026-03-01",
            },
          ],
          confirmed: null,
          needs_confirmation: true,
        },
      },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<MoneyDashboard viewMode="mine" />);

    expect(screen.getByTestId("income-confirmation")).toBeInTheDocument();
  });

  it("hides income confirmation when confirmed", () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: baseDashboard,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<MoneyDashboard viewMode="mine" />);

    expect(screen.queryByTestId("income-confirmation")).not.toBeInTheDocument();
  });

  it("shows loading skeleton initially", () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: null,
      isLoading: true,
      error: undefined,
      mutate: vi.fn(),
    });

    const { container } = render(<MoneyDashboard viewMode="mine" />);

    // Should show skeleton elements, not dashboard content
    expect(screen.queryByTestId("dashboard-hero")).not.toBeInTheDocument();
    // Check for skeleton elements (animated placeholders)
    const skeletons = container.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("handles error state gracefully (shows skeleton when no data)", () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: null,
      isLoading: false,
      error: new Error("API error"),
      mutate: vi.fn(),
    });

    const { container } = render(<MoneyDashboard viewMode="mine" />);

    // No dashboard data => shows loading skeleton (same as loading state)
    expect(screen.queryByTestId("dashboard-hero")).not.toBeInTheDocument();
    const skeletons = container.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
