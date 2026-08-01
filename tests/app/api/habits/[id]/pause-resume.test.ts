import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockPauseHabit,
  mockResumeHabit,
  mockCreateHabitWrites,
  mockToHabitResponse,
} = vi.hoisted(() => ({
  mockPauseHabit: vi.fn(),
  mockResumeHabit: vi.fn(),
  mockCreateHabitWrites: vi.fn(),
  mockToHabitResponse: vi.fn((habit: unknown) => habit),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

vi.mock("@/lib/habits/writes", () => ({
  createHabitWrites: mockCreateHabitWrites,
  toHabitResponse: mockToHabitResponse,
}));

import { createClient } from "@/lib/supabase/server";
import { POST as pausePOST } from "@/app/api/habits/[id]/pause/route";
import { POST as resumePOST } from "@/app/api/habits/[id]/resume/route";

const params = Promise.resolve({ id: "habit-1" });

function request(path: string) {
  return new NextRequest(`http://localhost/api/habits/${path}`, {
    method: "POST",
  });
}

describe("POST /api/habits/[id]/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHabitWrites.mockReturnValue({
      pause: mockPauseHabit,
      resume: mockResumeHabit,
    });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("pauses through the dedicated lifecycle operation", async () => {
    const habit = { id: "habit-1", status: "paused" };
    mockPauseHabit.mockResolvedValue({ type: "transitioned", habit });

    const response = await pausePOST(request("habit-1/pause"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      habit,
    });
    expect(mockCreateHabitWrites).toHaveBeenCalledWith(expect.anything());
    expect(mockPauseHabit).toHaveBeenCalledWith({
      habitId: "habit-1",
      userId: "user-123",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(habit);
  });

  it("does not disclose a missing or cross-owner habit", async () => {
    mockPauseHabit.mockResolvedValue({ type: "not-found" });

    const response = await pausePOST(request("habit-1/pause"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Habit not found" });
  });

  it("returns an unexpected lifecycle failure", async () => {
    mockPauseHabit.mockRejectedValue(new Error("pause failed"));

    const response = await pausePOST(request("habit-1/pause"), { params });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to pause habit" });
  });

  it("maps an invalid pause transition to a conflict without writing directly", async () => {
    mockPauseHabit.mockResolvedValue({
      type: "invalid-transition",
      action: "pause",
      currentStatus: "formed",
      message: "Habit cannot be paused from formed state",
    });

    const response = await pausePOST(request("habit-1/pause"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Habit cannot be paused from formed state",
    });
  });
});

describe("POST /api/habits/[id]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHabitWrites.mockReturnValue({
      pause: mockPauseHabit,
      resume: mockResumeHabit,
    });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("resumes through the dedicated lifecycle operation", async () => {
    const habit = { id: "habit-1", status: "active" };
    mockResumeHabit.mockResolvedValue({ type: "already-applied", habit });

    const response = await resumePOST(request("habit-1/resume"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      habit,
    });
    expect(mockResumeHabit).toHaveBeenCalledWith({
      habitId: "habit-1",
      userId: "user-123",
    });
  });

  it("does not disclose a missing or cross-owner habit", async () => {
    mockResumeHabit.mockResolvedValue({ type: "not-found" });

    const response = await resumePOST(request("habit-1/resume"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Habit not found" });
  });

  it("returns 401 without an authenticated user", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await resumePOST(request("habit-1/resume"), { params });

    expect(response.status).toBe(401);
    expect(mockResumeHabit).not.toHaveBeenCalled();
  });

  it("maps an invalid resume transition to a conflict", async () => {
    mockResumeHabit.mockResolvedValue({
      type: "invalid-transition",
      action: "resume",
      currentStatus: "formed",
      message: "Habit cannot be resumed from formed state",
    });

    const response = await resumePOST(request("habit-1/resume"), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Habit cannot be resumed from formed state",
    });
  });
});
