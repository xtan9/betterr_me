import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const { mockGetUser, mockGetRoutine, mockUpdateRoutine, mockDeleteRoutine } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetRoutine: vi.fn(),
    mockUpdateRoutine: vi.fn(),
    mockDeleteRoutine: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/routines", () => ({
  RoutinesDB: class {
    getRoutine = mockGetRoutine;
    updateRoutine = mockUpdateRoutine;
    deleteRoutine = mockDeleteRoutine;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, PATCH, DELETE } from "@/app/api/routines/[id]/route";

// --- Helpers ---

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/routines/r-1", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ id: "r-1" });

// --- Tests ---

describe("GET /api/routines/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("returns routine by id", async () => {
    const routine = { id: "r-1", name: "Push Day", exercises: [] };
    mockGetRoutine.mockResolvedValue(routine);

    const response = await GET(makeRequest("GET"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.routine).toEqual(routine);
  });

  it("returns 404 when not found", async () => {
    mockGetRoutine.mockResolvedValue(null);

    const response = await GET(makeRequest("GET"), { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine not found");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeRequest("GET"), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetRoutine.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeRequest("GET"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch routine");
  });
});

describe("PATCH /api/routines/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("updates routine successfully", async () => {
    const updated = { id: "r-1", name: "Updated Push Day" };
    mockUpdateRoutine.mockResolvedValue(updated);

    const response = await PATCH(
      makeRequest("PATCH", { name: "Updated Push Day" }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.routine.name).toBe("Updated Push Day");
  });

  it("returns 400 for empty body", async () => {
    const response = await PATCH(makeRequest("PATCH", {}), { params });
    expect(response.status).toBe(400);
  });

  it("returns 404 for not found (PGRST116)", async () => {
    mockUpdateRoutine.mockRejectedValue(
      Object.assign(new Error("No rows"), { code: "PGRST116" })
    );

    const response = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine not found");
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockUpdateRoutine.mockRejectedValue(new Error("DB error"));

    const response = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update routine");
  });
});

describe("DELETE /api/routines/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
  });

  it("deletes routine successfully", async () => {
    mockDeleteRoutine.mockResolvedValue(undefined);

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest("DELETE"), { params });
    expect(response.status).toBe(401);
  });

  it("returns 500 on unexpected error", async () => {
    mockDeleteRoutine.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(makeRequest("DELETE"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to delete routine");
  });
});
