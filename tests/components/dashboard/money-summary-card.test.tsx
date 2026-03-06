import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneySummaryCard } from "@/components/dashboard/money-summary-card";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

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

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock useMoneySummary hook
const { mockUseMoneySummary } = vi.hoisted(() => ({
  mockUseMoneySummary: vi.fn(),
}));

vi.mock("@/lib/hooks/use-money-summary", () => ({
  useMoneySummary: mockUseMoneySummary,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MoneySummaryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when hasAccounts is false", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: null,
      isLoading: false,
      hasAccounts: false,
    });

    const { container } = render(<MoneySummaryCard />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when loading", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: null,
      isLoading: true,
      hasAccounts: false,
    });

    const { container } = render(<MoneySummaryCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders spending pulse when data available", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: {
        spent_today_cents: 3500,
        spent_this_week_cents: 25_000,
        budget_total_cents: null,
        has_accounts: true,
      },
      isLoading: false,
      hasAccounts: true,
    });

    render(<MoneySummaryCard />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText(/\$35\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$250\.00/)).toBeInTheDocument();
  });

  it("shows progress bar when budget exists", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: {
        spent_today_cents: 5_000,
        spent_this_week_cents: 50_000,
        budget_total_cents: 400_000, // $4,000/mo => ~$923/wk
        has_accounts: true,
      },
      isLoading: false,
      hasAccounts: true,
    });

    const { container } = render(<MoneySummaryCard />);

    // Progress bar should be visible
    const progressBar = container.querySelector("[style*='width']");
    expect(progressBar).toBeTruthy();
  });

  it("links to /money", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: {
        spent_today_cents: 1_000,
        spent_this_week_cents: 10_000,
        budget_total_cents: null,
        has_accounts: true,
      },
      isLoading: false,
      hasAccounts: true,
    });

    render(<MoneySummaryCard />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/money");
  });

  it("does not show progress bar when no budget", () => {
    mockUseMoneySummary.mockReturnValue({
      summary: {
        spent_today_cents: 1_000,
        spent_this_week_cents: 10_000,
        budget_total_cents: null,
        has_accounts: true,
      },
      isLoading: false,
      hasAccounts: true,
    });

    const { container } = render(<MoneySummaryCard />);

    // No progress bar width style
    const progressBar = container.querySelector("[style*='width']");
    expect(progressBar).toBeNull();
  });
});
