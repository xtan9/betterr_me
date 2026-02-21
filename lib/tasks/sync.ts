import type { TaskUpdate, TaskInsert, TaskStatus, TaskSection } from '@/lib/db/types';

/**
 * Synchronize status <-> is_completed for task creation.
 * Ensures both fields are consistent regardless of which was provided.
 * Default status: 'todo', default section: 'personal'.
 */
export function syncTaskCreate(
  input: TaskInsert
): TaskInsert & { status: TaskStatus; section: TaskSection; is_completed: boolean; completed_at: string | null } {
  const status: TaskStatus = input.status ?? 'todo';
  const is_completed = status === 'done';
  const completed_at = is_completed ? new Date().toISOString() : null;

  return {
    ...input,
    status,
    section: input.section ?? 'personal',
    is_completed,
    completed_at,
  };
}

/**
 * Synchronize status <-> is_completed for task updates.
 * Handles three cases:
 * 1. Only status changed -> derive is_completed
 * 2. Only is_completed changed -> derive status
 * 3. Both changed -> status wins (explicit status is more specific)
 * If neither changed, returns input unchanged.
 */
export function syncTaskUpdate(updates: TaskUpdate): TaskUpdate {
  const result = { ...updates };

  const hasStatus = result.status !== undefined;
  const hasIsCompleted = result.is_completed !== undefined;

  if (hasStatus && !hasIsCompleted) {
    // Case 1: status changed, derive is_completed
    result.is_completed = result.status === 'done';
    result.completed_at = result.is_completed ? new Date().toISOString() : null;
  } else if (hasIsCompleted && !hasStatus) {
    // Case 2: is_completed changed, derive status
    if (result.is_completed) {
      result.status = 'done';
      result.completed_at = new Date().toISOString();
    } else {
      // Reopened -> always todo (locked decision: no previous-status tracking)
      result.status = 'todo';
      result.completed_at = null;
    }
  } else if (hasStatus && hasIsCompleted) {
    // Case 3: both provided, status wins
    result.is_completed = result.status === 'done';
    result.completed_at = result.is_completed ? new Date().toISOString() : null;
  }

  return result;
}
