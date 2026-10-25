import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { WorkoutLogger } from "@/components/fitness/workout-logger/workout-logger";
import type { ActiveWorkout } from "@/lib/hooks/use-active-workout";
import type { WorkoutSetUpdate } from "@/lib/db/types";
import { composeCurrentProfileResponse } from "@/lib/current-profile";
import { loadWorkoutFromStorage, STORAGE_KEY } from "@/lib/fitness/workout-session";
import messages from "@/i18n/messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner-1" } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} }) }));

const at = "2026-10-25T07:00:00Z";
function activeWorkout(): ActiveWorkout {
  return {
    id: "workout-1", user_id: "owner-1", title: "Strength", status: "in_progress", notes: null, routine_id: null,
    started_at: at, completed_at: null, duration_seconds: null, created_at: at, updated_at: at,
    exercises: [{
      id: "entry-1", workout_id: "workout-1", exercise_id: "exercise-1", sort_order: 0, notes: null,
      rest_timer_seconds: 0, created_at: at, previousSets: [],
      exercise: { id: "exercise-1", user_id: null, name: "Bench Press", exercise_type: "weight_reps",
        equipment: "barbell", muscle_group_primary: "chest", muscle_groups_secondary: [], is_custom: false,
        exercise_media: null, created_at: at, updated_at: at },
      sets: [{ id: "set-1", workout_exercise_id: "entry-1", set_number: 1, set_type: "normal",
        weight_kg: 10, reps: 5, is_completed: false, duration_seconds: null, distance_meters: null, rpe: null,
        created_at: at, updated_at: at }],
    }],
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.removeItem(STORAGE_KEY); });

describe("WorkoutLogger measurement writes through the actual SWR hook", () => {
  it.each(["measurement", "completion"])("blocks completion after a held %s failure, then retries the exact authored load", async (failure) => {
    const stored = activeWorkout();
    const acceptedCompletions: Array<number | null> = [];
    const requests: WorkoutSetUpdate[] = [];
    let hasFailed = false;
    let rejectFirst!: () => void;
    const heldFailure = new Promise<void>(resolve => { rejectFirst = resolve; });
    const profile = composeCurrentProfileResponse({ identityEmail: "person@example.test", capabilities: { canAccessAdmin: false },
      projection: { full_name: null, avatar_url: null, timezone: "UTC", preference_revision: 0, preferences: { weight_unit: "lbs" } } });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/current-profile") return Response.json(profile);
      if (url === "/api/workouts/active") return Response.json({ workout: stored });
      if (url === "/api/exercises") return Response.json({ exercises: [] });
      if (url === "/api/exercises/exercise-1/records") return Response.json(null);
      if (url === "/api/workouts/workout-1/exercises/entry-1/sets/set-1" && init?.method === "PATCH") {
        const updates: WorkoutSetUpdate = JSON.parse(String(init.body));
        requests.push(updates);
        if (!hasFailed && (failure === "measurement" ? updates.weight_kg !== undefined : updates.is_completed)) {
          hasFailed = true;
          await heldFailure;
          return Response.json({ error: "Temporary measurement write failure" }, { status: 503 });
        }
        Object.assign(stored.exercises[0].sets[0], updates);
        if (updates.is_completed) acceptedCompletions.push(stored.exercises[0].sets[0].weight_kg);
        return Response.json({ set: stored.exercises[0].sets[0] });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    }));
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><WorkoutLogger /></NextIntlClientProvider>
    </SWRConfig>);
    const input = await screen.findByRole("textbox", { name: "Weight (lbs)" });
    const complete = screen.getByRole("checkbox", { name: "Complete" });
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(complete);
    await waitFor(() => expect(hasFailed).toBe(true));
    expect(requests).toEqual(failure === "measurement" ? [{ weight_kg: 0.45359237 }] : [{ weight_kg: 0.45359237 }, { is_completed: true }]);
    expect(complete).toBeDisabled();
    expect(acceptedCompletions).toEqual([]);
    expect(screen.queryByText("New PR!")).not.toBeInTheDocument();
    await act(async () => { rejectFirst(); await heldFailure; });
    await waitFor(() => expect(complete).toBeEnabled());
    expect(stored.exercises[0].sets[0]).toMatchObject({ weight_kg: failure === "measurement" ? 10 : 0.45359237, is_completed: false });
    expect(acceptedCompletions).toEqual([]);
    expect(complete).not.toBeChecked();
    expect(screen.queryByText("New PR!")).not.toBeInTheDocument();
    expect(input).toHaveValue("1");
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Failed to complete set");

    fireEvent.click(complete);
    await waitFor(() => expect(acceptedCompletions).toEqual([0.45359237]));
    expect(requests).toEqual(failure === "measurement"
      ? [{ weight_kg: 0.45359237 }, { weight_kg: 0.45359237 }, { is_completed: true }]
      : [{ weight_kg: 0.45359237 }, { is_completed: true }, { is_completed: true }]);
    await waitFor(() => expect(complete).toBeChecked());
    expect(input).toHaveValue("1");
    expect(screen.getByRole("status")).toHaveTextContent("Bench Press — Weight PR: 1 lbs");
    expect(loadWorkoutFromStorage()?.exercises[0].sets[0]).toMatchObject({ weight_kg: 0.45359237, reps: 5, is_completed: true });
  });
});
