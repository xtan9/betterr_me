import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetExerciseSets } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetExerciseSets: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getExerciseSets = mockGetExerciseSets;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/exercises/[id]/records/route";

// --- Helpers ---

function makeSet(
  weight: number,
  reps: number,
  startedAt: string
) {
  return {
    id: `s-${Math.random().toString(36).slice(2, 8)}`,
    workout_exercise_id: "we-1",
    set_number: 1,
    set_type: "normal" as const,
    weight_kg: weight,
    reps,
    duration_seconds: null,
    distance_meters: null,
    is_completed: true,
    rpe: null,
    created_at: startedAt,
    updated_at: startedAt,
    workout_started_at: startedAt,
  };
}

function callGET(exerciseId: string) {
  const request = new NextRequest(
    `http://localhost:3000/api/exercises/${exerciseId}/records`,
    { method: "GET" }
  );
  return GET(request, { params: Promise.resolve({ id: exerciseId }) });
}

// --- Tests ---

describe("GET /api/exercises/[id]/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns personal records for an exercise (200)", async () => {
    mockGetExerciseSets.mockResolvedValue([
      makeSet(60, 10, "2026-02-20T10:00:00Z"),
      makeSet(80, 5, "2026-02-25T10:00:00Z"),
    ]);

    const response = await callGET("ex-1");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise_id).toBe("ex-1");
    expect(data.best_weight_kg).toBe(80);
    expect(data.best_reps).toBe(10);
    expect(data.best_volume).toBe(600); // max(80*5=400, 60*10=600) = 600
  });

  it("returns null records for exercise with no history", async () => {
    mockGetExerciseSets.mockResolvedValue([]);

    const response = await callGET("ex-1");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise_id).toBe("ex-1");
    expect(data.best_weight_kg).toBeNull();
    expect(data.best_reps).toBeNull();
    expect(data.best_volume).toBeNull();
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await callGET("ex-1");
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on DB error", async () => {
    mockGetExerciseSets.mockRejectedValue(new Error("DB error"));

    const response = await callGET("ex-1");
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch exercise records");
  });
});
