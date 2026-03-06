import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { GoalGrid } from "@/components/money/goal-grid";

expect.extend(matchers);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/money/arithmetic", () => ({
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// Mock sub-components to isolate GoalGrid
vi.mock("@/components/money/goal-card", () => ({
  GoalCard: ({
    goal,
  }: {
    goal: { id: string; name: string; status_color: string; current_amount_cents: number; target_amount_cents: number };
  }) => (
    <div data-testid={`goal-card-${goal.id}`}>
      <span>{goal.name}</span>
      <span data-testid={`progress-${goal.id}`}>
        {Math.round((goal.current_amount_cents / goal.target_amount_cents) * 100)}%
      </span>
      <span data-testid={`status-${goal.id}`}>{goal.status_color}</span>
    </div>
  ),
}));

vi.mock("@/components/money/goal-form", () => ({
  GoalForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="goal-form">Goal Form</div> : null,
}));

// Mock useGoals hook
const { mockUseGoals } = vi.hoisted(() => ({
  mockUseGoals: vi.fn(),
}));

vi.mock("@/lib/hooks/use-goals", () => ({
  useGoals: mockUseGoals,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoal(overrides: Partial<{
  id: string;
  name: string;
  target_amount_cents: number;
  current_amount_cents: number;
  status: string;
  status_color: string;
  deadline: string | null;
  funding_type: string;
  projected_date: string | null;
  monthly_rate_cents: number;
  created_at: string;
}>) {
  return {
    id: "goal-1",
    name: "Emergency Fund",
    target_amount_cents: 1000000,
    current_amount_cents: 250000,
    status: "active",
    status_color: "green",
    deadline: "2026-12-31",
    funding_type: "manual",
    linked_account_id: null,
    projected_date: "2026-10-15",
    monthly_rate_cents: 100000,
    icon: null,
    color: null,
    household_id: "hh-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GoalGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders goal cards in grid layout", () => {
    mockUseGoals.mockReturnValue({
      goals: [
        makeGoal({ id: "g1", name: "Emergency Fund" }),
        makeGoal({ id: "g2", name: "Vacation", status_color: "yellow" }),
      ],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);

    expect(screen.getByTestId("goal-card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("goal-card-g2")).toBeInTheDocument();
  });

  it("shows correct progress percentage on goal cards", () => {
    mockUseGoals.mockReturnValue({
      goals: [
        makeGoal({
          id: "g1",
          name: "Emergency Fund",
          current_amount_cents: 500000,
          target_amount_cents: 1000000,
        }),
      ],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);

    expect(screen.getByTestId("progress-g1")).toHaveTextContent("50%");
  });

  it("displays color-coded status based on projection", () => {
    mockUseGoals.mockReturnValue({
      goals: [
        makeGoal({ id: "g1", status_color: "green" }),
        makeGoal({ id: "g2", name: "Vacation", status_color: "yellow" }),
        makeGoal({ id: "g3", name: "Car", status_color: "red" }),
      ],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);

    expect(screen.getByTestId("status-g1")).toHaveTextContent("green");
    expect(screen.getByTestId("status-g2")).toHaveTextContent("yellow");
    expect(screen.getByTestId("status-g3")).toHaveTextContent("red");
  });

  it("renders empty state when no goals", () => {
    mockUseGoals.mockReturnValue({
      goals: [],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);

    expect(screen.getByText("emptyHeading")).toBeInTheDocument();
    expect(screen.getByText("emptyDescription")).toBeInTheDocument();
  });

  it("create goal button opens form", () => {
    mockUseGoals.mockReturnValue({
      goals: [],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);

    // Click the Create Goal button
    fireEvent.click(screen.getByText("createGoal"));

    expect(screen.getByTestId("goal-form")).toBeInTheDocument();
  });

  it("renders loading skeletons when data is loading", () => {
    mockUseGoals.mockReturnValue({
      goals: [],
      isLoading: true,
      mutate: vi.fn(),
    });

    const { container } = render(<GoalGrid />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("has no accessibility violations", async () => {
    mockUseGoals.mockReturnValue({
      goals: [],
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<GoalGrid />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
