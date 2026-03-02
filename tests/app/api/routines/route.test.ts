import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetUserRoutines, mockCreateRoutine } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockGetUserRoutines: vi.fn(),
    mockCreateRoutine: vi.fn(),
  })
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getUserRoutines = mockGetUserRoutines;
    createRoutine = mockCreateRoutine;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "@/app/api/routines/route";

// --- Helpers ---

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/routines", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("GET /api/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns routines list", async () => {
    const routines = [
      { id: "r-1", name: "Push Day" },
      { id: "r-2", name: "Pull Day" },
    ];
    mockGetUserRoutines.mockResolvedValue(routines);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.routines).toEqual(routines);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetUserRoutines.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch routines");
  });
});

describe("POST /api/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("creates routine successfully (201)", async () => {
    const created = { id: "r-new", name: "Leg Day" };
    mockCreateRoutine.mockResolvedValue(created);

    const response = await POST(makePostRequest({ name: "Leg Day" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.routine).toEqual(created);
    expect(mockCreateRoutine).toHaveBeenCalledWith("user-123", {
      name: "Leg Day",
    });
  });

  it("rejects invalid body — missing name (400)", async () => {
    const response = await POST(makePostRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({ name: "Test" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockCreateRoutine.mockRejectedValue(new Error("DB error"));

    const response = await POST(makePostRequest({ name: "Leg Day" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create routine");
  });
});
