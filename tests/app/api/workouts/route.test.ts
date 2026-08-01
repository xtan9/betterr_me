import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockStartWorkout,
  mockGetWorkoutsWithSummary,
} =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockStartWorkout: vi.fn(),
    mockGetWorkoutsWithSummary: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getWorkoutsWithSummary = mockGetWorkoutsWithSummary;
  },
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({ start: mockStartWorkout })),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "@/app/api/workouts/route";

// --- Helpers ---

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/workouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/workouts");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

// --- Tests ---

describe("POST /api/workouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("creates a new workout (201)", async () => {
    const mockWorkout = {
      id: "w-1",
      user_id: "user-123",
      title: "Morning Workout",
      status: "in_progress",
    };
    mockStartWorkout.mockResolvedValue({ type: "started", workout: mockWorkout });

    const response = await POST(
      makePostRequest({ title: "Morning Workout" })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.workout).toEqual(mockWorkout);
    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "blank", title: "Morning Workout" },
    });
  });

  it("creates workout with default title when title is omitted", async () => {
    mockStartWorkout.mockResolvedValue({
      type: "started",
      workout: {
        id: "w-1",
        title: "Workout",
        status: "in_progress",
      },
    });

    const response = await POST(makePostRequest({}));

    expect(response.status).toBe(201);
    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "blank" },
    });
  });

  it("maps a routine request through the shared source contract", async () => {
    const routineId = "64500000-0000-4000-8000-000000000001";
    mockStartWorkout.mockResolvedValue({
      type: "started",
      workout: { id: "w-1", routine_id: routineId, exercises: [] },
    });

    const response = await POST(
      makePostRequest({ routine_id: routineId, title: "Ignored title" }),
    );

    expect(response.status).toBe(201);
    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "routine", routineId },
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 409 for the expected active-workout conflict", async () => {
    mockStartWorkout.mockResolvedValue({ type: "conflict" });

    const response = await POST(makePostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active workout");
  });

  it("maps an invalid shared source to a client error", async () => {
    mockStartWorkout.mockResolvedValue({
      type: "invalid-source",
      message: "Routine source is invalid",
    });

    const response = await POST(makePostRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Routine source is invalid",
    });
  });

  it("returns 500 on unexpected error", async () => {
    mockStartWorkout.mockRejectedValue(new Error("DB connection error"));

    const response = await POST(makePostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to start workout");
  });
});

describe("GET /api/workouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns workout summaries", async () => {
    const summaries = [
      { id: "w-1", title: "Workout 1", exerciseCount: 3 },
    ];
    mockGetWorkoutsWithSummary.mockResolvedValue(summaries);

    const response = await GET(makeGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(summaries);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeGetRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});
