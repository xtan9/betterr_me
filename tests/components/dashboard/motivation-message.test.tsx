import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MotivationMessage } from "@/components/dashboard/motivation-message";

const messages = {
  dashboard: {
    motivation: {
      firstDay: "Welcome! Your journey to becoming better starts today.",
      allComplete: "Perfect day! You've completed all your habits.",
      streakAtRisk: "Your {habitName} streak is at {count} days - don't break it now!",
      almostDone: "Just {remaining} more to go! You've got this!",
      halfway: "Halfway there! Keep the momentum going.",
      gettingStarted: "Every habit completed brings you closer to your best self.",
      noHabits: "Ready to start building better habits? Add your first one!",
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

describe("MotivationMessage", () => {
  it("shows first day message for new users", () => {
    const stats = {
      total_habits: 0,
      completed_today: 0,
      current_best_streak: 0,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<MotivationMessage stats={stats} isFirstDay={true} />);

    expect(screen.getByText(/Welcome! Your journey/i)).toBeInTheDocument();
  });

  it("shows all complete message when 100% done", () => {
    const stats = {
      total_habits: 5,
      completed_today: 5,
      current_best_streak: 10,
      tasks_due_today: 3,
      tasks_completed_today: 3,
    };

    renderWithIntl(<MotivationMessage stats={stats} />);

    expect(screen.getByText(/Perfect day! You've completed all your habits/i)).toBeInTheDocument();
  });

  it("shows streak at risk message for high streaks", () => {
    const stats = {
      total_habits: 3,
      completed_today: 2,
      current_best_streak: 15,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    const topStreakHabit = {
      name: "Morning Meditation",
      current_streak: 15,
      completed_today: false,
    };

    renderWithIntl(
      <MotivationMessage stats={stats} topStreakHabit={topStreakHabit} />
    );

    expect(screen.getByText(/Your Morning Meditation streak is at 15 days/i)).toBeInTheDocument();
  });

  it("shows almost done message when >75% complete", () => {
    const stats = {
      total_habits: 4,
      completed_today: 3,
      current_best_streak: 5,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<MotivationMessage stats={stats} />);

    expect(screen.getByText(/Just 1 more to go!/i)).toBeInTheDocument();
  });

  it("shows halfway message when 50-75% complete", () => {
    const stats = {
      total_habits: 4,
      completed_today: 2,
      current_best_streak: 5,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<MotivationMessage stats={stats} />);

    expect(screen.getByText(/Halfway there!/i)).toBeInTheDocument();
  });

  it("shows getting started message when <50% complete", () => {
    const stats = {
      total_habits: 5,
      completed_today: 1,
      current_best_streak: 3,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<MotivationMessage stats={stats} />);

    expect(screen.getByText(/Every habit completed brings you closer/i)).toBeInTheDocument();
  });

  it("shows no habits message when no habits exist", () => {
    const stats = {
      total_habits: 0,
      completed_today: 0,
      current_best_streak: 0,
      tasks_due_today: 0,
      tasks_completed_today: 0,
    };

    renderWithIntl(<MotivationMessage stats={stats} />);

    expect(screen.getByText(/Ready to start building better habits?/i)).toBeInTheDocument();
  });
});
