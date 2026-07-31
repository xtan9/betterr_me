import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockGetWorkoutWithExercises, mockSave } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockGetWorkoutWithExercises: vi.fn(),
    mockSave: vi.fn(),
  }),
);

const mockSupabase = {
  auth: { getUser: mockGetUser },
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getWorkoutWithExercises = mockGetWorkoutWithExercises;
  },
}));

vi.mock("@/lib/fitness/routine-workout-conversion", () => ({
  WorkoutToRoutineConversion: class {
    save = mockSave;
  },
}));

vi.mock("@/lib/fitness/supabase-routine-workout-store", () => ({
  SupabaseRoutineWorkoutStore: class {},
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/save-as-routine/route";

function makeRequest(workoutId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/workouts/${workoutId}/save-as-routine`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

function callPOST(request: NextRequest, workoutId: string) {
  return POST(request, { params: Promise.resolve({ id: workoutId }) });
}

describe("POST /api/workouts/[id]/save-as-routine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockGetWorkoutWithExercises.mockResolvedValue({
      id: "workout-1",
      exercises: [],
    });
    mockSave.mockResolvedValue({
      id: "routine-1",
      user_id: "user-123",
      name: "My Routine",
      exercises: [],
    });
  });

  it("delegates the complete conversion and returns its routine", async () => {
    const workout = { id: "workout-1", exercises: [] };
    mockGetWorkoutWithExercises.mockResolvedValue(workout);

    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      routine: { id: "routine-1", name: "My Routine", exercises: [] },
    });
    expect(mockSave).toHaveBeenCalledWith(
      "user-123",
      "My Routine",
      workout,
    );
  });

  it("returns 401 for an unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(401);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns 404 when the workout does not exist", async () => {
    mockGetWorkoutWithExercises.mockResolvedValue(null);

    const response = await callPOST(
      makeRequest("missing", { name: "My Routine" }),
      "missing",
    );

    expect(response.status).toBe(404);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns one failure response when atomic conversion fails", async () => {
    mockSave.mockRejectedValue(new Error("transaction failed"));

    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to save workout as routine",
    });
  });
});
