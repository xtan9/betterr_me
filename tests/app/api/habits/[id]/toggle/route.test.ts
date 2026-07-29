import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/habits/[id]/toggle/route";

const { mockComplete, mockUncomplete } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
  mockUncomplete: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

vi.mock("@/lib/habits/completion", () => ({
  createHabitCompletion: vi.fn(() => ({
    complete: mockComplete,
    uncomplete: mockUncomplete,
  })),
}));

import { createClient } from "@/lib/supabase/server";

const params = Promise.resolve({ id: "habit-1" });
const completedOutcome = {
  log: { id: "log-1", completed: true },
  completed: true,
  currentStreak: 7,
  bestStreak: 12,
  milestone: { status: "recorded", threshold: 7 },
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
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
      },
    } as never);
    mockComplete.mockResolvedValue(completedOutcome);
    mockUncomplete.mockResolvedValue({
      ...completedOutcome,
      log: { id: "log-1", completed: false },
      completed: false,
      currentStreak: 6,
      milestone: { status: "not_reached" },
    });
  });

  it("completes through the habit completion behavior", async () => {
    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(200);
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
    expect(body.completed).toBe(false);
    expect(body.currentStreak).toBe(6);
    expect(body.milestone).toEqual({ status: "not_reached" });
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
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as never);

    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(401);
  });

  it("returns milestone failure as a successful completion outcome", async () => {
    mockComplete.mockResolvedValue({
      ...completedOutcome,
      milestone: { status: "failed", threshold: 7 },
    });

    const response = await POST(
      request({ date: "2026-02-03", completed: true }),
      { params },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).milestone).toEqual({
      status: "failed",
      threshold: 7,
    });
  });
});
