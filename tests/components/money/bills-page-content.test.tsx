import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BillsPageContent } from "@/components/money/bills-page-content";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { mockUseHousehold, mockUseBills, mockUseDashboardMoney } = vi.hoisted(() => ({
  mockUseHousehold: vi.fn(),
  mockUseBills: vi.fn(),
  mockUseDashboardMoney: vi.fn(),
}));

vi.mock("@/lib/hooks/use-household", () => ({
  useHousehold: () => mockUseHousehold(),
}));

vi.mock("@/lib/hooks/use-bills", () => ({
  useBills: (...args: unknown[]) => mockUseBills(...args),
}));

vi.mock("@/lib/hooks/use-dashboard-money", () => ({
  useDashboardMoney: (...args: unknown[]) => mockUseDashboardMoney(...args),
}));

vi.mock("@/components/money/bills-list", () => ({
  BillsList: () => <div data-testid="bills-list">bills-list</div>,
}));

vi.mock("@/components/money/bill-calendar", () => ({
  BillCalendar: ({ bills }: { bills: unknown[] }) => (
    <div data-testid="bill-calendar">bill-calendar count={bills.length}</div>
  ),
}));

vi.mock("@/components/money/smart-bill-calendar", () => ({
  SmartBillCalendar: ({
    bills,
    dailyBalances,
  }: {
    bills: unknown[];
    dailyBalances: unknown[];
  }) => (
    <div data-testid="smart-bill-calendar">
      smart bills={bills.length} balances={dailyBalances.length}
    </div>
  ),
}));

vi.mock("@/components/money/insight-list", () => ({
  InsightList: ({ page }: { page: string }) => (
    <div data-testid={`insights-${page}`} />
  ),
}));

vi.mock("@/components/money/household-view-tabs", () => ({
  HouseholdViewTabs: ({
    value,
    isMultiMember,
  }: {
    value: string;
    isMultiMember: boolean;
  }) => (
    <div data-testid="household-view-tabs">
      mode={value} multi={String(isMultiMember)}
    </div>
  ),
}));

describe("BillsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHousehold.mockReturnValue({
      viewMode: "mine",
      setViewMode: vi.fn(),
      isMultiMember: false,
    });
    mockUseBills.mockReturnValue({ bills: [{ id: "b1" }, { id: "b2" }] });
    mockUseDashboardMoney.mockReturnValue({ dashboard: null });
  });

  it("renders insights, household tabs, and list tab by default", () => {
    render(<BillsPageContent />);
    expect(screen.getByTestId("insights-bills")).toBeInTheDocument();
    expect(screen.getByTestId("household-view-tabs")).toHaveTextContent(
      "mode=mine multi=false"
    );
    expect(screen.getByTestId("bills-list")).toBeInTheDocument();
  });

  it("passes viewMode to useBills and useDashboardMoney", () => {
    mockUseHousehold.mockReturnValue({
      viewMode: "household",
      setViewMode: vi.fn(),
      isMultiMember: true,
    });

    render(<BillsPageContent />);
    expect(mockUseBills).toHaveBeenCalledWith("household");
    expect(mockUseDashboardMoney).toHaveBeenCalledWith("household");
  });

  it("renders BillCalendar (non-smart) when dashboard has no daily_balances", async () => {
    const user = userEvent.setup();
    render(<BillsPageContent />);
    await user.click(screen.getByRole("tab", { name: /calendarView/ }));
    await waitFor(() => {
      expect(screen.getByTestId("bill-calendar")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("smart-bill-calendar")).not.toBeInTheDocument();
  });

  it("renders BillCalendar when dashboard exists but daily_balances is empty", async () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: { daily_balances: [], daily_spending_rate_cents: 0 },
    });
    const user = userEvent.setup();
    render(<BillsPageContent />);
    await user.click(screen.getByRole("tab", { name: /calendarView/ }));
    await waitFor(() => {
      expect(screen.getByTestId("bill-calendar")).toBeInTheDocument();
    });
  });

  it("renders SmartBillCalendar when daily_balances are present", async () => {
    mockUseDashboardMoney.mockReturnValue({
      dashboard: {
        daily_balances: [{ date: "2026-04-12", balance_cents: 10000 }],
        daily_spending_rate_cents: 500,
      },
    });
    const user = userEvent.setup();
    render(<BillsPageContent />);
    await user.click(screen.getByRole("tab", { name: /calendarView/ }));
    const smart = await screen.findByTestId("smart-bill-calendar");
    expect(smart).toHaveTextContent("smart bills=2 balances=1");
  });

  it("renders BillCalendar when dashboard is missing daily_balances field", async () => {
    mockUseDashboardMoney.mockReturnValue({ dashboard: { other_field: 1 } });
    const user = userEvent.setup();
    render(<BillsPageContent />);
    await user.click(screen.getByRole("tab", { name: /calendarView/ }));
    await waitFor(() => {
      expect(screen.getByTestId("bill-calendar")).toBeInTheDocument();
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<BillsPageContent />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
