import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetRoutine, mockAddExerciseToRoutine } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockGetRoutine: vi.fn(),
    mockAddExerciseToRoutine: vi.fn(),
  })
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getRoutine = mockGetRoutine;
    addExerciseToRoutine = mockAddExerciseToRoutine;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "@/app/api/routines/[id]/exercises/route";

// --- Helpers ---

const params = Promise.resolve({ id: "r-1" });
const validExerciseUUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/routines/r-1/exercises",
    { method: "POST", body: JSON.stringify(body) }
  );
}

function makeGetRequest() {
  return new NextRequest(
    "http://localhost:3000/api/routines/r-1/exercises",
    { method: "GET" }
  );
}

// --- Tests ---

describe("GET /api/routines/[id]/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns exercises for a routine", async () => {
    const exercises = [
      { id: "re-1", exercise_id: "ex-1", target_sets: 3 },
    ];
    mockGetRoutine.mockResolvedValue({
      id: "r-1",
      name: "Push Day",
      exercises,
    });

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercises).toEqual(exercises);
  });

  it("returns 404 when routine not found", async () => {
    mockGetRoutine.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine not found");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetRoutine.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch routine exercises");
  });
});

describe("POST /api/routines/[id]/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("adds exercise to routine (201)", async () => {
    const created = { id: "re-new", exercise_id: validExerciseUUID };
    mockAddExerciseToRoutine.mockResolvedValue(created);

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.exercise).toEqual(created);
  });

  it("rejects invalid body — missing exercise_id (400)", async () => {
    const response = await POST(makePostRequest({}), { params });
    expect(response.status).toBe(400);
  });

  it("rejects invalid body — bad uuid format (400)", async () => {
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
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockAddExerciseToRoutine.mockRejectedValue(new Error("DB error"));

    const response = await POST(
      makePostRequest({ exercise_id: validExerciseUUID }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to add exercise to routine");
  });
});
