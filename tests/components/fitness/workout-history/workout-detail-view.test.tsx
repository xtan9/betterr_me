import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { WorkoutDetailView } from "@/components/fitness/workout-history/workout-detail-view";
import type { ExerciseType, WorkoutWithExercises } from "@/lib/db/types";
import messages from "@/i18n/messages/en.json";

describe("recorded repetition badges", () => {
  it.each([
    ["assisted_bodyweight", false],
    ["bodyweight_reps", true],
  ] as const)("respects %s meaning even with cached generic records", (mode: ExerciseType, showsRepsPR) => {
    const at = "2026-10-25T07:00:00Z";
    const workout: WorkoutWithExercises = {
      id: "workout-1", user_id: "owner-1", title: "Pull-ups", status: "completed", notes: null, routine_id: null,
      started_at: at, completed_at: at, duration_seconds: 60, created_at: at, updated_at: at,
      exercises: [{
        id: "entry-1", workout_id: "workout-1", exercise_id: "exercise-1", sort_order: 0, notes: null,
        rest_timer_seconds: null, created_at: at,
        exercise: { id: "exercise-1", user_id: null, name: "Pull-up", exercise_type: mode,
          equipment: mode === "assisted_bodyweight" ? "machine" : "bodyweight", muscle_group_primary: "back",
          muscle_groups_secondary: [], is_custom: false, exercise_media: null, created_at: at, updated_at: at },
        sets: [{ id: "set-1", workout_exercise_id: "entry-1", set_number: 1, set_type: "normal",
          weight_kg: mode === "assisted_bodyweight" ? 20 : null, reps: 8, is_completed: true,
          duration_seconds: null, distance_meters: null, rpe: null, created_at: at, updated_at: at }],
      }],
    };
    render(<SWRConfig value={{ provider: () => new Map(), revalidateOnMount: false, fallback: {
      "/api/exercises/exercise-1/records": { exercise_id: "exercise-1", best_weight_kg: 20, best_volume: 160, best_reps: 8, best_duration_seconds: null, achieved_at: at },
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
