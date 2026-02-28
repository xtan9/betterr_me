import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from "@/app/api/workouts/[id]/save-as-routine/route";

// --- Helpers ---

function makeWorkout(status: string) {
  return {
    id: "workout-1",
    user_id: "user-123",
    status,
    workout_exercises: [
      {
        id: "we-1",
        exercise_id: "ex-1",
        sort_order: 65536,
        rest_timer_seconds: 90,
        notes: null,
        exercise: { id: "ex-1", name: "Bench Press" },
        sets: [
          {
            id: "s-1",
            is_completed: true,
            weight_kg: 60,
            reps: 10,
            duration_seconds: null,
          },
          {
            id: "s-2",
            is_completed: true,
            weight_kg: 65,
            reps: 8,
            duration_seconds: null,
          },
        ],
      },
    ],
  };
}

function makeRequest(workoutId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/workouts/${workoutId}/save-as-routine`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

function callPOST(request: NextRequest, workoutId: string) {
  return POST(request, {
    params: Promise.resolve({ id: workoutId }),
  });
}

/**
 * Build a chainable mock for `supabase.from(table)`.
 *
 * Each table is configured with a result object that is returned by the
 * terminal method (.single() for selects, .select()/.single() for inserts,
 * or the bare insert for routine_exercises).
 */
function setupSupabaseMock(config: {
  workoutsResult: { data: unknown; error: unknown };
  routinesResult?: { data: unknown; error: unknown };
  routineExercisesResult?: { data: unknown; error: unknown };
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "workouts") {
      return {
        select: () => ({
          eq: () => ({
            single: () => config.workoutsResult,
          }),
        }),
      };
    }
    if (table === "routines") {
      const result = config.routinesResult ?? {
        data: { id: "routine-1", user_id: "user-123", name: "My Routine" },
        error: null,
      };
      return {
        insert: () => ({
          select: () => ({
            single: () => result,
          }),
        }),
      };
    }
    if (table === "routine_exercises") {
      const result = config.routineExercisesResult ?? {
        data: null,
        error: null,
      };
      return {
        insert: () => result,
      };
    }
    return {};
  });
}

// --- Tests ---

describe("POST /api/workouts/[id]/save-as-routine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
  });

  it("creates routine from in_progress workout (timing fix)", async () => {
    setupSupabaseMock({
      workoutsResult: { data: makeWorkout("in_progress"), error: null },
    });

    const request = makeRequest("workout-1", { name: "My Routine" });
    const response = await callPOST(request, "workout-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.routine).toBeDefined();
    expect(data.routine.id).toBe("routine-1");
  });

  it("creates routine from completed workout", async () => {
    setupSupabaseMock({
      workoutsResult: { data: makeWorkout("completed"), error: null },
    });

    const request = makeRequest("workout-1", { name: "My Routine" });
    const response = await callPOST(request, "workout-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.routine).toBeDefined();
    expect(data.routine.id).toBe("routine-1");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const request = makeRequest("workout-1", { name: "My Routine" });
    const response = await callPOST(request, "workout-1");

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 for non-existent workout", async () => {
    setupSupabaseMock({
      workoutsResult: {
        data: null,
        error: { code: "PGRST116", message: "Not found" },
      },
    });

    const request = makeRequest("nonexistent", { name: "My Routine" });
    const response = await callPOST(request, "nonexistent");

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Workout not found");
  });
});
