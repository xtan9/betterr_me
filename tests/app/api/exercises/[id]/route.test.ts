import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetExercise } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetExercise: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/exercises", () => ({
  ExercisesDB: class {
    getExercise = mockGetExercise;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/exercises/[id]/route";

// --- Helpers ---

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/exercises/ex-1", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ id: "ex-1" });

// --- Tests ---

describe("GET /api/exercises/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns exercise by id", async () => {
    const exercise = { id: "ex-1", name: "Bench Press" };
    mockGetExercise.mockResolvedValue(exercise);

    const response = await GET(makeRequest("GET"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercise).toEqual(exercise);
  });

  it("returns 404 when not found", async () => {
    mockGetExercise.mockResolvedValue(null);

    const response = await GET(makeRequest("GET"), { params });
    expect(response.status).toBe(404);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeRequest("GET"), { params });
    expect(response.status).toBe(401);
  });
});
