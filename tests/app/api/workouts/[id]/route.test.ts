import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockUpdateWorkout,
  mockCompleteWorkout,
  mockDiscardWorkout,
  mockGetWorkoutWithExercises,
  mockToWorkoutResponse,
} =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateWorkout: vi.fn(),
    mockCompleteWorkout: vi.fn(),
    mockDiscardWorkout: vi.fn(),
    mockGetWorkoutWithExercises: vi.fn(),
    mockToWorkoutResponse: vi.fn((workout: Record<string, unknown>) => ({
      id: workout.id,
      status: workout.status,
      title: workout.title,
      notes: workout.notes,
      completed_at: workout.completedAt,
      duration_seconds: workout.durationSeconds,
    })),
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

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({
    update: mockUpdateWorkout,
    complete: mockCompleteWorkout,
    discard: mockDiscardWorkout,
  })),
  toWorkoutResponse: mockToWorkoutResponse,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, PATCH } from "@/app/api/workouts/[id]/route";

function mutationWorkout(overrides: Record<string, unknown> = {}) {
  return {
    id: "w-1",
    userId: "user-123",
    title: "Workout",
    notes: null,
    startedAt: "2026-08-01T12:00:00.000Z",
    completedAt: null,
    durationSeconds: null,
    status: "in_progress",
    routineId: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    const completedWorkout = mutationWorkout({
      status: "completed",
      completedAt: "2026-02-28T12:00:00Z",
      durationSeconds: 3600,
    });
    mockCompleteWorkout.mockResolvedValue({
      type: "transitioned",
      workout: completedWorkout,
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "completed" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.status).toBe("completed");
    expect(mockCompleteWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
    });
  });

  it("discards a workout", async () => {
    mockDiscardWorkout.mockResolvedValue({
      type: "transitioned",
      workout: mutationWorkout({ status: "discarded" }),
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "discarded" }),
      "w-1"
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.status).toBe("discarded");
    expect(mockDiscardWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
    });
  });

  it("treats an already-applied completion as a successful idempotent response", async () => {
    const completedWorkout = mutationWorkout({
      status: "completed",
      completedAt: "2026-02-28T12:00:00Z",
      durationSeconds: 3600,
    });
    mockCompleteWorkout.mockResolvedValue({
      type: "already-applied",
      workout: completedWorkout,
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "completed", notes: "Repeated" }),
      "w-1",
    );

    expect(response.status).toBe(200);
    expect(mockCompleteWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
      notes: "Repeated",
    });
  });

  it("maps a missing discard target to 404", async () => {
    mockDiscardWorkout.mockResolvedValue({ type: "not-found" });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "discarded" }),
      "w-1",
    );

    expect(response.status).toBe(404);
    expect(mockDiscardWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w-1",
    });
  });

  it("maps an invalid discard transition to 409", async () => {
    mockDiscardWorkout.mockResolvedValue({
      type: "invalid-transition",
      currentStatus: "completed",
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { status: "discarded" }),
      "w-1",
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Workout is no longer editable");
  });

  it("maps a missing or cross-owner workout outcome to 404", async () => {
    mockUpdateWorkout.mockResolvedValue({ type: "not-found" });

    const response = await callPATCH(
      makePatchRequest("w-1", { title: "Renamed" }),
      "w-1",
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Workout not found");
  });

  it("maps a terminal-workout invalid transition to a conflict", async () => {
    mockUpdateWorkout.mockResolvedValue({
      type: "invalid-transition",
      currentStatus: "completed",
    });

    const response = await callPATCH(
      makePatchRequest("w-1", { title: "Renamed" }),
      "w-1",
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Workout is no longer editable");
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
    mockCompleteWorkout.mockRejectedValue(new Error("DB error"));

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
