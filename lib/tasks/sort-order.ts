/**
 * Sort order utilities for float-based task ordering.
 * Uses large gaps (2^16) between items for ample bisection headroom.
 * IEEE 754 doubles give ~52 bisections before precision loss.
 */

export const SORT_ORDER_GAP = 65536.0;

/**
 * Get the sort_order value for a new task at the bottom of its column.
 * @param currentMax - The current maximum sort_order value, or null/0 if no tasks exist.
 * @returns The sort_order value for the new task.
 */
export function getBottomSortOrder(currentMax: number | null): number {
  return (currentMax ?? 0) + SORT_ORDER_GAP;
}

/**
 * Get the sort_order value for inserting between two items.
 * Used for drag-and-drop reordering.
 * @param above - The sort_order of the item above the insertion point.
 * @param below - The sort_order of the item below the insertion point.
 * @returns The midpoint sort_order value.
 */
export function getSortOrderBetween(above: number, below: number): number {
  return (above + below) / 2;
}
