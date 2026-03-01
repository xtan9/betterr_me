import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockUpdateWorkout, mockGetWorkoutWithExercises } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateWorkout: vi.fn(),
    mockGetWorkoutWithExercises: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    updateWorkout = mockUpdateWorkout;
    getWorkoutWithExercises = mockGetWorkoutWithExercises;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, PATCH } from "@/app/api/workouts/[id]/route";

// --- Helpers ---

function makePatchRequest(workoutId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/workouts/${workoutId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

function makeGetRequest(workoutId: string) {
  return new NextRequest(
    `http://localhost:3000/api/workouts/${workoutId}`,
    { method: "GET" }
  );
}

function callPATCH(request: NextRequest, workoutId: string) {
  return PATCH(request, { params: Promise.resolve({ id: workoutId }) });
}

function callGET(request: NextRequest, workoutId: string) {
  return GET(request, { params: Promise.resolve({ id: workoutId }) });
}

// --- Tests ---

describe("PATCH /api/workouts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("completes a workout", async () => {
    const completedWorkout = {
      id: "w-1",
      status: "completed",
      completed_at: "2026-02-28T12:00:00Z",
      duration_seconds: 3600,
    };
    mockUpdateWorkout.mockResolvedValue(completedWorkout);

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "completed" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.status).toBe("completed");
    expect(mockUpdateWorkout).toHaveBeenCalledWith("w-1", {
      status: "completed",
    });
  });

  it("discards a workout", async () => {
    mockUpdateWorkout.mockResolvedValue({
      id: "w-1",
      status: "discarded",
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "discarded" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.status).toBe("discarded");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "completed" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for empty body", async () => {
    const response = await callPATCH(
      makePatchRequest("w-1", {}),
      "w-1"
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 when DB update fails", async () => {
    mockUpdateWorkout.mockRejectedValue(new Error("DB error"));

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "completed" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update workout");
  });
});

describe("GET /api/workouts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns workout with exercises", async () => {
    const mockWorkout = {
      id: "w-1",
      title: "Test Workout",
      exercises: [],
    };
    mockGetWorkoutWithExercises.mockResolvedValue(mockWorkout);

    const response = await callGET(makeGetRequest("w-1"), "w-1");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout).toEqual(mockWorkout);
  });

  it("returns 404 when workout not found", async () => {
    mockGetWorkoutWithExercises.mockResolvedValue(null);

    const response = await callGET(makeGetRequest("nonexistent"), "nonexistent");
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Workout not found");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await callGET(makeGetRequest("w-1"), "w-1");
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});
