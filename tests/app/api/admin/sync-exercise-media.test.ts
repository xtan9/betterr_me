import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockFetchAll,
  mockMatchExercises,
  mockAdminFrom,
  mockProfileFrom,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchAll: vi.fn(),
  mockMatchExercises: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockProfileFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockProfileFrom,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock("@/lib/exercisedb/client", () => ({
  ExerciseDBClient: class {
    fetchAll = mockFetchAll;
  },
}));

vi.mock("@/lib/exercisedb/matcher", () => ({
  matchExercises: mockMatchExercises,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/admin/sync-exercise-media/route";

// --- Helpers ---
function makeRequest(body?: Record<string, unknown>, headers?: Record<string, string>) {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const req = new NextRequest("http://localhost:3000/api/admin/sync-exercise-media", init);
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => {
      req.headers.set(k, v);
    });
  }
  return req;
}

// --- Mock data ---
const mockPresetExercises = [
  {
    id: "ex-1",
    name: "Barbell Bench Press",
    muscle_group_primary: "chest",
    equipment: "barbell",
    is_custom: false,
  },
  {
    id: "ex-2",
    name: "Squat",
    muscle_group_primary: "quadriceps",
    equipment: "barbell",
    is_custom: false,
  },
];

const mockDbExercises = [
  {
    id: "0025",
    name: "barbell bench press",
    bodyPart: "chest",
    target: "pectorals",
    equipment: "barbell",
    gifUrl: "https://v2.exercisedb.io/image/0025.gif",
    instructions: ["Lie on bench", "Press barbell up"],
    secondaryMuscles: ["triceps"],
  },
];

const mockMatchResults = [
  {
    exercise: mockPresetExercises[0],
    match: mockDbExercises[0],
    confidence: 0.95,
    equipmentMatch: true,
    muscleMatch: true,
    verified: false,
  },
  {
    exercise: mockPresetExercises[1],
    match: null,
    confidence: 0.3,
    equipmentMatch: false,
    muscleMatch: false,
    verified: false,
  },
];

// --- Test setup ---
function setupProfileQuery(role: "user" | "admin") {
  mockProfileFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "user-123", role },
          error: null,
        }),
      }),
    }),
  });
}

function setupAuthenticatedAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  setupProfileQuery("user"); // default to non-admin; tests with secret still work
  process.env.ADMIN_SYNC_SECRET = "test-secret";
  process.env.EXERCISEDB_API_KEY = "test-key";
}

function setupAdminClient() {
  // Mock the admin client from() chain
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: mockPresetExercises, error: null }),
  });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "exercises") {
      return { select: mockSelect };
    }
    return { upsert: mockUpsert };
  });

  return { mockSelect, mockUpsert };
}

// --- Tests ---
describe("POST /api/admin/sync-exercise-media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_SYNC_SECRET;
    delete process.env.EXERCISEDB_API_KEY;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when x-admin-secret header does not match env var and user is not admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("user");
    process.env.ADMIN_SYNC_SECRET = "real-secret";

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "wrong-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 403 when ADMIN_SYNC_SECRET env var is not set and user is not admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("user");
    // ADMIN_SYNC_SECRET not set

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "any-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 200 for admin user without secret header", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("admin");
    process.env.EXERCISEDB_API_KEY = "test-key";
    // No ADMIN_SYNC_SECRET set, no x-admin-secret header
    setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.matched).toBe(1);
  });

  it("calls ExerciseDBClient.fetchAll to get all ExerciseDB exercises", async () => {
    setupAuthenticatedAdmin();
    setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    await POST(makeRequest({}, { "x-admin-secret": "test-secret" }));

    expect(mockFetchAll).toHaveBeenCalledOnce();
  });

  it("calls matchExercises to fuzzy-match preset exercises", async () => {
    setupAuthenticatedAdmin();
    setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    await POST(
      makeRequest({ threshold: 0.6 }, { "x-admin-secret": "test-secret" })
    );

    expect(mockMatchExercises).toHaveBeenCalledWith(
      mockPresetExercises,
      mockDbExercises,
      0.6
    );
  });

  it("upserts matched exercises into exercise_media via admin client", async () => {
    setupAuthenticatedAdmin();
    const { mockUpsert } = setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    await POST(makeRequest({}, { "x-admin-secret": "test-secret" }));

    // Should have called upsert for exercise_media
    expect(mockAdminFrom).toHaveBeenCalledWith("exercise_media");
    expect(mockUpsert).toHaveBeenCalled();
    // The upsert call for exercise_media should contain only matched exercises
    const mediaCall = mockUpsert.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && call[0].length > 0 && "gif_url" in call[0][0]
    );
    expect(mediaCall).toBeDefined();
    expect(mediaCall![0]).toHaveLength(1); // only 1 matched
    expect(mediaCall![0][0]).toMatchObject({
      exercise_id: "ex-1",
      exercisedb_id: "0025",
      gif_url: "https://v2.exercisedb.io/image/0025.gif",
    });
  });

  it("upserts match records into exercise_name_mappings via admin client", async () => {
    setupAuthenticatedAdmin();
    const { mockUpsert } = setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    await POST(makeRequest({}, { "x-admin-secret": "test-secret" }));

    expect(mockAdminFrom).toHaveBeenCalledWith("exercise_name_mappings");
    // Should upsert all mapping records (matched and unmatched)
    const mappingCall = mockUpsert.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[0]) && call[0].length > 0 && "our_name" in call[0][0]
    );
    expect(mappingCall).toBeDefined();
    expect(mappingCall![0]).toHaveLength(2); // all exercises get a mapping record
  });

  it("returns mapping report with matched count, unmatched count, and per-exercise details", async () => {
    setupAuthenticatedAdmin();
    setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.matched).toBe(1);
    expect(data.unmatched).toBe(1);
    expect(data.total).toBe(2);
    expect(data.dryRun).toBe(false);
    expect(data.mappings).toHaveLength(2);
    expect(data.mappings[0]).toMatchObject({
      our_name: "Barbell Bench Press",
      matched_name: "barbell bench press",
      confidence: 0.95,
      equipment_match: true,
      muscle_match: true,
      exercisedb_id: "0025",
    });
    expect(data.mappings[1]).toMatchObject({
      our_name: "Squat",
      matched_name: null,
      confidence: 0.3,
    });
  });

  it("returns 500 on ExerciseDB API failure", async () => {
    setupAuthenticatedAdmin();
    setupAdminClient();
    mockFetchAll.mockRejectedValue(new Error("ExerciseDB API error: 503"));

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to sync exercise media");
  });

  it("does not upsert when dryRun is true", async () => {
    setupAuthenticatedAdmin();
    const { mockUpsert } = setupAdminClient();
    mockFetchAll.mockResolvedValue(mockDbExercises);
    mockMatchExercises.mockReturnValue(mockMatchResults);

    const response = await POST(
      makeRequest({ dryRun: true }, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dryRun).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
