import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { MilestoneCard, MilestoneCards } from "@/components/habits/milestone-card";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key;
      for (const [k, v] of Object.entries(params)) {
        result += ` ${k}=${v}`;
      }
      return result;
    }
    return key;
  },
}));

const baseMilestone = {
  id: "m1",
  habit_id: "h1",
  user_id: "u1",
  milestone: 7,
  achieved_at: "2026-02-09T10:00:00Z",
  created_at: "2026-02-09T10:00:00Z",
};

describe("MilestoneCard", () => {
  it("renders celebration message with habit name", () => {
    render(<MilestoneCard milestone={baseMilestone} habitName="Morning Run" />);
    expect(screen.getByText(/celebration.*habit=Morning Run.*count=7/)).toBeInTheDocument();
  });

  it("renders celebration7 sub-message for 7-day milestone", () => {
    render(<MilestoneCard milestone={baseMilestone} habitName="Read" />);
    expect(screen.getByText("celebration7")).toBeInTheDocument();
  });

  it("renders celebration30 for 30-day milestone", () => {
    render(
      <MilestoneCard
        milestone={{ ...baseMilestone, milestone: 30 }}
        habitName="Meditate"
      />
    );
    expect(screen.getByText("celebration30")).toBeInTheDocument();
  });

  it("renders celebration365 for 365-day milestone", () => {
    render(
      <MilestoneCard
        milestone={{ ...baseMilestone, milestone: 365 }}
        habitName="Exercise"
      />
    );
    expect(screen.getByText("celebration365")).toBeInTheDocument();
  });

  it("renders no sub-message for unknown milestone threshold", () => {
    const { container } = render(
      <MilestoneCard
        milestone={{ ...baseMilestone, milestone: 999 }}
        habitName="Walk"
      />
    );
    // Primary celebration message should render
    expect(screen.getByText(/celebration.*habit=Walk.*count=999/)).toBeInTheDocument();
    // No sub-message element with a threshold-specific key
    const subMessages = container.querySelectorAll("p.text-sm");
    expect(subMessages.length).toBe(0);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <MilestoneCard milestone={baseMilestone} habitName="Run" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MilestoneCards", () => {
  const habits = [
    { id: "h1", name: "Run", user_id: "u1", description: null, category: null, frequency: { type: "daily" as const }, status: "active" as const, current_streak: 7, best_streak: 7, paused_at: null, created_at: "", updated_at: "" },
    { id: "h2", name: "Read", user_id: "u1", description: null, category: null, frequency: { type: "daily" as const }, status: "active" as const, current_streak: 14, best_streak: 14, paused_at: null, created_at: "", updated_at: "" },
  ];

  it("renders nothing when no milestones", () => {
    const { container } = render(
      <MilestoneCards milestones={[]} habits={habits} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders max 2 milestone cards", () => {
    const milestones = [
      { ...baseMilestone, id: "m1", habit_id: "h1", milestone: 7 },
      { ...baseMilestone, id: "m2", habit_id: "h2", milestone: 14 },
      { ...baseMilestone, id: "m3", habit_id: "h1", milestone: 30 },
    ];
    render(<MilestoneCards milestones={milestones} habits={habits} />);
    const cards = screen.getAllByText(/celebration /);
    expect(cards.length).toBe(2);
  });

  it("filters out milestones referencing non-existent habits", () => {
    const milestones = [
      { ...baseMilestone, id: "m1", habit_id: "h-deleted", milestone: 7 },
      { ...baseMilestone, id: "m2", habit_id: "h1", milestone: 14 },
    ];
    render(<MilestoneCards milestones={milestones} habits={habits} />);
    const cards = screen.getAllByText(/celebration /);
    expect(cards.length).toBe(1);
    expect(screen.getByText(/habit=Run/)).toBeInTheDocument();
  });

  it("renders nothing when all milestones reference non-existent habits", () => {
    const milestones = [
      { ...baseMilestone, id: "m1", habit_id: "h-deleted", milestone: 7 },
      { ...baseMilestone, id: "m2", habit_id: "h-gone", milestone: 14 },
    ];
    const { container } = render(
      <MilestoneCards milestones={milestones} habits={habits} />
    );
    expect(container.innerHTML).toBe("");
  });
});
