import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockUpdateSet, mockDeleteSet } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockDeleteSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workout-exercises", () => ({
  WorkoutExercisesDB: class {
    updateSet = mockUpdateSet;
    deleteSet = mockDeleteSet;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PATCH,
  DELETE,
} from "@/app/api/workouts/[id]/exercises/[weId]/sets/[setId]/route";

// --- Helpers ---

const params = Promise.resolve({ id: "w-1", weId: "we-1", setId: "set-1" });

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/workouts/w-1/exercises/we-1/sets/set-1",
    { method, ...(body ? { body: JSON.stringify(body) } : {}) }
  );
}

// --- Tests ---

describe("PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates a set successfully", async () => {
    const updated = { id: "set-1", weight_kg: 85, reps: 8 };
    mockUpdateSet.mockResolvedValue(updated);

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85, reps: 8 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.set).toEqual(updated);
  });

  it("updates is_completed flag", async () => {
    const updated = { id: "set-1", is_completed: true };
    mockUpdateSet.mockResolvedValue(updated);

    const response = await PATCH(
      makeRequest("PATCH", { is_completed: true }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.set.is_completed).toBe(true);
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateSet.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { weight_kg: 85 }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update set");
  });
});

describe("DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("deletes a set (204)", async () => {
    mockDeleteSet.mockResolvedValue(undefined);

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(204);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockDeleteSet.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to delete set");
  });
});
