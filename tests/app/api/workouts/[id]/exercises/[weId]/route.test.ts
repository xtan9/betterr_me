import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockUpdateExercise, mockRemoveExercise } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockUpdateExercise: vi.fn(),
    mockRemoveExercise: vi.fn(),
  })
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workout-exercises", () => ({
  WorkoutExercisesDB: class {
    updateExercise = mockUpdateExercise;
    removeExercise = mockRemoveExercise;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PATCH,
  DELETE,
} from "@/app/api/workouts/[id]/exercises/[weId]/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1" });

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1",
    { method, ...(body ? { body: JSON.stringify(body) } : {}) }
  );
}

// --- Tests ---

describe("PATCH /api/workouts/[id]/exercises/[weId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates workout exercise successfully", async () => {
    const updated = { id: "we-1", rest_timer_seconds: 120 };
    mockUpdateExercise.mockResolvedValue(updated);

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise).toEqual(updated);
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateExercise.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { rest_timer_seconds: 120 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update workout exercise");
  });
});

describe("DELETE /api/workouts/[id]/exercises/[weId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("removes workout exercise (204)", async () => {
    mockRemoveExercise.mockResolvedValue(undefined);

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(204);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockRemoveExercise.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to remove exercise from workout");
  });
});
