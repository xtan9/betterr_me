import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
const mockCatalogEntries = [
  {
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
    id: "ex-1",
    name: "Barbell Bench Press",
    muscle_group_primary: "chest",
    equipment: "barbell",
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
    eq: vi.fn().mockResolvedValue({ data: mockExistingExercises, error: null }),
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
    setupCatalog();
    setupAdminClient();

    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
  });

  it("updates existing exercises and inserts new ones from catalog", async () => {
    setupAuthenticatedAdmin();
    setupCatalog();
    setupAdminClient();
    mockDownloadAndStoreGif.mockResolvedValue("https://storage.example.com/0025.gif");

    const response = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // Barbell Bench Press matches existing → updated
    expect(data.updated).toBe(1);
    // Cable Crossover is new → created
    expect(data.created).toBe(1);
    expect(data.total).toBe(2);
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
        exercise_id: "ex-1",
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
      gifsDownloaded: expect.any(Number),
      gifsFailed: expect.any(Number),
      dryRun: false,
      skipGifs: false,
    });
  });
});
