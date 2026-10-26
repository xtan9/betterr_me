import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { WorkoutStatsWidget } from "@/components/dashboard/workout-stats-widget";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (values) return `${key}:${JSON.stringify(values)}`;
    return key;
  },
}));

describe("WorkoutStatsWidget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix "now" at 2026-04-12 12:00 local time
    vi.setSystemTime(new Date(2026, 3, 12, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders widget with title and stats when lastWorkoutAt is null", () => {
    render(<WorkoutStatsWidget lastWorkoutAt={null} weekWorkoutCount={0} />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("noWorkoutsYet")).toBeInTheDocument();
    expect(screen.getByText('workoutsCount:{"count":0}')).toBeInTheDocument();
  });

  it("shows 'today' when lastWorkoutAt is today", () => {
    const today = new Date(2026, 3, 12, 8, 0, 0).toISOString();
    render(<WorkoutStatsWidget lastWorkoutAt={today} weekWorkoutCount={3} />);

    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText('workoutsCount:{"count":3}')).toBeInTheDocument();
  });

  it("shows 'yesterday' when lastWorkoutAt is 1 day ago", () => {
    const yesterday = new Date(2026, 3, 11, 8, 0, 0).toISOString();
    render(
      <WorkoutStatsWidget lastWorkoutAt={yesterday} weekWorkoutCount={1} />
    );

    expect(screen.getByText("yesterday")).toBeInTheDocument();
  });

  it("shows relative days ago for older workouts", () => {
    const fiveDaysAgo = new Date(2026, 3, 7, 8, 0, 0).toISOString();
    render(
      <WorkoutStatsWidget lastWorkoutAt={fiveDaysAgo} weekWorkoutCount={2} />
    );

    expect(screen.getByText('daysAgo:{"count":5}')).toBeInTheDocument();
  });

  it("does not return null — container has widget testid", () => {
    const { container } = render(
      <WorkoutStatsWidget lastWorkoutAt={null} weekWorkoutCount={0} />
    );
    expect(
      container.querySelector('[data-testid="workout-stats-widget"]')
    ).toBeInTheDocument();
  });

  it("uses the canonical civil day even without an instant", () => {
    render(<WorkoutStatsWidget lastWorkoutAt={"2026-04-10T00:00:00Z"} lastWorkout={{ workoutDay: "2026-04-12", startedAt: null }} weekWorkoutCount={1} />);
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("distinguishes an undated workout from no workouts without reviving a stale timestamp", () => {
    const { rerender } = render(<WorkoutStatsWidget lastWorkoutAt={"2026-04-12T12:00:00Z"} lastWorkout={{ workoutDay: null, startedAt: null }} weekWorkoutCount={0} />);
    expect(screen.getByText("workoutDayUnknown")).toBeInTheDocument();
    expect(screen.queryByText("noWorkoutsYet")).not.toBeInTheDocument();
    rerender(<WorkoutStatsWidget lastWorkoutAt={"2026-04-12T12:00:00Z"} lastWorkout={null} weekWorkoutCount={0} />);
    expect(screen.getByText("noWorkoutsYet")).toBeInTheDocument();
    expect(screen.queryByText("today")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(
      <WorkoutStatsWidget
        lastWorkoutAt={new Date().toISOString()}
        weekWorkoutCount={2}
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
