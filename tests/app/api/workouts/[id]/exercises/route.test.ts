import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockAddExercise } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAddExercise: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workout-exercises", () => ({
  WorkoutExercisesDB: class {
    addExercise = mockAddExercise;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/exercises/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1" });
const validExerciseUUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- Tests ---

describe("POST /api/workouts/[id]/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("adds exercise to workout (201)", async () => {
    const created = { id: "we-new", exercise_id: validExerciseUUID };
    mockAddExercise.mockResolvedValue(created);

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.exercise).toEqual(created);
    expect(mockAddExercise).toHaveBeenCalledWith(
      "w-1",
      validExerciseUUID,
      undefined
    );
  });

  it("passes rest_timer_seconds when provided", async () => {
    mockAddExercise.mockResolvedValue({ id: "we-new" });

    const response = await POST(
      makePostRequest({
        exercise_id: validExerciseUUID,
        rest_timer_seconds: 120,
      }),
      { params }
    );

    expect(response.status).toBe(201);
    expect(mockAddExercise).toHaveBeenCalledWith(
      "w-1",
      validExerciseUUID,
      120
    );
  });

  it("rejects invalid body — missing exercise_id (400)", async () => {
    const response = await POST(makePostRequest({}), { params });
    expect(response.status).toBe(400);
  });

  it("rejects invalid body — bad uuid (400)", async () => {
    const response = await POST(
      makePostRequest({ exercise_id: "not-a-uuid" }),
      { params }
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockAddExercise.mockRejectedValue(new Error("DB error"));

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to add exercise to workout");
  });
});
