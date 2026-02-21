import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AbsenceCard } from "@/components/dashboard/absence-card";
import type { HabitWithAbsence } from "@/lib/db/types";

const messages = {
  dashboard: {
    absence: {
      recoveryTitle: "{name} — missed {days} day(s)",
      lapseTitle: "{name} — {days} days since last check-in",
      hiatusTitle: "{name} — it's been {days} days",
      recoveryTitleWeeks: "{name} — missed {days} week(s)",
      lapseTitleWeeks: "{name} — {days} weeks since last check-in",
      hiatusTitleWeeks: "{name} — it's been {days} weeks",
      previousStreak: "You had a {days}-day streak before",
      previousStreakWeeks: "You had a {days}-week streak before",
      viewHabit: "View habit",
      changeFrequency: "Change frequency",
      dismiss: "Dismiss",
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

function makeHabit(overrides: Partial<HabitWithAbsence> = {}): HabitWithAbsence {
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
    missed_scheduled_periods: 1,
    previous_streak: 5,
    absence_unit: "days",
    ...overrides,
  };
}

describe("AbsenceCard", () => {
  it("renders recovery variant for 1-2 missed days with View habit link", () => {
    const habit = makeHabit({ missed_scheduled_periods: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — missed 2 day/)).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
  });

  it("renders lapse variant for 3-6 missed days with previous streak", () => {
    const habit = makeHabit({ missed_scheduled_periods: 4, previous_streak: 7 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — 4 days since last check-in/)).toBeInTheDocument();
    expect(screen.getByText("You had a 7-day streak before")).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
  });

  it("renders hiatus variant for 7+ missed days with View habit and Change frequency links", () => {
    const habit = makeHabit({ missed_scheduled_periods: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — it's been 10 days/)).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
    expect(screen.getByText("Change frequency")).toBeInTheDocument();
  });

  it("does not show Change frequency link for recovery variant", () => {
    const habit = makeHabit({ missed_scheduled_periods: 1 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText("Change frequency")).not.toBeInTheDocument();
  });

  it("does not show Change frequency link for lapse variant", () => {
    const habit = makeHabit({ missed_scheduled_periods: 4 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText("Change frequency")).not.toBeInTheDocument();
  });

  it("calls onDismiss with habit id when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={onDismiss} onNavigate={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("h1");
  });

  it("navigates to habit detail page on 'View habit' click", () => {
    const onNavigate = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={onNavigate} />
    );

    fireEvent.click(screen.getByText("View habit"));
    expect(onNavigate).toHaveBeenCalledWith("/habits/h1");
  });

  it("navigates to edit page on 'Change frequency' click (hiatus)", () => {
    const onNavigate = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={onNavigate} />
    );

    fireEvent.click(screen.getByText("Change frequency"));
    expect(onNavigate).toHaveBeenCalledWith("/habits/h1/edit");
  });

  it("does not show previous streak for recovery variant", () => {
    const habit = makeHabit({ missed_scheduled_periods: 1, previous_streak: 5 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("does not show previous streak text when previous_streak is 0", () => {
    const habit = makeHabit({ missed_scheduled_periods: 4, previous_streak: 0 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("does not show previous streak for hiatus variant even when previous_streak > 0", () => {
    const habit = makeHabit({ missed_scheduled_periods: 10, previous_streak: 15 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("renders lapse variant at exactly 3 missed days (boundary)", () => {
    const habit = makeHabit({ missed_scheduled_periods: 3 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/3 days since last check-in/)).toBeInTheDocument();
  });

  it("renders hiatus variant at exactly 7 missed days (boundary)", () => {
    const habit = makeHabit({ missed_scheduled_periods: 7 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/it's been 7 days/)).toBeInTheDocument();
    expect(screen.getByText("Change frequency")).toBeInTheDocument();
  });

  // --- Week-based absence display tests ---

  it("renders week-based text for weekly habits (recovery: 1 missed week)", () => {
    const habit = makeHabit({
      frequency: { type: "times_per_week", count: 3 },
      missed_scheduled_periods: 1,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/missed 1 week/)).toBeInTheDocument();
  });

  it("renders week-based lapse variant for 2-3 missed weeks", () => {
    const habit = makeHabit({
      frequency: { type: "weekly" },
      missed_scheduled_periods: 2,
      previous_streak: 4,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/2 weeks since last check-in/)).toBeInTheDocument();
    expect(screen.getByText("You had a 4-week streak before")).toBeInTheDocument();
  });

  it("renders week-based hiatus variant for 4+ missed weeks", () => {
    const habit = makeHabit({
      frequency: { type: "weekly" },
      missed_scheduled_periods: 5,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/it's been 5 weeks/)).toBeInTheDocument();
    expect(screen.getByText("Change frequency")).toBeInTheDocument();
  });

  it("falls back to day-based rendering when absence_unit is undefined", () => {
    const habit = makeHabit({
      missed_scheduled_periods: 3,
      absence_unit: undefined as unknown as 'days',
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    // Should use day-based lapse variant (3-6 missed = lapse)
    expect(screen.getByText(/3 days since last check-in/)).toBeInTheDocument();
  });
});
