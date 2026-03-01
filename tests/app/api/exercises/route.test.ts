import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetAllExercises, mockCreateExercise } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetAllExercises: vi.fn(),
    mockCreateExercise: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/exercises", () => ({
  ExercisesDB: class {
    getAllExercises = mockGetAllExercises;
    createExercise = mockCreateExercise;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "@/app/api/exercises/route";

// --- Helpers ---

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/exercises", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("GET /api/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns exercises list", async () => {
    const exercises = [
      { id: "ex-1", name: "Bench Press" },
      { id: "ex-2", name: "Squat" },
    ];
    mockGetAllExercises.mockResolvedValue(exercises);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercises).toEqual(exercises);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});

describe("POST /api/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("creates exercise successfully (201)", async () => {
    const created = { id: "ex-new", name: "Custom Press" };
    mockCreateExercise.mockResolvedValue(created);

    const response = await POST(
      makePostRequest({
        name: "Custom Press",
        muscle_group_primary: "chest",
        muscle_groups_secondary: [],
        equipment: "barbell",
        exercise_type: "weight_reps",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.exercise).toEqual(created);
  });

  it("rejects invalid body (400)", async () => {
    const response = await POST(makePostRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      makePostRequest({ name: "Test" })
    );
    expect(response.status).toBe(401);
  });
});
