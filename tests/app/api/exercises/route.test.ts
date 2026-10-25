import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetUser, mockGetAllExercises, mockCapabilities } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetAllExercises: vi.fn(),
    mockCapabilities: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockCapabilities,
  })),
}));

vi.mock("@/lib/db/exercises", () => ({
  ExercisesDB: class {
    getAllExercises = mockGetAllExercises;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/exercises/route";

// --- Tests ---

describe("GET /api/exercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCapabilities.mockResolvedValue({data:{protocolVersion:1,customExercises:{contractVersion:1,ready:false},completionVersions:[1,2]},error:null});
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns exercises list", async () => {
    const exercises = [
      { id: "ex-1", name: "Bench Press", exercise_media: null },
      { id: "ex-2", name: "Squat", exercise_media: null },
    ];
    mockGetAllExercises.mockResolvedValue(exercises);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercises).toEqual(exercises);
  });

  it("includes exercise_media in response (null for custom, object for preset)", async () => {
    const exercises = [
      {
        id: "ex-1",
        name: "Custom Exercise",
        is_custom: true,
        exercise_media: null,
      },
      {
        id: "ex-2",
        name: "Barbell Bench Press",
        is_custom: false,
        exercise_media: {
          gif_url: "https://v2.exercisedb.io/image/test.gif",
          thumbnail_url: "https://v2.exercisedb.io/image/test.gif",
          instructions: ["Step 1"],
          alternative_names: ["Alt name"],
          exercisedb_id: "0001",
          media_status: "active",
        },
      },
    ];
    mockGetAllExercises.mockResolvedValue(exercises);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exercises).toHaveLength(2);
    expect(data.exercises[0].exercise_media).toBeNull();
    expect(data.exercises[1].exercise_media).toMatchObject({
      gif_url: "https://v2.exercisedb.io/image/test.gif",
      instructions: ["Step 1"],
      exercisedb_id: "0001",
      media_status: "active",
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});
