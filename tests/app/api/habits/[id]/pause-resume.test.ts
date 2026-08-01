import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPauseHabit, mockResumeHabit } = vi.hoisted(() => ({
  mockPauseHabit: vi.fn(),
  mockResumeHabit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    pauseHabit = mockPauseHabit;
    resumeHabit = mockResumeHabit;
  },
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
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("pauses through the dedicated lifecycle operation", async () => {
    mockPauseHabit.mockResolvedValue({ id: "habit-1", status: "paused" });

    const response = await pausePOST(request("habit-1/pause"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      habit: { id: "habit-1", status: "paused" },
    });
    expect(mockPauseHabit).toHaveBeenCalledWith("habit-1", "user-123");
  });

  it("does not disclose a missing or cross-owner habit", async () => {
    mockPauseHabit.mockRejectedValue({ code: "PGRST116" });

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
});

describe("POST /api/habits/[id]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("resumes through the dedicated lifecycle operation", async () => {
    mockResumeHabit.mockResolvedValue({ id: "habit-1", status: "active" });

    const response = await resumePOST(request("habit-1/resume"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      habit: { id: "habit-1", status: "active" },
    });
    expect(mockResumeHabit).toHaveBeenCalledWith("habit-1", "user-123");
  });

  it("does not disclose a missing or cross-owner habit", async () => {
    mockResumeHabit.mockRejectedValue({ code: "PGRST116" });

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
});
