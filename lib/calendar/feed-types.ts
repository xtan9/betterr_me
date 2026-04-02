/**
 * Cross-domain calendar feed types.
 *
 * Each domain (events, tasks, habits, bills, workouts) is normalized
 * into CalendarFeedItem so the calendar can render them uniformly.
 */

/** Domain sources that can appear on the calendar. */
export type FeedDomain = "events" | "tasks" | "habits" | "bills" | "workouts";

/**
 * CSS variable names for each domain color.
 * These map to --calendar-{domain} / --calendar-{domain}-muted
 * defined in globals.css (both light and dark mode).
 */
export const DOMAIN_COLORS: Record<FeedDomain, { main: string; muted: string }> = {
  events:   { main: "--calendar-event",   muted: "--calendar-event-muted" },
  tasks:    { main: "--calendar-task",    muted: "--calendar-task-muted" },
  habits:   { main: "--calendar-habit",   muted: "--calendar-habit-muted" },
  bills:    { main: "--calendar-bill",    muted: "--calendar-bill-muted" },
  workouts: { main: "--calendar-workout", muted: "--calendar-workout-muted" },
};

/**
 * Inline action types that users can perform from the calendar.
 */
export type FeedAction =
  | "toggle_task"      // complete / uncomplete a task
  | "toggle_habit"     // mark / unmark habit for date
  | "dismiss_bill"     // mark bill as dismissed
  | "navigate_workout" // navigate to workout detail page
  ;

/**
 * A normalized calendar feed item. Every domain item is mapped to this
 * shape so the calendar components can render them uniformly.
 */
export interface CalendarFeedItem {
  /** Unique key: `{domain}:{original_id}` — ensures no collisions across domains. */
  id: string;
  /** Which domain this item came from. */
  domain: FeedDomain;
  /** Original ID in the source table (task.id, habit.id, etc.). */
  sourceId: string;
  /** Display title (task title, habit name, bill name, workout title). */
  title: string;
  /** Date this item appears on (YYYY-MM-DD). */
  date: string;
  /** Start time if applicable (HH:MM or HH:MM:SS), null for all-day items. */
  startTime: string | null;
  /** End time if applicable. */
  endTime: string | null;
  /** Whether this item spans the full day (no time slot). */
  allDay: boolean;
  /** Current completion/status state (e.g., task completed, habit done). */
  completed: boolean;
  /** Available inline actions for this item. */
  actions: FeedAction[];
  /** Optional metadata for rendering (e.g., bill amount, workout duration). */
  meta?: Record<string, unknown>;
}

/**
 * Extended calendar event type that carries domain information.
 * Used when feed items are converted to ExpandedCalendarEvent-compatible
 * objects for rendering in existing calendar view components.
 */
export interface DomainCalendarEvent {
  // Standard ExpandedCalendarEvent fields
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  location: string | null;
  color: string | null;
  category_id: string | null;
  is_recurring: boolean;
  recurrence_rule: null;
  end_type: null;
  end_date_recurrence: string | null;
  end_count: number | null;
  recurring_event_id: string | null;
  original_date: string | null;
  is_exception: boolean;
  created_at: string;
  updated_at: string;
  is_virtual: boolean;
  // Domain-specific extensions
  /** Which domain this event comes from (undefined for native calendar events). */
  _domain?: FeedDomain;
  /** Whether this item is completed (tasks/habits). */
  _completed?: boolean;
  /** Available inline actions. */
  _actions?: FeedAction[];
  /** Source ID in the original domain table. */
  _sourceId?: string;
  /** Extra metadata for display. */
  _meta?: Record<string, unknown>;
}
