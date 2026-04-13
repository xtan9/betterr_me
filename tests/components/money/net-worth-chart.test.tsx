import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
// The Tooltip mock captures the passed `content` prop (the CustomTooltip element)
// so we can render it and trigger branches.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`line-${dataKey}`} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => (
    <div data-testid="y-axis">
      <span data-testid="tick-small">{tickFormatter?.(500 * 100)}</span>
      <span data-testid="tick-mid">{tickFormatter?.(12_000 * 100)}</span>
      <span data-testid="tick-large">{tickFormatter?.(2_500_000 * 100)}</span>
      <span data-testid="tick-negative">{tickFormatter?.(-750 * 100)}</span>
    </div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: { content: React.ReactElement }) => {
    const el = content as React.ReactElement<{
      active?: boolean;
      payload?: Array<{ value: number; dataKey: string }>;
      label?: string;
    }>;
    return (
      <div data-testid="tooltip">
        <div data-testid="tooltip-inactive">
          {/* Clone with active=false to cover the null branch */}
          {React.cloneElement(el, { active: false, payload: [], label: "x" })}
        </div>
        <div data-testid="tooltip-empty-payload">
          {/* active but no payload */}
          {React.cloneElement(el, { active: true, payload: [], label: "x" })}
        </div>
        <div data-testid="tooltip-active">
          {React.cloneElement(el, {
            active: true,
            label: "Feb 2026",
            payload: [
              { value: 120000, dataKey: "total_cents" },
              { value: 150000, dataKey: "assets_cents" },
              { value: 30000, dataKey: "liabilities_cents" },
            ],
          })}
        </div>
        <div data-testid="tooltip-only-total">
          {React.cloneElement(el, {
            active: true,
            label: "Jan 2026",
            payload: [{ value: 100000, dataKey: "total_cents" }],
          })}
        </div>
      </div>
    );
  },
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

  it("renders error state and hides the chart when hook returns error", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [],
      isLoading: false,
      error: new Error("boom"),
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    expect(screen.getByText("chartError")).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("renders asset/liability breakdown lines when snapshots include them", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        {
          snapshot_date: "2026-02-01",
          total_cents: 120000,
          assets_cents: 150000,
          liabilities_cents: 30000,
          label: "Feb 2026",
        },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    expect(screen.getByTestId("line-total_cents")).toBeInTheDocument();
    expect(screen.getByTestId("line-assets_cents")).toBeInTheDocument();
    expect(screen.getByTestId("line-liabilities_cents")).toBeInTheDocument();
  });

  it("omits breakdown lines when snapshots only have totals", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-02-01", total_cents: 120000, label: "Feb 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    expect(screen.getByTestId("line-total_cents")).toBeInTheDocument();
    expect(screen.queryByTestId("line-assets_cents")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-liabilities_cents")).not.toBeInTheDocument();
  });

  it("formats Y-axis ticks for small/medium/large/negative values", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-02-01", total_cents: 100, label: "Feb 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    const yAxis = screen.getByTestId("y-axis");
    expect(within(yAxis).getByTestId("tick-small")).toHaveTextContent("$500");
    expect(within(yAxis).getByTestId("tick-mid")).toHaveTextContent("$12K");
    expect(within(yAxis).getByTestId("tick-large")).toHaveTextContent("$2.5M");
    expect(within(yAxis).getByTestId("tick-negative")).toHaveTextContent("$750");
  });

  it("CustomTooltip renders label + series values when active with payload", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-02-01", total_cents: 120000, label: "Feb 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    const active = screen.getByTestId("tooltip-active");
    expect(within(active).getByText("Feb 2026")).toBeInTheDocument();
    expect(within(active).getByText(/netWorthLabel: \$1200\.00/)).toBeInTheDocument();
    expect(within(active).getByText(/assets: \$1500\.00/)).toBeInTheDocument();
    expect(within(active).getByText(/liabilities: \$300\.00/)).toBeInTheDocument();
  });

  it("CustomTooltip returns null when inactive or payload empty", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-02-01", total_cents: 120000, label: "Feb 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    const inactive = screen.getByTestId("tooltip-inactive");
    expect(inactive.children.length).toBe(0);
    const empty = screen.getByTestId("tooltip-empty-payload");
    expect(empty.children.length).toBe(0);
  });

  it("CustomTooltip only renders available series (total only)", () => {
    mockUseNetWorthHistory.mockReturnValue({
      snapshots: [
        { snapshot_date: "2026-01-01", total_cents: 100000, label: "Jan 2026" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(<NetWorthChart />);
    const onlyTotal = screen.getByTestId("tooltip-only-total");
    expect(within(onlyTotal).getByText(/netWorthLabel: \$1000\.00/)).toBeInTheDocument();
    expect(within(onlyTotal).queryByText(/^assets:/)).not.toBeInTheDocument();
    expect(within(onlyTotal).queryByText(/^liabilities:/)).not.toBeInTheDocument();
  });

  it("can cycle through all period buttons", () => {
    render(<NetWorthChart />);
    for (const key of ["period1M", "period3M", "period6M", "period1Y", "periodAll"]) {
      fireEvent.click(screen.getByText(key));
    }
    const calls = mockUseNetWorthHistory.mock.calls.map((c) => c[0]);
    expect(calls).toContain("1M");
    expect(calls).toContain("ALL");
  });
});
