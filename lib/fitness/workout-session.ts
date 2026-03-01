import { z } from "zod";
import type { WorkoutWithExercises } from "@/lib/db/types";
import { log } from "@/lib/logger";

/**
 * Lenient schema for validating localStorage workout data on load.
 * Checks structural shape without requiring every nested field —
 * `.passthrough()` preserves extra fields from superset types.
 */
const storedWorkoutSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  exercises: z.array(
    z.object({
      id: z.string(),
      exercise: z.object({ id: z.string(), name: z.string() }).passthrough(),
      sets: z.array(z.object({ id: z.string() }).passthrough()),
    }).passthrough()
  ),
}).passthrough();


/** localStorage key for active workout session state */
export const STORAGE_KEY = "betterrme_active_workout";

/**
 * Save active workout state to localStorage for crash resilience.
 * Server is the source of truth; localStorage is a fallback for session recovery.
 * Accepts WorkoutWithExercises or any superset (e.g. ActiveWorkout with extra
 * fields like previousSets). Extra fields are stored harmlessly and ignored on load.
 * Silently fails if localStorage is unavailable (e.g., private browsing quota exceeded).
 */
export function saveWorkoutToStorage(workout: { id: string; exercises: unknown[] }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
  } catch (err) {
    log.warn("Failed to save workout to localStorage", { error: String(err) });
  }
}

/**
 * Load active workout state from localStorage.
 * Returns null if no workout is stored or if parsing fails.
 */
export function loadWorkoutFromStorage(): WorkoutWithExercises | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = storedWorkoutSchema.safeParse(parsed);
    if (!result.success) {
      log.warn("Invalid workout shape in localStorage, clearing", {
        errors: result.error.issues.map((i) => i.message),
      });
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return result.data as WorkoutWithExercises;
  } catch (err) {
    log.warn("Failed to load workout from localStorage", { error: String(err) });
    return null;
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
  } catch (err) {
    log.warn("Failed to clear workout from localStorage", { error: String(err) });
  }
}
