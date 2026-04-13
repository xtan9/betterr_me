import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Hoisted mocks ---
const {
  mockMutate,
  mockFetch,
  swrData,
  saveWorkoutToStorage,
  clearWorkoutStorage,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockFetch: vi.fn(),
  swrData: { value: null as unknown },
  saveWorkoutToStorage: vi.fn(),
  clearWorkoutStorage: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (key: string) => {
    if (key === "/api/profile") {
      return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
    }
    return {
      data: swrData.value,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    };
  },
}));

vi.mock("@/lib/fetcher", () => ({ fetcher: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/fitness/workout-session", () => ({
  saveWorkoutToStorage,
  clearWorkoutStorage,
}));

const baseWorkout = {
  id: "w-1",
  title: "Test Workout",
  status: "in_progress",
  started_at: "2026-02-28T10:00:00Z",
  notes: null,
  exercises: [
    {
      id: "we-1",
      workout_id: "w-1",
      exercise_id: "ex-1",
      order: 0,
      notes: null,
      rest_timer_seconds: 60,
      sets: [
        { id: "s-1", workout_exercise_id: "we-1", reps: 10, weight: 50, is_completed: false },
        { id: "s-2", workout_exercise_id: "we-1", reps: 10, weight: 50, is_completed: false },
      ],
      exercise: { id: "ex-1", name: "Bench Press" },
      previousSets: [],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  swrData.value = { workout: structuredClone(baseWorkout) };
  // Default: mutate just invokes the mutation function if provided (not optimistic)
  mockMutate.mockImplementation(async (fn?: unknown) => {
    if (typeof fn === "function") {
      return (fn as () => Promise<unknown>)();
    }
    return undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import {
  useActiveWorkout,
  useWeightUnit,
} from "@/lib/hooks/use-active-workout";

describe("useActiveWorkout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  it("returns active workout from SWR data", () => {
    const { result } = renderHook(() => useActiveWorkout());
    expect(result.current.workout).not.toBeNull();
    expect(result.current.workout?.id).toBe("w-1");
    expect(result.current.isLoading).toBe(false);
  });

  it("returns null workout when data is missing", () => {
    swrData.value = undefined;
    const { result } = renderHook(() => useActiveWorkout());
    expect(result.current.workout).toBeNull();
  });

  it("startWorkout posts and revalidates", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.startWorkout("Morning");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockMutate).toHaveBeenCalled();
  });

  it("startWorkout throws with server error message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Active workout exists" }),
    });
    const { result } = renderHook(() => useActiveWorkout());

    await expect(
      act(async () => {
        await result.current.actions.startWorkout();
      })
    ).rejects.toThrow("Active workout exists");
  });

  it("startWorkout falls back to status error when no body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no json");
      },
    });
    const { result } = renderHook(() => useActiveWorkout());

    await expect(
      act(async () => {
        await result.current.actions.startWorkout();
      })
    ).rejects.toThrow(/Failed to start workout \(500\)/);
  });

  it("addExercise fetches revalidated workout and saves to storage", async () => {
    // 1) POST to exercises, 2) GET /api/workouts/active for revalidation
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workout: structuredClone(baseWorkout) }),
      });

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.addExercise("ex-2", 90);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1/exercises",
      expect.objectContaining({ method: "POST" })
    );
    expect(saveWorkoutToStorage).toHaveBeenCalled();
  });

  it("addExercise no-ops without an active workout", async () => {
    swrData.value = { workout: null };
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.addExercise("ex-2");
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("removeExercise deletes and persists optimistic state", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.removeExercise("we-1");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1/exercises/we-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(saveWorkoutToStorage).toHaveBeenCalled();
    // Optimistic state has empty exercises array
    const saved = saveWorkoutToStorage.mock.calls[0][0];
    expect(saved.exercises).toEqual([]);
  });

  it("addSet posts, appends returned set, and persists", async () => {
    const newSet = {
      id: "s-3",
      workout_exercise_id: "we-1",
      reps: 10,
      weight: 50,
      is_completed: false,
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ set: newSet }) });

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.addSet("we-1");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1/exercises/we-1/sets",
      expect.objectContaining({ method: "POST" })
    );
    const saved = saveWorkoutToStorage.mock.calls[0][0];
    expect(saved.exercises[0].sets).toHaveLength(3);
    expect(saved.exercises[0].sets[2]).toEqual(newSet);
  });

  it("updateSet patches with server-returned set", async () => {
    const updatedSet = {
      id: "s-1",
      workout_exercise_id: "we-1",
      reps: 12,
      weight: 55,
      is_completed: false,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ set: updatedSet }),
    });

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.updateSet("we-1", "s-1", {
        reps: 12,
        weight: 55,
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1/exercises/we-1/sets/s-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("deleteSet deletes and persists optimistic state", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.deleteSet("we-1", "s-1");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1/exercises/we-1/sets/s-1",
      expect.objectContaining({ method: "DELETE" })
    );
    const saved = saveWorkoutToStorage.mock.calls[0][0];
    expect(saved.exercises[0].sets.map((s: { id: string }) => s.id)).toEqual(["s-2"]);
  });

  it("completeSet marks set as completed via updateSet", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        set: { id: "s-1", is_completed: true, reps: 10, weight: 50 },
      }),
    });

    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.completeSet("we-1", "s-1");
    });

    // Most recently-called PATCH body should include is_completed: true
    const call = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/sets/s-1")
    )!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ is_completed: true });
  });

  it("updateExerciseNotes patches notes", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.updateExerciseNotes("we-1", "felt good");
    });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/workouts/w-1/exercises/we-1");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ notes: "felt good" });
  });

  it("updateExerciseRestTimer patches seconds", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.updateExerciseRestTimer("we-1", 120);
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({ rest_timer_seconds: 120 });
  });

  it("updateWorkout patches title", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.updateWorkout({ title: "Renamed" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("finishWorkout patches with completed status and clears storage", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.finishWorkout();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workouts/w-1",
      expect.objectContaining({ method: "PATCH" })
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({ status: "completed" });
    expect(clearWorkoutStorage).toHaveBeenCalled();
  });

  it("discardWorkout patches with discarded status", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.discardWorkout();
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({ status: "discarded" });
    expect(clearWorkoutStorage).toHaveBeenCalled();
  });

  it("no-op actions when no workout is present", async () => {
    swrData.value = { workout: null };
    const { result } = renderHook(() => useActiveWorkout());

    await act(async () => {
      await result.current.actions.removeExercise("we-1");
      await result.current.actions.addSet("we-1");
      await result.current.actions.updateSet("we-1", "s-1", { reps: 1 });
      await result.current.actions.deleteSet("we-1", "s-1");
      await result.current.actions.updateExerciseNotes("we-1", "x");
      await result.current.actions.updateExerciseRestTimer("we-1", 60);
      await result.current.actions.updateWorkout({ title: "x" });
      await result.current.actions.finishWorkout();
      await result.current.actions.discardWorkout();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useWeightUnit", () => {
  it("returns 'kg' when no preference is set", () => {
    const { result } = renderHook(() => useWeightUnit());
    expect(result.current).toBe("kg");
  });
});
