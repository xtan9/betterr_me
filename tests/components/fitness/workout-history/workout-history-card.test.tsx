import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutHistoryCard } from "@/components/fitness/workout-history/workout-history-card";
import type { WorkoutSummary } from "@/lib/db/workouts";

vi.mock("next-intl", () => ({
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
