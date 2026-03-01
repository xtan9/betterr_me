import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockStartWorkout, mockGetWorkoutsWithSummary } =
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
    startWorkout = mockStartWorkout;
    getWorkoutsWithSummary = mockGetWorkoutsWithSummary;
  },
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
    mockStartWorkout.mockResolvedValue(mockWorkout);

    const response = await POST(
      makePostRequest({ title: "Morning Workout" })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.workout).toEqual(mockWorkout);
    expect(mockStartWorkout).toHaveBeenCalledWith("user-123", {
      title: "Morning Workout",
    });
  });

  it("creates workout with default title when title is omitted", async () => {
    mockStartWorkout.mockResolvedValue({
      id: "w-1",
      title: "Workout",
      status: "in_progress",
    });

    const response = await POST(makePostRequest({}));

    expect(response.status).toBe(201);
    expect(mockStartWorkout).toHaveBeenCalledWith("user-123", {});
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 409 when active workout already exists (23505)", async () => {
    mockStartWorkout.mockRejectedValue(
      Object.assign(new Error("unique violation"), { code: "23505" })
    );

    const response = await POST(makePostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active workout");
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
