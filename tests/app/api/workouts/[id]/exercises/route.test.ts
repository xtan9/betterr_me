import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockAddExercise, mockToWorkoutExerciseResponse } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAddExercise: vi.fn(),
  mockToWorkoutExerciseResponse: vi.fn((exercise: Record<string, unknown>) => ({
    id: exercise.id,
    workout_id: exercise.workoutId,
    exercise_id: exercise.exerciseId,
    sort_order: exercise.sortOrder,
    notes: exercise.notes,
    rest_timer_seconds: exercise.restTimerSeconds,
    created_at: exercise.createdAt,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({ addExercise: mockAddExercise })),
  toWorkoutExerciseResponse: mockToWorkoutExerciseResponse,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/exercises/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1" });
const validExerciseUUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- Tests ---

describe("POST /api/workouts/[id]/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("adds exercise to workout (201)", async () => {
    const created = {
      id: "we-new",
      workoutId: "w-1",
      exerciseId: validExerciseUUID,
      sortOrder: 65536,
      notes: null,
      restTimerSeconds: 90,
      createdAt: "2026-08-01T12:00:00.000Z",
    };
    mockAddExercise.mockResolvedValue({ type: "added", exercise: created });

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.exercise).toEqual({
      id: "we-new",
      workout_id: "w-1",
      exercise_id: validExerciseUUID,
      sort_order: 65536,
      notes: null,
      rest_timer_seconds: 90,
      created_at: "2026-08-01T12:00:00.000Z",
    });
    expect(mockAddExercise).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      exerciseId: validExerciseUUID,
      restTimerSeconds: undefined,
    });
  });

  it("passes rest_timer_seconds when provided", async () => {
    mockAddExercise.mockResolvedValue({
      type: "added",
      exercise: {
        id: "we-new",
        workoutId: "w-1",
        exerciseId: validExerciseUUID,
        sortOrder: 65536,
        notes: null,
        restTimerSeconds: 120,
        createdAt: "2026-08-01T12:00:00.000Z",
      },
    });

    const response = await POST(
      makePostRequest({
        exercise_id: validExerciseUUID,
        rest_timer_seconds: 120,
      }),
      { params }
    );

    expect(response.status).toBe(201);
    expect(mockAddExercise).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      exerciseId: validExerciseUUID,
      restTimerSeconds: 120,
    });
  });

  it("rejects invalid body — missing exercise_id (400)", async () => {
    const response = await POST(makePostRequest({}), { params });
    expect(response.status).toBe(400);
  });

  it("rejects invalid body — bad uuid (400)", async () => {
    const response = await POST(
      makePostRequest({ exercise_id: "not-a-uuid" }),
      { params }
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockAddExercise.mockRejectedValue(new Error("DB error"));

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to add exercise to workout");
  });

  it("maps missing and terminal outcomes", async () => {
    mockAddExercise.mockResolvedValueOnce({ type: "not-found" });
    const missing = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params },
    );
    expect(missing.status).toBe(404);

    mockAddExercise.mockResolvedValueOnce({
      type: "invalid-transition",
      currentStatus: "completed",
    });
    const terminal = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params },
    );
    expect(terminal.status).toBe(409);
  });
});
