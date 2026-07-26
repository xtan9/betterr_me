"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FeedAction } from "@/lib/calendar/feed-types";

/**
 * Result of an inline calendar action.
 */
export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Hook that provides inline mutation functions for calendar feed items.
 *
 * Actions:
 * - toggle_task: POST /api/tasks/[id]/toggle
 * - toggle_habit: POST /api/habits/[id]/toggle with { date }
 * - navigate_workout: client-side navigation to /workouts/[id]
 *
 * @param onMutated Callback fired after a successful mutation so the caller can refetch data.
 */
export function useCalendarActions(onMutated?: () => void) {
  const router = useRouter();

  const toggleTask = useCallback(
    async (taskId: string): Promise<ActionResult> => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/toggle`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          return { success: false, error: body?.error || "Failed to toggle task" };
        }
        onMutated?.();
        return { success: true };
      } catch (err) {
        console.error("Failed to toggle task:", err);
        return { success: false, error: "Network error" };
      }
    },
    [onMutated],
  );

  const toggleHabit = useCallback(
    async (habitId: string, date: string): Promise<ActionResult> => {
      try {
        const res = await fetch(`/api/habits/${habitId}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          return { success: false, error: body?.error || "Failed to toggle habit" };
        }
        onMutated?.();
        return { success: true };
      } catch (err) {
        console.error("Failed to toggle habit:", err);
        return { success: false, error: "Network error" };
      }
    },
    [onMutated],
  );

  const navigateWorkout = useCallback(
    (workoutId: string) => {
      router.push(`/workouts/${workoutId}`);
    },
    [router],
  );

  /**
   * Dispatch an action by type. Extracts sourceId and date from the feed item's id.
   *
   * @param action The action type
   * @param sourceId The original item ID (task.id, habit.id, etc.)
   * @param date The date the item appears on (for habit toggle)
   */
  const dispatch = useCallback(
    async (action: FeedAction, sourceId: string, date?: string): Promise<ActionResult> => {
      switch (action) {
        case "toggle_task":
          return toggleTask(sourceId);
        case "toggle_habit":
          if (!date) return { success: false, error: "Date is required to toggle a habit" };
          return toggleHabit(sourceId, date);
        case "navigate_workout":
          navigateWorkout(sourceId);
          return { success: true };
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    },
    [toggleTask, toggleHabit, navigateWorkout],
  );

  return { dispatch, toggleTask, toggleHabit, navigateWorkout };
}
