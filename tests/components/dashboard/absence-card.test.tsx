import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AbsenceCard } from "@/components/dashboard/absence-card";
import type { HabitWithTodayStatus } from "@/lib/db/types";

const messages = {
  dashboard: {
    absence: {
      recoveryTitle: "{name} — missed {days} day(s)",
      lapseTitle: "{name} — {days} days since last check-in",
      hiatusTitle: "{name} — it's been {days} days",
      previousStreak: "You had a {days}-day streak before",
      markComplete: "Complete today",
      completed: "{name} — welcome back!",
      resume: "Resume today",
      changeFrequency: "Change frequency",
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

function makeHabit(overrides: Partial<HabitWithTodayStatus> = {}): HabitWithTodayStatus {
  return {
    id: "h1",
    user_id: "user-1",
    name: "Morning Run",
    description: null,
    category: "health",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 0,
    best_streak: 10,
    paused_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    completed_today: false,
    monthly_completion_rate: 50,
    missed_scheduled_days: 1,
    previous_streak: 5,
    ...overrides,
  };
}

describe("AbsenceCard", () => {
  it("renders recovery variant for 1-2 missed days", () => {
    const habit = makeHabit({ missed_scheduled_days: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — missed 2 day/)).toBeInTheDocument();
    expect(screen.getByText("Complete today")).toBeInTheDocument();
  });

  it("renders lapse variant for 3-6 missed days with previous streak", () => {
    const habit = makeHabit({ missed_scheduled_days: 4, previous_streak: 7 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — 4 days since last check-in/)).toBeInTheDocument();
    expect(screen.getByText("You had a 7-day streak before")).toBeInTheDocument();
    expect(screen.getByText("Complete today")).toBeInTheDocument();
  });

  it("renders hiatus variant for 7+ missed days with CTAs", () => {
    const habit = makeHabit({ missed_scheduled_days: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — it's been 10 days/)).toBeInTheDocument();
    expect(screen.getByText("Resume today")).toBeInTheDocument();
    expect(screen.getByText("Change frequency")).toBeInTheDocument();
    // Should NOT show checkbox
    expect(screen.queryByText("Complete today")).not.toBeInTheDocument();
  });

  it("shows success state after completing", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const habit = makeHabit({ missed_scheduled_days: 1 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={onToggle} onNavigate={vi.fn()} />
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(/Morning Run — welcome back!/)).toBeInTheDocument();
    });
    expect(onToggle).toHaveBeenCalledWith("h1");
  });

  it("navigates to edit page on 'Change frequency' click", () => {
    const onNavigate = vi.fn();
    const habit = makeHabit({ missed_scheduled_days: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={onNavigate} />
    );

    fireEvent.click(screen.getByText("Change frequency"));
    expect(onNavigate).toHaveBeenCalledWith("/habits/h1/edit");
  });

  it("does not show previous streak for recovery variant", () => {
    const habit = makeHabit({ missed_scheduled_days: 1, previous_streak: 5 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("does not show previous streak text when previous_streak is 0", () => {
    const habit = makeHabit({ missed_scheduled_days: 4, previous_streak: 0 });

    renderWithIntl(
      <AbsenceCard habit={habit} onToggle={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });
});
