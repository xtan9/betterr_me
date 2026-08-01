import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineWithExercises, Workout } from "@/lib/db/types";
import { SupabaseWorkoutStartPersistence } from "@/lib/fitness/writes";

const mocks = vi.hoisted(() => ({
  getRoutine: vi.fn(),
  updateRoutineLastPerformedAt: vi.fn(),
  convertRoutine: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getRoutine = mocks.getRoutine;
    updateRoutineLastPerformedAt = mocks.updateRoutineLastPerformedAt;
  },
}));

vi.mock("@/lib/fitness/routine-workout-conversion", () => ({
  RoutineToWorkoutConversion: class {
    start = mocks.convertRoutine;
  },
}));

vi.mock("@/lib/fitness/supabase-routine-workout-store", () => ({
  SupabaseRoutineWorkoutStore: class {},
}));

vi.mock("@/lib/logger", () => ({
  log: { error: mocks.logError },
}));

const workout = {
  id: "workout-1",
  user_id: "user-1",
  title: "Workout",
  status: "in_progress",
} as Workout;

const routine = {
  id: "routine-1",
  user_id: "user-1",
  name: "Push day",
  exercises: [],
} as unknown as RoutineWithExercises;

function makeSupabase(response: { data: unknown; error: unknown }) {
  const queryLog: Array<{ method: string; args: unknown[] }> = [];
  const query = {
    insert: vi.fn((...args: unknown[]) => {
      queryLog.push({ method: "insert", args });
      return query;
    }),
    select: vi.fn((...args: unknown[]) => {
      queryLog.push({ method: "select", args });
      return query;
    }),
    single: vi.fn(async (...args: unknown[]) => {
      queryLog.push({ method: "single", args });
      return response;
    }),
  };
  const from = vi.fn((...args: unknown[]) => {
    queryLog.push({ method: "from", args });
    return query;
  });
  return { from, query, queryLog };
}

describe("SupabaseWorkoutStartPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRoutine.mockResolvedValue(routine);
    mocks.updateRoutineLastPerformedAt.mockResolvedValue(undefined);
    mocks.convertRoutine.mockResolvedValue({ ...workout, exercises: [] });
  });

  it("persists a blank workout and returns a started persistence outcome", async () => {
    const supabase = makeSupabase({ data: workout, error: null });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);

    await expect(
      persistence.startBlank("user-1", "Workout"),
    ).resolves.toEqual({ type: "started", workout });

    expect(supabase.queryLog).toEqual([
      { method: "from", args: ["workouts"] },
      {
        method: "insert",
        args: [
          {
            user_id: "user-1",
            title: "Workout",
            status: "in_progress",
            started_at: expect.any(String),
            routine_id: null,
          },
        ],
      },
      { method: "select", args: [] },
      { method: "single", args: [] },
    ]);
  });

  it("translates the active-workout unique violation at the persistence boundary", async () => {
    const duplicate = { code: "23505", message: "duplicate active workout" };
    const supabase = makeSupabase({ data: null, error: duplicate });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);

    await expect(persistence.startBlank("user-1", "Workout")).resolves.toEqual({
      type: "conflict",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("does not turn unrelated persistence failures into expected conflicts", async () => {
    const failure = { code: "42P01", message: "workouts unavailable" };
    const supabase = makeSupabase({ data: null, error: failure });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);

    await expect(persistence.startBlank("user-1", "Workout")).rejects.toBe(
      failure,
    );
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to start workout",
      failure,
    );
  });

  it("loads routines through the ownership-scoped database seam", async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);

    await expect(persistence.getRoutine("routine-1", "user-1")).resolves.toBe(
      routine,
    );
    expect(mocks.getRoutine).toHaveBeenCalledWith("routine-1", "user-1");
  });

  it("uses the accepted conversion and maps its active-workout conflict", async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);
    const converted = { ...workout, routine_id: "routine-1", exercises: [] };
    mocks.convertRoutine.mockResolvedValue(converted);

    await expect(persistence.startRoutine("user-1", routine)).resolves.toEqual({
      type: "started",
      workout: converted,
    });
    expect(mocks.convertRoutine).toHaveBeenCalledWith("user-1", routine);

    const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
    mocks.convertRoutine.mockRejectedValue(duplicate);
    await expect(persistence.startRoutine("user-1", routine)).resolves.toEqual({
      type: "conflict",
    });
  });

  it("records routine usage through the same owned routine adapter", async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const persistence = new SupabaseWorkoutStartPersistence(supabase as never);

    await persistence.markRoutinePerformed(
      "routine-1",
      "user-1",
      "2026-08-01T12:05:00.000Z",
    );

    expect(mocks.updateRoutineLastPerformedAt).toHaveBeenCalledWith(
      "routine-1",
      "user-1",
      "2026-08-01T12:05:00.000Z",
    );
  });
});
