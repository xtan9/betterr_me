import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---
const {
  mockAuthenticateRequest,
  mockStartWorkout,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockStartWorkout: vi.fn(),
}));

const mockSupabase = {};

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({ start: mockStartWorkout })),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/routines/[id]/start/route";

function callPOST(routineId: string) {
  const request = new NextRequest(
    `http://localhost:3000/api/routines/${routineId}/start`,
    { method: "POST" }
  );
  return POST(request, { params: Promise.resolve({ id: routineId }) });
}

// --- Tests ---

describe("POST /api/routines/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      outcome: "authenticated",
      principal: { type: "user", userId: "user-123", credential: "cookie" },
      permissions: ["read", "write"],
      requiredPermission: "write",
      client: mockSupabase,
    });
    mockStartWorkout.mockResolvedValue({
      type: "started",
      workout: {
        id: "w-1",
        user_id: "user-123",
        title: "Push Day",
        status: "in_progress",
        exercises: [],
      },
    });
  });

  it("creates workout from routine (201)", async () => {
    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.workout).toBeDefined();
    expect(data.workout.id).toBe("w-1");
    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "routine", routineId: "routine-1" },
    });
  });

  it("returns 401 for unauthenticated user", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });

    const response = await callPOST("routine-1");
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("declares write access for cookie credentials", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/routines/routine-1/start",
      { method: "POST" },
    );

    await POST(request, { params: Promise.resolve({ id: "routine-1" }) });

    expect(mockAuthenticateRequest).toHaveBeenCalledWith(request, {
      allowedCredentials: ["cookie"],
      requiredPermission: "write",
    });
  });

  it("returns 404 for non-existent routine", async () => {
    mockStartWorkout.mockResolvedValue({ type: "not-found" });

    const response = await callPOST("nonexistent");
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Routine not found");
  });

  it("returns 409 for the expected active-workout conflict", async () => {
    mockStartWorkout.mockResolvedValue({ type: "conflict" });

    const response = await callPOST("routine-1");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active workout",
    });
  });

  it("returns 400 when the shared conversion rejects source data", async () => {
    mockStartWorkout.mockResolvedValue({
      type: "invalid-source",
      message: "Unsupported exercise type",
    });

    const response = await callPOST("routine-1");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported exercise type",
    });
  });

  it("returns 500 for an unexpected shared mutation failure", async () => {
    mockStartWorkout.mockRejectedValue(new Error("database unavailable"));

    const response = await callPOST("routine-1");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to start workout from routine",
    });
  });
});
