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
    onEdit,
    onContribute,
  }: {
    goal: { id: string; name: string; status_color: string; current_amount_cents: number; target_amount_cents: number };
    onEdit: (goal: unknown) => void;
    onContribute: (id: string) => void;
  }) => (
    <div data-testid={`goal-card-${goal.id}`}>
      <span>{goal.name}</span>
      <span data-testid={`progress-${goal.id}`}>
        {Math.round((goal.current_amount_cents / goal.target_amount_cents) * 100)}%
      </span>
      <span data-testid={`status-${goal.id}`}>{goal.status_color}</span>
      <button data-testid={`edit-${goal.id}`} onClick={() => onEdit(goal)}>
        Edit
      </button>
      <button data-testid={`contribute-${goal.id}`} onClick={() => onContribute(goal.id)}>
        Contribute
      </button>
    </div>
  ),
}));

vi.mock("@/components/money/goal-form", () => ({
  GoalForm: ({
    open,
    mode,
    onOpenChange,
    onSuccess,
  }: {
    open: boolean;
    mode: string;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  }) =>
    open ? (
      <div data-testid="goal-form" role="dialog" aria-label={`goal-form-${mode}`}>
        <span data-testid="goal-form-mode">{mode}</span>
        <button onClick={() => onOpenChange(false)}>close-goal-form</button>
        <button onClick={onSuccess}>success-goal-form</button>
      </div>
    ) : null,
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

  it("renders error state when hook returns error", () => {
    mockUseGoals.mockReturnValue({
      goals: [],
      isLoading: false,
      error: new Error("boom"),
      mutate: vi.fn(),
    });

    render(<GoalGrid />);
    expect(screen.getByText("fetchError")).toBeInTheDocument();
  });

  it("edit button opens form in edit mode with selected goal", () => {
    mockUseGoals.mockReturnValue({
      goals: [makeGoal({ id: "g1" })],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);
    fireEvent.click(screen.getByTestId("edit-g1"));
    expect(screen.getByRole("dialog", { name: "goal-form-edit" })).toBeInTheDocument();
    expect(screen.getByTestId("goal-form-mode")).toHaveTextContent("edit");
  });

  it("contribute button opens form in contribute mode", () => {
    mockUseGoals.mockReturnValue({
      goals: [makeGoal({ id: "g1" })],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);
    fireEvent.click(screen.getByTestId("contribute-g1"));
    expect(
      screen.getByRole("dialog", { name: "goal-form-contribute" })
    ).toBeInTheDocument();
  });

  it("onSuccess closes form and calls mutate", () => {
    const mutate = vi.fn();
    mockUseGoals.mockReturnValue({
      goals: [makeGoal({ id: "g1" })],
      isLoading: false,
      mutate,
    });

    render(<GoalGrid />);
    fireEvent.click(screen.getByTestId("edit-g1"));
    fireEvent.click(screen.getByRole("button", { name: "success-goal-form" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "goal-form-edit" })).not.toBeInTheDocument();
  });

  it("onOpenChange(false) closes the form", () => {
    mockUseGoals.mockReturnValue({
      goals: [makeGoal({ id: "g1" })],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);
    fireEvent.click(screen.getByTestId("edit-g1"));
    fireEvent.click(screen.getByRole("button", { name: "close-goal-form" }));
    expect(screen.queryByRole("dialog", { name: "goal-form-edit" })).not.toBeInTheDocument();
  });

  it("sorts completed goals to the bottom and goals with deadlines before those without", () => {
    mockUseGoals.mockReturnValue({
      goals: [
        makeGoal({ id: "done", status: "completed", deadline: "2026-02-01" }),
        makeGoal({ id: "no-deadline", deadline: null, created_at: "2026-01-10T00:00:00Z" }),
        makeGoal({ id: "late", deadline: "2026-12-31" }),
        makeGoal({ id: "early", deadline: "2026-03-01" }),
        makeGoal({ id: "no-deadline-new", deadline: null, created_at: "2026-02-10T00:00:00Z" }),
      ],
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<GoalGrid />);
    const cards = container.querySelectorAll('[data-testid^="goal-card-"]');
    const ids = Array.from(cards).map((c) => c.getAttribute("data-testid"));
    expect(ids).toEqual([
      "goal-card-early",
      "goal-card-late",
      "goal-card-no-deadline-new",
      "goal-card-no-deadline",
      "goal-card-done",
    ]);
  });

  it("create goal button from populated view opens create form", () => {
    mockUseGoals.mockReturnValue({
      goals: [makeGoal({ id: "g1" })],
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<GoalGrid />);
    fireEvent.click(screen.getByRole("button", { name: /createGoal/ }));
    expect(
      screen.getByRole("dialog", { name: "goal-form-create" })
    ).toBeInTheDocument();
  });
});
