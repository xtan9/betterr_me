import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockGetRoutine,
  mockUpdateRoutine,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetRoutine: vi.fn(),
  mockUpdateRoutine: vi.fn(),
  mockRpc: vi.fn(),
}));

const mockSupabase = {
  auth: { getUser: mockGetUser },
  rpc: mockRpc,
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

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/routines/[id]/start/route";

// --- Helpers ---

function makeRoutine() {
  return {
    id: "48500000-0000-4000-8000-000000000001",
    name: "Push Day",
    exercises: [
      {
        id: "re-1",
        exercise_id: "48500000-0000-4000-8000-000000000002",
        sort_order: 1,
        target_sets: 3,
        target_reps: 10,
        target_weight_kg: 60,
        target_duration_seconds: null,
        rest_timer_seconds: 90,
        notes: null,
        exercise: {
          id: "48500000-0000-4000-8000-000000000002",
          name: "Bench Press",
          exercise_type: "weight_reps",
        },
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
    mockRpc.mockResolvedValue({
      data: {
        id: "w-1",
        user_id: "user-123",
        title: "Push Day",
        status: "in_progress",
        exercises: [],
      },
      error: null,
    });
    mockUpdateRoutine.mockResolvedValue({});
  });

  it("creates workout from routine (201)", async () => {
    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.workout).toBeDefined();
    expect(data.workout.id).toBe("w-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
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
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "idx_workouts_active"',
      },
    });

    const response = await callPOST("routine-1");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active workout",
    });
  });

  it("updateRoutine failure does not delete the workout (fix 1a)", async () => {
    mockUpdateRoutine.mockRejectedValue(new Error("Update failed"));

    const response = await callPOST("routine-1");
    const data = await response.json();

    // The workout should still be returned successfully
    expect(response.status).toBe(201);
    expect(data.workout.id).toBe("w-1");
  });

  it("returns 500 when the atomic conversion fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Insert failed", code: "42000" },
    });

    const response = await callPOST("routine-1");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to start workout from routine",
    });
  });
});
