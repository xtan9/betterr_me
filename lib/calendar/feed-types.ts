/**
 * Calendar feed types and domain color mapping.
 *
 * CalendarFeedItem is the unified type returned by /api/calendar/feed,
 * representing items from any domain (events, tasks, habits, bills, workouts).
 */

export type FeedSource = "event" | "task" | "habit" | "bill" | "workout";

export interface CalendarFeedItem {
  id: string;
  source: FeedSource;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM or null for all-day
  end_date: string; // YYYY-MM-DD
  end_time: string | null;
  color: string; // CSS color string
  is_all_day: boolean;
  meta: CalendarFeedMeta;
}

export interface CalendarFeedMeta {
  // Task-specific
  is_completed?: boolean;
  task_id?: string;
  priority?: number;
  // Habit-specific
  is_logged?: boolean;
  habit_id?: string;
  // Bill-specific
  is_paid?: boolean;
  amount_cents?: number;
  bill_id?: string;
  // Workout-specific
  workout_id?: string;
  duration_seconds?: number | null;
  // Event-specific
  location?: string;
  description?: string;
  event_id?: string;
  is_recurring?: boolean;
  is_virtual?: boolean;
}

/**
 * Domain color mapping using HSL values.
 * These match the design spec domain color coding.
 */
export const DOMAIN_COLORS: Record<FeedSource, string> = {
  event: "hsl(157 63% 45%)", // Teal (primary)
  task: "hsl(215 75% 55%)", // Blue (section-work)
  habit: "hsl(40 85% 55%)", // Amber (category-productivity)
  bill: "hsl(0 72% 55%)", // Red (priority-high)
  workout: "hsl(270 60% 55%)", // Purple
};
