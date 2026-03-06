import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { MoneyPageShell } from "@/components/money/money-page-shell";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock react-plaid-link
vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: true }),
}));

// Mock formatMoney
vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// SWR hook mock for useAccounts (connection detection)
const { mockUseAccounts } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
}));

vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: mockUseAccounts,
}));

// Mock sub-components to isolate MoneyPageShell tests
vi.mock("@/components/money/money-dashboard", () => ({
  MoneyDashboard: ({ viewMode }: { viewMode: string }) => (
    <div data-testid="money-dashboard" data-view-mode={viewMode}>
      MoneyDashboard
    </div>
  ),
}));

describe("MoneyPageShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when no connections", () => {
    mockUseAccounts.mockReturnValue({
      connections: [],
      netWorthCents: 0,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<MoneyPageShell />);

    expect(screen.getByText("emptyState.heading")).toBeInTheDocument();
  });

  it("renders MoneyDashboard when accounts exist", () => {
    mockUseAccounts.mockReturnValue({
      connections: [
        {
          id: "conn-1",
          institution_name: "Chase",
          sync_status: "synced",
          accounts: [],
        },
      ],
      netWorthCents: 500000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<MoneyPageShell />);

    expect(screen.getByTestId("money-dashboard")).toBeInTheDocument();
    expect(screen.getByText("MoneyDashboard")).toBeInTheDocument();
  });

  it("passes viewMode to MoneyDashboard", () => {
    mockUseAccounts.mockReturnValue({
      connections: [
        {
          id: "conn-1",
          institution_name: "Chase",
          sync_status: "synced",
          accounts: [],
        },
      ],
      netWorthCents: 500000,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<MoneyPageShell />);

    // Default view mode is "mine"
    expect(screen.getByTestId("money-dashboard")).toHaveAttribute(
      "data-view-mode",
      "mine"
    );
  });

  it("renders loading state", () => {
    mockUseAccounts.mockReturnValue({
      connections: [],
      netWorthCents: 0,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    const { container } = render(<MoneyPageShell />);

    // Loading state renders skeleton placeholders (no text)
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("has no accessibility violations", async () => {
    mockUseAccounts.mockReturnValue({
      connections: [],
      netWorthCents: 0,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<MoneyPageShell />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
