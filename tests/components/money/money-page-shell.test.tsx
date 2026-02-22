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

// SWR hook mock
const { mockUseAccounts } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
}));

vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: mockUseAccounts,
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

  it("renders net worth summary when accounts exist", () => {
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

    expect(screen.getByText("accounts.netWorth")).toBeInTheDocument();
    expect(screen.getByText("$5000.00")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    mockUseAccounts.mockReturnValue({
      connections: [],
      netWorthCents: 0,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    render(<MoneyPageShell />);

    expect(screen.getByText("accounts.loading")).toBeInTheDocument();
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
