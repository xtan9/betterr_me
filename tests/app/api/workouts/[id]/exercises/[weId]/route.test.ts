import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockUpdateExercise,
  mockRemoveExercise,
  mockToWorkoutExerciseResponse,
} = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockUpdateExercise: vi.fn(),
    mockRemoveExercise: vi.fn(),
    mockToWorkoutExerciseResponse: vi.fn((exercise: Record<string, unknown>) => ({
      id: exercise.id,
      workout_id: exercise.workoutId,
      exercise_id: exercise.exerciseId,
      sort_order: exercise.sortOrder,
      notes: exercise.notes,
      rest_timer_seconds: exercise.restTimerSeconds,
      created_at: exercise.createdAt,
    })),
  })
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({
    updateExercise: mockUpdateExercise,
    removeExercise: mockRemoveExercise,
  })),
  toWorkoutExerciseResponse: mockToWorkoutExerciseResponse,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PATCH,
  DELETE,
} from "@/app/api/workouts/[id]/exercises/[weId]/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1" });

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1",
    { method, ...(body ? { body: JSON.stringify(body) } : {}) }
  );
}

// --- Tests ---

describe("PATCH /api/workouts/[id]/exercises/[weId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates workout exercise successfully", async () => {
    const updated = {
      id: "we-1",
      workoutId: "w-1",
      exerciseId: "exercise-1",
      sortOrder: 65536,
      notes: null,
      restTimerSeconds: 120,
      createdAt: "2026-08-01T12:00:00.000Z",
    };
    mockUpdateExercise.mockResolvedValue({ type: "updated", exercise: updated });

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise).toEqual({
      id: "we-1",
      workout_id: "w-1",
      exercise_id: "exercise-1",
      sort_order: 65536,
      notes: null,
      rest_timer_seconds: 120,
      created_at: "2026-08-01T12:00:00.000Z",
    });
    expect(mockUpdateExercise).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
      changes: { restTimerSeconds: 120 },
    });
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateExercise.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update workout exercise");
  });
});

describe("DELETE /api/workouts/[id]/exercises/[weId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("removes workout exercise (204)", async () => {
    mockRemoveExercise.mockResolvedValue({ type: "removed" });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(204);
    expect(mockRemoveExercise).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockRemoveExercise.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to remove exercise from workout");
  });

  it("maps missing and terminal outcomes", async () => {
    mockUpdateExercise.mockResolvedValue({ type: "not-found" });
    const missingUpdate = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params },
    );
    expect(missingUpdate.status).toBe(404);

    mockRemoveExercise.mockResolvedValue({
      type: "invalid-transition",
      currentStatus: "discarded",
    });
    const terminalDelete = await DELETE(makeRequest("DELETE"), { params });
    expect(terminalDelete.status).toBe(409);
  });
});
