import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockUpdateRoutineExercise, mockRemoveRoutineExercise } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateRoutineExercise: vi.fn(),
    mockRemoveRoutineExercise: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/fitness/routine-writes", () => ({
  createRoutineWrites: () => ({
    updateExercise: mockUpdateRoutineExercise,
    removeExercise: mockRemoveRoutineExercise,
  }),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PATCH, DELETE } from "@/app/api/routines/[id]/exercises/[reId]/route";

// --- Helpers ---

const params = Promise.resolve({ id: "r-1", reId: "re-1" });

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/routines/r-1/exercises/re-1",
    { method, ...(body ? { body: JSON.stringify(body) } : {}) }
  );
}

// --- Tests ---

describe("PATCH /api/routines/[id]/exercises/[reId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates routine exercise successfully", async () => {
    const updated = { id: "re-1", target_sets: 5 };
    mockUpdateRoutineExercise.mockResolvedValue({
      type: "updated",
      exercise: updated,
    });

    const response = await PATCH(
      makeRequest("PATCH", { target_sets: 5 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise).toEqual(updated);
    expect(mockUpdateRoutineExercise).toHaveBeenCalledWith({
      userId: "user-123",
      routineId: "r-1",
      routineExerciseId: "re-1",
      changes: {
        targetSets: 5,
        targetReps: undefined,
        targetWeightKg: undefined,
        targetDurationSeconds: undefined,
        targetDistanceMeters: undefined,
        restTimerSeconds: undefined,
        notes: undefined,
        sortOrder: undefined,
      },
    });
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 404 for not found (PGRST116)", async () => {
    mockUpdateRoutineExercise.mockResolvedValue({ type: "not-found" });

    const response = await PATCH(
      makeRequest("PATCH", { target_sets: 5 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine exercise not found");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { target_sets: 5 }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateRoutineExercise.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { target_sets: 5 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update routine exercise");
  });
});

describe("DELETE /api/routines/[id]/exercises/[reId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("removes routine exercise successfully", async () => {
    mockRemoveRoutineExercise.mockResolvedValue({ type: "removed" });

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockRemoveRoutineExercise.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to remove routine exercise");
  });
});
