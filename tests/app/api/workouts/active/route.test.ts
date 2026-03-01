import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetUser, mockGetActiveWorkout, mockGetPreviousSets } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetActiveWorkout: vi.fn(),
    mockGetPreviousSets: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    getActiveWorkout = mockGetActiveWorkout;
    getPreviousSets = mockGetPreviousSets;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/workouts/active/route";

// --- Tests ---

describe("GET /api/workouts/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns enriched active workout with previousSets", async () => {
    const mockWorkout = {
      id: "w-1",
      status: "in_progress",
      exercises: [
        { id: "we-1", exercise_id: "ex-1", sets: [] },
      ],
    };
    const mockPrevSets = [{ id: "s-prev", set_number: 1, weight_kg: 60 }];

    mockGetActiveWorkout.mockResolvedValue(mockWorkout);
    mockGetPreviousSets.mockResolvedValue(mockPrevSets);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.exercises[0].previousSets).toEqual(mockPrevSets);
  });

  it("returns { workout: null } when no active workout exists", async () => {
    mockGetActiveWorkout.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout).toBeNull();
  });

  it("degrades gracefully when previousSets fetch fails", async () => {
    const mockWorkout = {
      id: "w-1",
      status: "in_progress",
      exercises: [
        { id: "we-1", exercise_id: "ex-1", sets: [] },
      ],
    };

    mockGetActiveWorkout.mockResolvedValue(mockWorkout);
    mockGetPreviousSets.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workout.exercises[0].previousSets).toEqual([]);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});
