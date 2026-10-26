import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { WorkoutDetailView } from "@/components/fitness/workout-history/workout-detail-view";
import type { ExerciseType, WorkoutWithExercises } from "@/lib/db/types";
import type { ComparableGroup, ComparableSource } from "@/lib/fitness/history-progress";
import messages from "@/i18n/messages/en.json";

describe("recorded repetition badges", () => {
  it.each([
    ["assisted_bodyweight", false, "generic"],
    ["bodyweight_reps", false, "generic"],
    ["bodyweight_reps", true, "current"],
    ["bodyweight_reps", false, "stale"],
    ["bodyweight_reps", false, "changed"],
    ["bodyweight_reps", false, "warmup"],
  ] as const)("respects %s current source eligibility (%s, %s)", (mode: ExerciseType, showsRepsPR, scenario) => {
    const at = "2026-10-25T07:00:00Z";
    const workout: WorkoutWithExercises = {
      id: "workout-1", user_id: "owner-1", title: "Pull-ups", status: "completed", notes: null, routine_id: null,
      historyRevision: "2", started_at: at, completed_at: at, duration_seconds: 60, created_at: at, updated_at: at,
      exercises: [{
        id: "entry-1", workout_id: "workout-1", exercise_id: "exercise-1", sort_order: 0, notes: null,
        rest_timer_seconds: null, created_at: at,
        exercise: { id: "exercise-1", user_id: null, name: "Pull-up", exercise_type: mode,
          equipment: mode === "assisted_bodyweight" ? "machine" : "bodyweight", muscle_group_primary: "back",
          muscle_groups_secondary: [], is_custom: false, exercise_media: null, created_at: at, updated_at: at },
        sets: [{ id: "set-1", workout_exercise_id: "entry-1", set_number: 1, set_type: scenario === "warmup" ? "warmup" : "normal",
          weight_kg: mode === "assisted_bodyweight" ? 20 : null, reps: 8, is_completed: true,
          duration_seconds: null, distance_meters: null, rpe: null, created_at: at, updated_at: at }],
      }],
    };
    const source: ComparableSource = { workoutId: workout.id, revision: scenario === "stale" ? "1" : "2", entryId: "entry-1", setId: "set-1",
      weightKg: null, reps: scenario === "changed" ? 9 : 8, durationSeconds: null, workoutDay: "2026-10-25" };
    const group: ComparableGroup = { key: "captured-pull-ups", name: "Pull-up", definition: {
      catalogKey: "strength.pull-up.v1", name: { en: "Pull-up", zh: "引体向上" }, equipment: "bodyweight", mode: "bodyweight_reps", convention: "bodyweight-repetitions" },
      history: [source], records: [{ metric: "reps", at: null, value: source.reps!, sources: [source] }] };
    render(<SWRConfig value={{ provider: () => new Map(), revalidateOnMount: false, fallback: {
      "/api/exercises/exercise-1/records": { exercise_id: "exercise-1", best_weight_kg: 20, best_volume: 160, best_reps: 8, best_duration_seconds: null, achieved_at: at, ...(scenario === "generic" ? {} : { comparisonCoverage: "current", comparableGroups: [group] }) },
      "/api/exercises/exercise-1/history": [],
    } }}><NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <WorkoutDetailView workout={workout} weightUnit="kg" />
    </NextIntlClientProvider></SWRConfig>);
    expect(screen.getByText("8")).toBeInTheDocument();
    if (mode === "assisted_bodyweight") {
      expect(screen.getByText("Assistance (kg)")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
    }
    if (showsRepsPR) expect(screen.getByTitle("Personal Record")).toBeInTheDocument();
    else expect(screen.queryByTitle("Personal Record")).not.toBeInTheDocument();
  });
});
