import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockUpdateSet, mockDeleteSet, mockToWorkoutSetResponse } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockDeleteSet: vi.fn(),
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
  createWorkoutWrites: vi.fn(() => ({
    updateSet: mockUpdateSet,
    removeSet: mockDeleteSet,
  })),
  toWorkoutSetResponse: mockToWorkoutSetResponse,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PATCH,
  DELETE,
} from "@/app/api/workouts/[id]/exercises/[weId]/sets/[setId]/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1", setId: "set-1" });

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1/sets/set-1",
    { method, ...(body ? { body: JSON.stringify(body) } : {}) }
  );
}

// --- Tests ---

describe("PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates a set successfully", async () => {
    const updated = {
      id: "set-1",
      workoutExerciseId: "we-1",
      setNumber: 1,
      setType: "normal",
      weightKg: 85,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      isCompleted: false,
      rpe: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    };
    mockUpdateSet.mockResolvedValue({ type: "updated", set: updated });

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85, reps: 8 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.set).toEqual({
      id: "set-1",
      workout_exercise_id: "we-1",
      set_number: 1,
      set_type: "normal",
      weight_kg: 85,
      reps: 8,
      duration_seconds: null,
      distance_meters: null,
      is_completed: false,
      rpe: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    expect(mockUpdateSet).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
      setId: "set-1",
      changes: { weightKg: 85, reps: 8 },
    });
  });

  it("updates is_completed flag", async () => {
    const updated = {
      id: "set-1",
      workoutExerciseId: "we-1",
      setNumber: 1,
      setType: "normal",
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      isCompleted: true,
      rpe: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    };
    mockUpdateSet.mockResolvedValue({ type: "updated", set: updated });

    const response = await PATCH(
      makeRequest("PATCH", { is_completed: true }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.set.is_completed).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
      setId: "set-1",
      changes: { isCompleted: true },
    });
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateSet.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update set");
  });

  it("maps missing and terminal outcomes", async () => {
    mockUpdateSet.mockResolvedValueOnce({ type: "not-found" });
    const missing = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params },
    );
    expect(missing.status).toBe(404);

    mockUpdateSet.mockResolvedValueOnce({
      type: "invalid-transition",
      currentStatus: "completed",
    });
    const terminal = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params },
    );
    expect(terminal.status).toBe(409);
  });
});

describe("DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("deletes a set (204)", async () => {
    mockDeleteSet.mockResolvedValue({ type: "removed" });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(204);
    expect(mockDeleteSet).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      workoutExerciseId: "we-1",
      setId: "set-1",
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockDeleteSet.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to delete set");
  });

  it("maps missing and terminal outcomes", async () => {
    mockDeleteSet.mockResolvedValueOnce({ type: "not-found" });
    const missing = await DELETE(makeRequest("DELETE"), { params });
    expect(missing.status).toBe(404);

    mockDeleteSet.mockResolvedValueOnce({
      type: "invalid-transition",
      currentStatus: "discarded",
    });
    const terminal = await DELETE(makeRequest("DELETE"), { params });
    expect(terminal.status).toBe(409);
  });
});
