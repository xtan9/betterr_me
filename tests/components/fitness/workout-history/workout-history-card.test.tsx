import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutHistoryCard } from "@/components/fitness/workout-history/workout-history-card";
import type { WorkoutSummary } from "@/lib/db/workouts";

vi.mock("next-intl", () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key}:${Object.values(values).join(":")}` : key,
}));

const workout = {
  id: "workout-1",
  title: "Strength Day",
  notes: null,
  started_at: "2026-08-01T12:00:00.000Z",
  completed_at: "2026-08-01T13:00:00.000Z",
  duration_seconds: 3600,
  exerciseCount: 1,
  exerciseNames: ["Bench Press"],
  totalVolume: 10,
  totalSets: 5,
} satisfies WorkoutSummary;

describe("WorkoutHistoryCard Fitness Weight Unit presentation", () => {
  it('keeps a chosen civil day stable and displays unknown duration distinctly from zero', () => {
    const { rerender } = render(<WorkoutHistoryCard workout={{ ...workout, started_at: null, workoutDay: '2024-02-29', duration_seconds: null }} weightUnit="kg" />);
    expect(screen.getByText('Feb 29, 2024')).toBeInTheDocument();
    expect(screen.getByText('durationUnknown')).toBeInTheDocument();
    expect(screen.queryByText('minuteShort:0')).not.toBeInTheDocument();
    rerender(<WorkoutHistoryCard workout={{ ...workout, started_at: null, workoutDay: null, duration_seconds: 0 }} weightUnit="kg" />);
    expect(screen.getByText('workoutDayUnknown')).toBeInTheDocument();
    expect(screen.getByText('minuteShort:0')).toBeInTheDocument();
  });
  it("keeps an unsupported record accessible without guessed exercise facts", () => {
    render(<WorkoutHistoryCard workout={{ ...workout, recordedStatus: 'unsupported', exerciseCount: null, totalSets: null, totalVolume: null, exerciseNames: [] }} weightUnit="kg" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/workouts/workout-1');
    expect(screen.getByText('recordedUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('setsCount:0')).not.toBeInTheDocument();
  });
  it("formats canonical kilogram volume in the accepted display unit", () => {
    render(<WorkoutHistoryCard workout={workout} weightUnit="lbs" />);

    expect(screen.getByText("22.046226218487758 lbs")).toBeInTheDocument();
  });
});
