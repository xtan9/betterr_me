import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { useCalendarActions } from "@/hooks/use-calendar-actions";

describe("useCalendarActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("toggleTask", () => {
    it("calls POST /api/tasks/[id]/toggle", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ task: { id: "task-1", is_completed: true } }),
      } as Response);

      const onMutated = vi.fn();
      const { result } = renderHook(() => useCalendarActions(onMutated));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.toggleTask("task-1");
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/tasks/task-1/toggle", {
        method: "POST",
      });
      expect(actionResult).toEqual({ success: true });
      expect(onMutated).toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Not found" }),
      } as Response);

      const { result } = renderHook(() => useCalendarActions());

      let actionResult;
      await act(async () => {
        actionResult = await result.current.toggleTask("task-1");
      });

      expect(actionResult).toEqual({
        success: false,
        error: "Not found",
      });
    });
  });

  describe("toggleHabit", () => {
    it("calls POST /api/habits/[id]/toggle with date in body", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ completed: true }),
      } as Response);

      const { result } = renderHook(() => useCalendarActions());

      await act(async () => {
        await result.current.toggleHabit("habit-1", "2026-04-01");
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/habits/habit-1/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-04-01" }),
      });
    });
  });

  describe("dismissBill", () => {
    it("calls PATCH /api/money/bills/[id] with dismissed status", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ bill: {} }),
      } as Response);

      const { result } = renderHook(() => useCalendarActions());

      await act(async () => {
        await result.current.dismissBill("bill-1");
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/money/bills/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: "dismissed" }),
      });
    });
  });

  describe("navigateWorkout", () => {
    it("pushes to workout detail page", () => {
      const { result } = renderHook(() => useCalendarActions());

      act(() => {
        result.current.navigateWorkout("workout-1");
      });

      expect(mockPush).toHaveBeenCalledWith("/workouts/workout-1");
    });
  });

  describe("dispatch", () => {
    it("routes toggle_task action", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() => useCalendarActions());

      await act(async () => {
        await result.current.dispatch("toggle_task", "task-1");
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/tasks/task-1/toggle", {
        method: "POST",
      });
    });

    it("routes toggle_habit action with date", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() => useCalendarActions());

      await act(async () => {
        await result.current.dispatch("toggle_habit", "habit-1", "2026-04-01");
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/habits/habit-1/toggle",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("routes navigate_workout action", async () => {
      const { result } = renderHook(() => useCalendarActions());

      await act(async () => {
        await result.current.dispatch("navigate_workout", "workout-1");
      });

      expect(mockPush).toHaveBeenCalledWith("/workouts/workout-1");
    });
  });
});
