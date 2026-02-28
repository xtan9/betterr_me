import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockGetWorkoutWithExercises,
  mockCreateRoutine,
  mockAddExerciseToRoutine,
  mockDeleteRoutine,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetWorkoutWithExercises: vi.fn(),
  mockCreateRoutine: vi.fn(),
  mockAddExerciseToRoutine: vi.fn(),
  mockDeleteRoutine: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getWorkoutWithExercises = mockGetWorkoutWithExercises;
  },
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    createRoutine = mockCreateRoutine;
    addExerciseToRoutine = mockAddExerciseToRoutine;
    deleteRoutine = mockDeleteRoutine;
  },
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

function makeWorkoutWithExercises(status: string) {
  return {
    id: "workout-1",
    user_id: "user-123",
    status,
    exercises: [
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

// --- Tests ---

describe("POST /api/workouts/[id]/save-as-routine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    // Default: successful routine creation
    mockCreateRoutine.mockResolvedValue({
      id: "routine-1",
      user_id: "user-123",
      name: "My Routine",
    });
    mockAddExerciseToRoutine.mockResolvedValue({
      id: "re-1",
      routine_id: "routine-1",
    });
  });

  it("creates routine from in_progress workout (timing fix)", async () => {
    mockGetWorkoutWithExercises.mockResolvedValue(
      makeWorkoutWithExercises("in_progress")
    );

    const request = makeRequest("workout-1", { name: "My Routine" });
    const response = await callPOST(request, "workout-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.routine).toBeDefined();
    expect(data.routine.id).toBe("routine-1");
  });

  it("creates routine from completed workout", async () => {
    mockGetWorkoutWithExercises.mockResolvedValue(
      makeWorkoutWithExercises("completed")
    );

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
    mockGetWorkoutWithExercises.mockResolvedValue(null);

    const request = makeRequest("nonexistent", { name: "My Routine" });
    const response = await callPOST(request, "nonexistent");

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Workout not found");
  });
});
