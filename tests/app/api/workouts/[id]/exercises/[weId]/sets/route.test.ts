import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockAddSet, mockToWorkoutSetResponse } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAddSet: vi.fn(),
  mockToWorkoutSetResponse: vi.fn((set: Record<string, unknown>) => ({
    id: set.id,
    workout_exercise_id: set.workoutExerciseId,
    set_number: set.setNumber,
    set_type: set.setType,
    weight_kg: set.weightKg,
    reps: set.reps,
    duration_seconds: set.durationSeconds,
    distance_meters: set.distanceMeters,
    is_completed: set.isCompleted,
    rpe: set.rpe,
    created_at: set.createdAt,
    updated_at: set.updatedAt,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({ addSet: mockAddSet })),
  toWorkoutSetResponse: mockToWorkoutSetResponse,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/exercises/[weId]/sets/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1" });

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1/sets",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- Tests ---

describe("POST /api/workouts/[id]/exercises/[weId]/sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("creates a set successfully (201)", async () => {
    const created = {
      id: "set-1",
      workoutExerciseId: "we-1",
      setNumber: 1,
      setType: "normal",
      weightKg: 80,
      reps: 10,
      durationSeconds: null,
      distanceMeters: null,
      isCompleted: false,
      rpe: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    };
    mockAddSet.mockResolvedValue({ type: "added", set: created });

    const response = await POST(
      makePostRequest({ weight_kg: 80, reps: 10 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.set).toEqual({
      id: "set-1",
      workout_exercise_id: "we-1",
      set_number: 1,
      set_type: "normal",
      weight_kg: 80,
      reps: 10,
      duration_seconds: null,
      distance_meters: null,
      is_completed: false,
      rpe: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    expect(mockAddSet).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
      set: {
        setType: "normal",
        weightKg: 80,
        reps: 10,
        isCompleted: false,
      },
    });
  });

  it("creates a set with defaults (empty body is valid)", async () => {
    const created = {
      id: "set-1",
      workoutExerciseId: "we-1",
      setNumber: 1,
      setType: "normal",
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      isCompleted: false,
      rpe: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    };
    mockAddSet.mockResolvedValue({ type: "added", set: created });

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.set.set_type).toBe("normal");
    expect(data.set.is_completed).toBe(false);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockAddSet.mockRejectedValue(new Error("DB error"));

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to add set");
  });

  it("maps missing and terminal outcomes", async () => {
    mockAddSet.mockResolvedValueOnce({ type: "not-found" });
    const missing = await POST(makePostRequest({}), { params });
    expect(missing.status).toBe(404);

    mockAddSet.mockResolvedValueOnce({
      type: "invalid-transition",
      currentStatus: "completed",
    });
    const terminal = await POST(makePostRequest({}), { params });
    expect(terminal.status).toBe(409);
  });
});
