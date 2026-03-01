import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetExerciseHistory } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetExerciseHistory: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getExerciseHistory = mockGetExerciseHistory;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/exercises/[id]/history/route";

// --- Helpers ---

const params = Promise.resolve({ id: "ex-1" });

function makeGetRequest(queryParams?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/exercises/ex-1/history");
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

// --- Tests ---

describe("GET /api/exercises/[id]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns exercise history", async () => {
    const history = [
      { workout_id: "w-1", date: "2026-02-01", max_weight: 80 },
      { workout_id: "w-2", date: "2026-02-05", max_weight: 85 },
    ];
    mockGetExerciseHistory.mockResolvedValue(history);

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(history);
    expect(mockGetExerciseHistory).toHaveBeenCalledWith(
      "ex-1",
      "user-123",
      { since: undefined }
    );
  });

  it("passes since query param", async () => {
    mockGetExerciseHistory.mockResolvedValue([]);

    const response = await GET(
      makeGetRequest({ since: "2026-01-01" }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(mockGetExerciseHistory).toHaveBeenCalledWith(
      "ex-1",
      "user-123",
      { since: "2026-01-01" }
    );
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetExerciseHistory.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch exercise history");
  });
});
