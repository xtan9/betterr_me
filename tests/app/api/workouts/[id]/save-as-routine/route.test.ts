import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuthenticateRequest, mockSave } = vi.hoisted(
  () => ({
    mockAuthenticateRequest: vi.fn(),
    mockSave: vi.fn(),
  }),
);

const mockSupabase = {};

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/fitness/routine-workout-requests", () => ({
  createRoutineWorkoutRequests: () => ({ save: mockSave }),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/workouts/[id]/save-as-routine/route";

function makeRequest(workoutId: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/workouts/${workoutId}/save-as-routine`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

function callPOST(request: NextRequest, workoutId: string) {
  return POST(request, { params: Promise.resolve({ id: workoutId }) });
}

describe("POST /api/workouts/[id]/save-as-routine", () => {
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
    mockSave.mockResolvedValue({
      id: "routine-1",
      user_id: "user-123",
      name: "My Routine",
      exercises: [],
    });
  });

  it("delegates the complete conversion and returns its routine", async () => {
    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      routine: { id: "routine-1", name: "My Routine", exercises: [] },
    });
    expect(mockSave).toHaveBeenCalledWith(
      "user-123",
      "workout-1",
      "My Routine",
    );
  });

  it("returns 401 for an unauthenticated user", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });

    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(401);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("declares write access for cookie credentials", async () => {
    const request = makeRequest("workout-1", { name: "My Routine" });

    await callPOST(request, "workout-1");

    expect(mockAuthenticateRequest).toHaveBeenCalledWith(request, {
      allowedCredentials: ["cookie"],
      requiredPermission: "write",
    });
  });

  it("returns 404 when the workout does not exist", async () => {
    mockSave.mockResolvedValue(null);

    const response = await callPOST(
      makeRequest("missing", { name: "My Routine" }),
      "missing",
    );

    expect(response.status).toBe(404);
    expect(mockSave).toHaveBeenCalledWith("user-123", "missing", "My Routine");
  });

  it("returns one failure response when atomic conversion fails", async () => {
    mockSave.mockRejectedValue(new Error("transaction failed"));

    const response = await callPOST(
      makeRequest("workout-1", { name: "My Routine" }),
      "workout-1",
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to save workout as routine",
    });
  });
});
