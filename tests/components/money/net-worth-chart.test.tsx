import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { NetWorthChart } from "@/components/money/net-worth-chart";

expect.extend(matchers);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock Recharts to avoid canvas issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

// Mock useNetWorthHistory hook
const { mockUseNetWorthHistory } = vi.hoisted(() => ({
  mockUseNetWorthHistory: vi.fn(),
}));

vi.mock("@/lib/hooks/use-net-worth", () => ({
  useNetWorthHistory: mockUseNetWorthHistory,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NetWorthChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
  });

  it("renders chart container", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-01-01", total_cents: 100000, label: "Jan 2026" },
        { snapshot_date: "2026-02-01", total_cents: 120000, label: "Feb 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);

    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("renders timeframe toggle buttons (1M, 3M, 6M, 1Y, All)", () => {
    render(<NetWorthChart />);

    expect(screen.getByText("period1M")).toBeInTheDocument();
    expect(screen.getByText("period3M")).toBeInTheDocument();
    expect(screen.getByText("period6M")).toBeInTheDocument();
    expect(screen.getByText("period1Y")).toBeInTheDocument();
    expect(screen.getByText("periodAll")).toBeInTheDocument();
  });

  it("clicking timeframe button changes selected period", () => {
    render(<NetWorthChart />);

    // Default period is 6M, so click 1Y
    fireEvent.click(screen.getByText("period1Y"));

    // The hook should be called with "1Y" after click
    // Since the hook is called on render and after state change,
    // check that the last call uses "1Y"
    const calls = mockUseNetWorthHistory.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("1Y");
  });

  it("shows empty state when no snapshot data", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);

    expect(screen.getByText("noData")).toBeInTheDocument();
    expect(screen.getByText("noDataDescription")).toBeInTheDocument();
  });

  it("shows loading spinner when data is loading", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [],
      isLoading: true,
      error: undefined,
      mutate: vi.fn(),
    });

    const { container } = render(<NetWorthChart />);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<NetWorthChart />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
