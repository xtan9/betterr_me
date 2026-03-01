import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockAddSet } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAddSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workout-exercises", () => ({
  WorkoutExercisesDB: class {
    addSet = mockAddSet;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/exercises/[weId]/sets/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1" });

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1/sets",
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- Tests ---

describe("POST /api/workouts/[id]/exercises/[weId]/sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("creates a set successfully (201)", async () => {
    const created = { id: "set-1", weight_kg: 80, reps: 10 };
    mockAddSet.mockResolvedValue(created);

    const response = await POST(
      makePostRequest({ weight_kg: 80, reps: 10 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.set).toEqual(created);
  });

  it("creates a set with defaults (empty body is valid)", async () => {
    const created = { id: "set-1", set_type: "normal", is_completed: false };
    mockAddSet.mockResolvedValue(created);

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.set).toEqual(created);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockAddSet.mockRejectedValue(new Error("DB error"));

    const response = await POST(makePostRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to add set");
  });
});
