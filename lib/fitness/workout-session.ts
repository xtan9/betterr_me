import type { WorkoutWithExercises } from "@/lib/db/types";

/** localStorage key for active workout session state */
export const STORAGE_KEY = "betterrme_active_workout";

/**
 * Save active workout state to localStorage for crash resilience.
 * Server is the source of truth; localStorage is a fallback for session recovery.
 * Silently fails if localStorage is unavailable (e.g., private browsing quota exceeded).
 */
export function saveWorkoutToStorage(workout: WorkoutWithExercises): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
  } catch {
    // Silent fail — server is source of truth
  }
}

/**
 * Clear active workout state from localStorage.
 * Called when a workout is completed or discarded.
 * Silently fails if localStorage is unavailable.
 */
export function clearWorkoutStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silent fail — server is source of truth
  }
}
