import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/habits/[id]/toggle/route";

const { mockAuthenticateRequest, mockClient, mockComplete, mockUncomplete } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockClient: { from: vi.fn() },
  mockComplete: vi.fn(),
  mockUncomplete: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/habits/completion", () => ({
  createHabitCompletion: vi.fn(() => ({
    complete: mockComplete,
    uncomplete: mockUncomplete,
  })),
}));

const params = Promise.resolve({ id: "habit-1" });
const completedOutcome = {
  log: { id: "log-1", completed: true },
  completed: true,
  currentStreak: 7,
  bestStreak: 12,
  milestones: [{ status: "recorded", threshold: 7 }],
};

function request(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost:3000/api/habits/habit-1/toggle",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/habits/[id]/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: { type: "user", userId: "user-123", credential: "cookie" },
      client: mockClient,
    });
    mockComplete.mockResolvedValue(completedOutcome);
    mockUncomplete.mockResolvedValue({
      ...completedOutcome,
      log: { id: "log-1", completed: false },
      completed: false,
      currentStreak: 6,
      milestones: [],
    });
  });

  it("completes through the habit completion behavior", async () => {
    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockAuthenticateRequest).toHaveBeenCalledWith(expect.any(Request), {
      allowedCredentials: ["cookie"],
      requiredPermission: "write",
    });
    expect(mockComplete).toHaveBeenCalledWith({
      habitId: "habit-1",
      userId: "user-123",
      date: "2026-02-03",
    });
    expect(await response.json()).toEqual(completedOutcome);
  });

  it("uncompletes through the habit completion behavior", async () => {
    const response = await POST(
      request({ date: "2026-02-03", completed: false }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUncomplete).toHaveBeenCalledWith({
      habitId: "habit-1",
      userId: "user-123",
      date: "2026-02-03",
    });
    expect(body).toEqual({
      log: { id: "log-1", completed: false },
      completed: false,
      currentStreak: 6,
      bestStreak: 12,
      milestones: [],
    });
  });

  it("returns 400 for invalid date format", async () => {
    const response = await POST(
      request({ date: "not-a-date", completed: true }),
      { params },
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the desired completion state is absent", async () => {
    const response = await POST(request({ date: "2026-02-03" }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Required",
    });
  });

  it("returns 404 when the habit is not found", async () => {
    mockComplete.mockRejectedValue(new Error("Habit not found"));

    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      error: "Unauthorized",
      status: 401,
    });

    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(401);
  });

  it.each([
    ["Invalid credentials", 401, "Unauthorized", 401],
    ["Server misconfigured", 500, "Failed to toggle habit", 500],
  ])(
    "preserves the habit error contract for %s",
    async (authError, authStatus, expectedError, expectedStatus) => {
      mockAuthenticateRequest.mockResolvedValue({
        ok: false,
        error: authError,
        status: authStatus,
      });

      const response = await POST(
        request({ date: "2026-02-03", completed: true }),
        { params },
      );

      expect(response.status).toBe(expectedStatus);
      await expect(response.json()).resolves.toEqual({ error: expectedError });
    },
  );

  it("returns milestone failure as a successful completion outcome", async () => {
    mockComplete.mockResolvedValue({
      ...completedOutcome,
      milestones: [{ status: "failed", threshold: 7 }],
    });

    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...completedOutcome,
      milestones: [{ status: "failed", threshold: 7 }],
    });
  });
});
