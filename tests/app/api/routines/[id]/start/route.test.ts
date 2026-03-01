import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockGetRoutine,
  mockUpdateRoutine,
  mockStartWorkout,
  mockInsert,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetRoutine: vi.fn(),
  mockUpdateRoutine: vi.fn(),
  mockStartWorkout: vi.fn(),
  mockInsert: vi.fn(),
}));

// Supabase mock with chainable insert
const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    insert: mockInsert,
    delete: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getRoutine = mockGetRoutine;
    updateRoutine = mockUpdateRoutine;
  },
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    startWorkout = mockStartWorkout;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/routines/[id]/start/route";

// --- Helpers ---

function makeRoutine() {
  return {
    id: "routine-1",
    name: "Push Day",
    exercises: [
      {
        id: "re-1",
        exercise_id: "ex-1",
        sort_order: 1,
        target_sets: 3,
        target_reps: 10,
        target_weight_kg: 60,
        target_duration_seconds: null,
        rest_timer_seconds: 90,
        notes: null,
        exercise: { id: "ex-1", name: "Bench Press", exercise_type: "weight_reps" },
      },
    ],
  };
}

function callPOST(routineId: string) {
  const request = new NextRequest(
    `http://localhost:3000/api/routines/${routineId}/start`,
    { method: "POST" }
  );
  return POST(request, { params: Promise.resolve({ id: routineId }) });
}

// --- Tests ---

describe("POST /api/routines/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockGetRoutine.mockResolvedValue(makeRoutine());
    mockStartWorkout.mockResolvedValue({
      id: "w-1",
      user_id: "user-123",
      title: "Push Day",
      status: "in_progress",
    });
    mockUpdateRoutine.mockResolvedValue({});
    // Default: successful insert chain
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "we-1" },
          error: null,
        }),
      }),
    });
    // Separate behavior for workout_sets inserts (no .select().single())
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "workout_exercises") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "we-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workout_sets") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "workouts") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { insert: mockInsert };
    });
  });

  it("creates workout from routine (201)", async () => {
    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.workout).toBeDefined();
    expect(data.workout.id).toBe("w-1");
    expect(mockStartWorkout).toHaveBeenCalledWith("user-123", {
      title: "Push Day",
      routine_id: "routine-1",
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 for non-existent routine", async () => {
    mockGetRoutine.mockResolvedValue(null);

    const response = await callPOST("nonexistent");
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine not found");
  });

  it("returns 409 when active workout exists", async () => {
    mockStartWorkout.mockRejectedValue(
      new Error("You already have an active workout")
    );

    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active workout");
  });

  it("updateRoutine failure does not delete the workout (fix 1a)", async () => {
    mockUpdateRoutine.mockRejectedValue(new Error("Update failed"));

    const response = await callPOST("routine-1");
    const data = await response.json();

    // The workout should still be returned successfully
    expect(response.status).toBe(201);
    expect(data.workout.id).toBe("w-1");
  });

  it("cleans up workout when exercise copy fails", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "workout_exercises") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Insert failed", code: "42000" },
              }),
            }),
          }),
        };
      }
      if (table === "workouts") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { insert: mockInsert };
    });

    const response = await callPOST("routine-1");

    expect(response.status).toBe(500);
  });
});
