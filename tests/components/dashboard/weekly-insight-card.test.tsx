import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { WeeklyInsightCard, type WeeklyInsight } from "@/components/dashboard/weekly-insight-card";

const messages = {
  dashboard: {
    insight: {
      title: "Your Week in Review",
      bestWeek: "You completed {percent}% of habits this week — your best week yet!",
      worstDay: "You tend to skip habits on {day}. Consider adjusting your {day} routine.",
      bestHabit: "{habit} is your strongest habit at {percent}% this week.",
      streakProximity: "{habit} is {days} days from a {milestone}-day milestone!",
      improvement: "Up {change}% from last week. You're building momentum.",
      decline: "This week was {percent}%, down from {lastPercent}%. Everyone has off weeks.",
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

describe("WeeklyInsightCard", () => {
  it("renders insight message", () => {
    const insights: WeeklyInsight[] = [
      {
        type: "best_habit",
        message: "bestHabit",
        params: { habit: "Meditate", percent: 100 },
        priority: 80,
      },
    ];
    const onDismiss = vi.fn();

    renderWithIntl(<WeeklyInsightCard insights={insights} onDismiss={onDismiss} />);

    expect(screen.getByText("Your Week in Review")).toBeInTheDocument();
    expect(screen.getByText("Meditate is your strongest habit at 100% this week.")).toBeInTheDocument();
  });

  it("renders streak proximity insight", () => {
    const insights: WeeklyInsight[] = [
      {
        type: "streak_proximity",
        message: "streakProximity",
        params: { habit: "Running", days: 2, milestone: 30 },
        priority: 100,
      },
    ];
    const onDismiss = vi.fn();

    renderWithIntl(<WeeklyInsightCard insights={insights} onDismiss={onDismiss} />);

    expect(screen.getByText("Running is 2 days from a 30-day milestone!")).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const insights: WeeklyInsight[] = [
      {
        type: "improvement",
        message: "improvement",
        params: { change: 15 },
        priority: 40,
      },
    ];
    const onDismiss = vi.fn();

    renderWithIntl(<WeeklyInsightCard insights={insights} onDismiss={onDismiss} />);

    const dismissButton = screen.getByLabelText("Dismiss");
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("returns null when insights array is empty", () => {
    const onDismiss = vi.fn();

    const { container } = renderWithIntl(
      <WeeklyInsightCard insights={[]} onDismiss={onDismiss} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows only the top insight when multiple are provided", () => {
    const insights: WeeklyInsight[] = [
      {
        type: "streak_proximity",
        message: "streakProximity",
        params: { habit: "Yoga", days: 1, milestone: 14 },
        priority: 100,
      },
      {
        type: "best_habit",
        message: "bestHabit",
        params: { habit: "Read", percent: 90 },
        priority: 80,
      },
    ];
    const onDismiss = vi.fn();

    renderWithIntl(<WeeklyInsightCard insights={insights} onDismiss={onDismiss} />);

    // Should show the first (top priority) insight
    expect(screen.getByText("Yoga is 1 days from a 14-day milestone!")).toBeInTheDocument();
    // Should NOT show the second insight
    expect(screen.queryByText(/Read is your strongest/)).not.toBeInTheDocument();
  });
});
