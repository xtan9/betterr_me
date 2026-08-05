"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { setHabitCompletion } from "@/lib/hooks/use-habit-toggle";

/**
 * Result of an inline calendar action.
 */
export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Hook that provides inline mutation functions for Calendar Overlay items.
 *
 * Typed operations:
 * - toggleTask: POST /api/tasks/[id]/toggle
 * - toggleHabit: POST /api/habits/[id]/toggle with { date, completed }
 * - navigateWorkout: client-side navigation to /workouts/[id]
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
    async (habitId: string, date: string, completed: boolean): Promise<ActionResult> => {
      try {
        await setHabitCompletion(habitId, completed, date);
        onMutated?.();
        return { success: true };
      } catch (err) {
        console.error("Failed to toggle habit:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        };
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

  return { toggleTask, toggleHabit, navigateWorkout };
}
