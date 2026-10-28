import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthRetryableFetchError } from "@supabase/supabase-js";

// --- Hoisted mocks ---
const {
  mockGetUser,
  mockLoadCatalog,
  mockDownloadAndStoreGif,
  mockAdminFrom,
  mockProfileFrom,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockLoadCatalog: vi.fn(),
  mockDownloadAndStoreGif: vi.fn(),
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

vi.mock("@/lib/exercisedb/catalog", () => ({
  loadCatalog: mockLoadCatalog,
}));

vi.mock("@/lib/exercisedb/gif-downloader", () => ({
  downloadAndStoreGif: mockDownloadAndStoreGif,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/admin/sync-exercise-media/route";

// --- Helpers ---
function makeRequest(body?: Record<string, unknown>, headers?: Record<string, string>) {
  const init: ConstructorParameters<typeof NextRequest>[1] = { method: "POST" };
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
const mockCatalogEntries = [
  {
    preset_id: "00000000-0000-4000-8000-000000000501",
    name: "Barbell Bench Press",
    muscle_group_primary: "chest",
    muscle_groups_secondary: ["triceps", "shoulders"],
    equipment: "barbell",
    exercise_type: "weight_reps",
    exercisedb_id: "0025",
    exercisedb_name: "barbell bench press",
    gif_url: "https://v2.exercisedb.io/image/0025.gif",
  },
  {
    preset_id: "00000000-0000-4000-8000-000000000502",
    name: "Cable Crossover",
    muscle_group_primary: "chest",
    muscle_groups_secondary: [],
    equipment: "cable",
    exercise_type: "weight_reps",
    exercisedb_id: null,
    exercisedb_name: null,
    gif_url: null,
  },
];

const mockExistingExercises = [
  {
    id: "00000000-0000-4000-8000-000000000501",
    name: "Barbell Bench Press",
    muscle_group_primary: "chest",
    equipment: "barbell",
    exercise_type: "weight_reps",
    user_id: null,
    is_custom: false,
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
}

function setupAdminClient() {
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: mockExistingExercises, error: null }) }),
  });
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const mockInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "ex-new-1" },
        error: null,
      }),
    }),
  });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "exercises") {
      return { select: mockSelect, update: mockUpdate, insert: mockInsert };
    }
    return { upsert: mockUpsert };
  });

  return { mockSelect, mockUpdate, mockInsert, mockUpsert };
}

function setupCatalog() {
  mockLoadCatalog.mockReturnValue(mockCatalogEntries);
}

// --- Tests ---
describe("POST /api/admin/sync-exercise-media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_SYNC_SECRET;
  });

  it("returns 500 when an admin secret is supplied but not configured", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "wrong-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Server misconfigured");
  });

  it("allows unauthenticated request with valid x-admin-secret", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    process.env.ADMIN_SYNC_SECRET = "test-secret";
    setupCatalog();
    setupAdminClient();

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );

    expect(response.status).toBe(200);
  });

  it("allows a valid x-admin-secret when admin authentication is unavailable", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("Auth service unavailable", 503),
    });
    process.env.ADMIN_SYNC_SECRET = "test-secret";
    setupCatalog();
    setupAdminClient();

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 401 when the supplied admin secret is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("Auth service unavailable", 503),
    });
    process.env.ADMIN_SYNC_SECRET = "test-secret";

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "wrong-secret" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid credentials",
    });
  });

  it("returns 401 when x-admin-secret header does not match env var", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("user");
    process.env.ADMIN_SYNC_SECRET = "real-secret";

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "wrong-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid credentials");
  });

  it("returns 500 when ADMIN_SYNC_SECRET is not set but the header is supplied", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("user");

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "any-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Server misconfigured");
  });

  it("returns 200 for admin user without secret header", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    setupProfileQuery("admin");
    setupCatalog();
    setupAdminClient();

    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
  });

  it("preserves existing preset definitions while inserting new catalog exercises", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const { mockUpdate } = setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue("https://storage.example.com/0025.gif");

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.updated).toBe(0);
    expect(data.unchanged).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    // Cable Crossover is new → created
    expect(data.created).toBe(1);
    expect(data.total).toBe(2);
  });

  it("creates a distinct movement instead of reusing a similar preset name", async () => {
    setupAuthenticatedAdmin();
    mockLoadCatalog.mockReturnValue([{ ...mockCatalogEntries[0], name: "Incline Barbell Bench Press",
      preset_id: "00000000-0000-4000-8000-000000000503" }]);
    setupAdminClient();

    const response = await POST(makeRequest({ dryRun: true }, { "x-admin-secret": "test-secret" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, created: 1, updated: 0 });
  });

  it("uses the reviewed catalog UUID for a new preset so retries cannot create another identity", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const { mockInsert } = setupAdminClient();

    const response = await POST(makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" }));

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000502", name: "Cable Crossover",
      equipment: "cable", exercise_type: "weight_reps", user_id: null, is_custom: false,
    }));
  });

  it("rejects a changed definition for an existing catalog UUID before any write", async () => {
    setupAuthenticatedAdmin();
    mockLoadCatalog.mockReturnValue([
      mockCatalogEntries[1],
      { ...mockCatalogEntries[0], equipment: "dumbbell" },
    ]);
    const { mockUpdate, mockInsert, mockUpsert } = setupAdminClient();

    const response = await POST(makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Catalog identity conflicts with an existing preset" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("downloads GIFs for matched catalog entries", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue("https://storage.example.com/0025.gif");

    await POST(makeRequest({}, { "x-admin-secret": "test-secret" }));

    // Only the first entry has exercisedb_id
    expect(mockDownloadAndStoreGif).toHaveBeenCalledWith(
      "0025",
      "https://v2.exercisedb.io/image/0025.gif"
    );
    expect(mockDownloadAndStoreGif).toHaveBeenCalledTimes(1);
  });

  it("skips GIF downloads when skipGifs is true", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    setupAdminClient();

    const response = await POST(
      makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockDownloadAndStoreGif).not.toHaveBeenCalled();
    expect(data.skipGifs).toBe(true);
    expect(data.gifsDownloaded).toBe(0);
  });

  it("does not write when dryRun is true", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const { mockUpdate, mockInsert, mockUpsert } = setupAdminClient();

    const response = await POST(
      makeRequest({ dryRun: true }, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dryRun).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDownloadAndStoreGif).not.toHaveBeenCalled();
  });

  it("handles GIF download failures gracefully", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue(null); // download failed

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gifsFailed).toBe(1);
    expect(data.gifsDownloaded).toBe(0);
  });

  it("upserts exercise_media for matched catalog entries", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const { mockUpsert } = setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue("https://storage.example.com/0025.gif");

    await POST(makeRequest({}, { "x-admin-secret": "test-secret" }));

    expect(mockAdminFrom).toHaveBeenCalledWith("exercise_media");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: "00000000-0000-4000-8000-000000000501",
        exercisedb_id: "0025",
        gif_url: "https://storage.example.com/0025.gif",
      }),
      { onConflict: "exercise_id" }
    );
  });

  it("returns report with all counts", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue("https://storage.example.com/0025.gif");

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(data).toMatchObject({
      total: 2,
      created: expect.any(Number),
      updated: expect.any(Number),
      exercisesFailed: expect.any(Number),
      gifsDownloaded: expect.any(Number),
      gifsFailed: expect.any(Number),
      mediaFailed: expect.any(Number),
      dryRun: false,
      skipGifs: false,
    });
  });

  it("returns 400 on invalid body input", async () => {
    setupAuthenticatedAdmin();

    const response = await POST(
      makeRequest({ dryRun: "not-a-boolean" }, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
  });

  it("returns 500 when exercise fetch fails", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: null, error: { message: "connection refused" } }) }),
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "exercises") {
        return { select: mockSelect };
      }
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch preset exercises");
  });

  it("keeps both definitions unchanged on an additive rerun", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    const { mockSelect, mockInsert, mockUpdate } = setupAdminClient();
    const first = await POST(makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" }));
    expect(await first.json()).toMatchObject({ created: 1, unchanged: 1, updated: 0 });
    mockSelect.mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({
      data: mockCatalogEntries.map(entry => ({ ...entry, id: entry.preset_id, is_custom: false, user_id: null })), error: null,
    }) }) });

    const second = await POST(makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" }));

    expect(await second.json()).toMatchObject({ created: 0, unchanged: 2, updated: 0 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each(["duplicate-id", "duplicate-definition", "missing-id"])("rejects %s before any write", async (problem) => {
    setupAuthenticatedAdmin();
    const { mockInsert, mockUpdate, mockUpsert } = setupAdminClient();
    const second = { ...mockCatalogEntries[1] };
    if (problem === "duplicate-id") second.preset_id = mockCatalogEntries[0].preset_id;
    if (problem === "duplicate-definition") Object.assign(second, mockCatalogEntries[0], { preset_id: second.preset_id });
    if (problem === "missing-id") second.preset_id = "";
    mockLoadCatalog.mockReturnValue([mockCatalogEntries[0], second]);

    const response = await POST(makeRequest({ skipGifs: true }, { "x-admin-secret": "test-secret" }));

    expect(response.status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
