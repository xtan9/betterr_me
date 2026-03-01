import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Hoisted mocks ---
const { mockMutate, mockFetch } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("swr", () => ({
  default: () => ({
    data: {
      workout: {
        id: "w-1",
        title: "Test Workout",
        status: "in_progress",
        started_at: "2026-02-28T10:00:00Z",
        exercises: [],
      },
    },
    error: undefined,
    isLoading: false,
    mutate: mockMutate,
  }),
}));

vi.mock("@/lib/fetcher", () => ({ fetcher: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/fitness/workout-session", () => ({
  saveWorkoutToStorage: vi.fn(),
  clearWorkoutStorage: vi.fn(),
}));

// Replace global fetch
const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

import { useActiveWorkout } from "@/lib/hooks/use-active-workout";

// --- Tests ---

describe("useActiveWorkout", () => {
  it("returns active workout from SWR data", () => {
    const { result } = renderHook(() => useActiveWorkout());

    expect(result.current.workout).not.toBeNull();
    expect(result.current.workout?.id).toBe("w-1");
    expect(result.current.isLoading).toBe(false);
  });

  it("startWorkout calls POST /api/workouts and mutates", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockMutate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.startWorkout("Morning Lift");
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/workouts", expect.objectContaining({
      method: "POST",
    }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it("finishWorkout calls PATCH with completed status", async () => {
    mockMutate.mockImplementation(async (fn: () => Promise<unknown>) => {
      if (typeof fn === "function") return fn();
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.finishWorkout();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("throwResponseError extracts API error messages", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "You already have an active workout" }),
    });

    const { result } = renderHook(() => useActiveWorkout());

    await expect(
      act(async () => {
        await result.current.actions.startWorkout();
      })
    ).rejects.toThrow("You already have an active workout");
  });
});

// Restore fetch
afterAll(() => {
  globalThis.fetch = originalFetch;
});
