import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DailySnapshot } from "@/components/dashboard/daily-snapshot";

const messages = {
  dashboard: {
    snapshot: {
      title: "Today's Snapshot",
      activeHabits: "Active Habits",
      todaysProgress: "Today's Progress",
      currentStreak: "Current Streak",
      completionRate: "{percent}% completion rate",
      days: "{count} days",
      vsYesterday: "{change}% vs yesterday",
      fromLastWeek: "+{count} from last week",
    },
  },
};

function renderWithIntl(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

describe("DailySnapshot", () => {
  const mockStats = {
    total_habits: 7,
    completed_today: 3,
    current_best_streak: 23,
    tasks_due_today: 5,
    tasks_completed_today: 2,
  };

  it("renders all stat cards with correct values", () => {
    renderWithIntl(<DailySnapshot stats={mockStats} />);

    expect(screen.getByText("Today's Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Active Habits")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Today's Progress")).toBeInTheDocument();
    expect(screen.getByText("3/7")).toBeInTheDocument();
    expect(screen.getByText("Current Streak")).toBeInTheDocument();
    expect(screen.getByText("23 days")).toBeInTheDocument();
  });

  it("shows positive trend indicator when improved", () => {
    const yesterdayStats = {
      habits_completed: 2,
      habits_total: 7,
    };

    renderWithIntl(
      <DailySnapshot stats={mockStats} yesterdayStats={yesterdayStats} />
    );

    // 3/7 (43%) today vs 2/7 (29%) yesterday = +14% improvement
    const trendElement = screen.getByText(/vs yesterday/i);
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.parentElement).toHaveClass("text-primary");
  });

  it("shows negative trend indicator when declined", () => {
    const yesterdayStats = {
      habits_completed: 5,
      habits_total: 7,
    };

    renderWithIntl(
      <DailySnapshot stats={mockStats} yesterdayStats={yesterdayStats} />
    );

    // 3/7 (43%) today vs 5/7 (71%) yesterday = -28% decline
    const trendElement = screen.getByText(/vs yesterday/i);
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.parentElement).toHaveClass("text-status-error");
  });

  it("hides trend when no yesterday stats (Day 1)", () => {
    renderWithIntl(<DailySnapshot stats={mockStats} yesterdayStats={null} />);

    expect(screen.queryByText(/vs yesterday/i)).not.toBeInTheDocument();
  });

  it("handles zero values correctly", () => {
    const zeroStats = {
      total_habits: 0,
      completed_today: 0,
      current_best_streak: 0,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<DailySnapshot stats={zeroStats} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(screen.getByText("0 days")).toBeInTheDocument();
  });

  it("calculates completion rate correctly", () => {
    renderWithIntl(<DailySnapshot stats={mockStats} />);

    // 3/7 = 43% (rounded)
    expect(screen.getByText("43% completion rate")).toBeInTheDocument();
  });

  it("handles 100% completion", () => {
    const completeStats = {
      total_habits: 5,
      completed_today: 5,
      current_best_streak: 10,
      tasks_due_today: 3,
      tasks_completed_today: 3,
    };

    renderWithIntl(<DailySnapshot stats={completeStats} />);

    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("100% completion rate")).toBeInTheDocument();
  });
});
