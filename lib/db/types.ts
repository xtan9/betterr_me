// Database types for betterr.me MVP
// Based on supabase/migrations/20260129_initial_schema.sql

// =============================================================================
// PROFILES
// =============================================================================

export interface Profile {
  id: string; // UUID
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  preferences: ProfilePreferences;
  created_at: string;
  updated_at: string;
}

export interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: 'system' | 'light' | 'dark';
}

export type ProfileInsert = Omit<Profile, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'email' | 'created_at' | 'updated_at'>>;

// =============================================================================
// TASKS
// =============================================================================

export type TaskCategory = 'work' | 'personal' | 'shopping' | 'other';

export interface Task {
  id: string; // UUID
  user_id: string; // UUID
  title: string;
  description: string | null;
  is_completed: boolean;
  priority: 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high
  category: TaskCategory | null;
  due_date: string | null; // DATE (YYYY-MM-DD)
  due_time: string | null; // TIME (HH:MM:SS)
  intention: string | null;
  completion_difficulty: 1 | 2 | 3 | null;
  completed_at: string | null; // TIMESTAMPTZ
  recurring_task_id: string | null; // UUID, link to recurring_tasks template
  is_exception: boolean; // true if this instance was individually modified
  original_date: string | null; // DATE (YYYY-MM-DD), the scheduled date from recurrence rule
  created_at: string;
  updated_at: string;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'category' | 'intention' | 'completion_difficulty' | 'recurring_task_id' | 'is_exception' | 'original_date'> & {
  id?: string;
  category?: TaskCategory | null;
  intention?: string | null;
  completion_difficulty?: 1 | 2 | 3 | null;
  recurring_task_id?: string | null;
  is_exception?: boolean;
  original_date?: string | null;
};

export type TaskUpdate = Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// =============================================================================
// RECURRING TASKS
// =============================================================================

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type WeekPosition = 'first' | 'second' | 'third' | 'fourth' | 'last';
export type EndType = 'never' | 'after_count' | 'on_date';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // e.g., every 2 weeks
  days_of_week?: number[]; // 0-6 (Sun=0), for weekly
  day_of_month?: number; // 1-31, for monthly by date
  week_position?: WeekPosition; // for monthly by weekday
  day_of_week_monthly?: number; // 0-6, for monthly by weekday
  month_of_year?: number; // 1-12, for yearly
}

export interface RecurringTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  intention: string | null;
  priority: 0 | 1 | 2 | 3;
  category: TaskCategory | null;
  due_time: string | null;
  recurrence_rule: RecurrenceRule;
  start_date: string; // DATE (YYYY-MM-DD)
  end_type: EndType;
  end_date: string | null;
  end_count: number | null;
  instances_generated: number;
  next_generate_date: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export type RecurringTaskInsert = Omit<RecurringTask, 'id' | 'created_at' | 'updated_at' | 'instances_generated' | 'next_generate_date'> & {
  id?: string;
  instances_generated?: number;
  next_generate_date?: string | null;
};

export type RecurringTaskUpdate = Partial<Omit<RecurringTask, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'instances_generated' | 'next_generate_date'>>;

// =============================================================================
// HELPER TYPES
// =============================================================================

export type Priority = Task['priority'];

export interface TaskFilters {
  is_completed?: boolean;
  priority?: Priority;
  due_date?: string; // YYYY-MM-DD
  has_due_date?: boolean;
}

// =============================================================================
// HABITS
// =============================================================================

export type HabitCategory = 'health' | 'wellness' | 'learning' | 'productivity' | 'other';

export type HabitStatus = 'active' | 'paused' | 'archived';

// Discriminated union for habit frequency
export type HabitFrequency =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly' }
  | { type: 'times_per_week'; count: 2 | 3 }
  | { type: 'custom'; days: number[] }; // 0=Sunday, 1=Monday, etc.

export interface Habit {
  id: string; // UUID
  user_id: string; // UUID
  name: string;
  description: string | null;
  category: HabitCategory | null;
  frequency: HabitFrequency;
  status: HabitStatus;
  current_streak: number;
  best_streak: number;
  paused_at: string | null; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

export type HabitInsert = Omit<Habit, 'id' | 'created_at' | 'updated_at' | 'current_streak' | 'best_streak' | 'paused_at'> & {
  id?: string;
  current_streak?: number;
  best_streak?: number;
  paused_at?: string | null;
};

export type HabitUpdate = Partial<Omit<Habit, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface HabitFilters {
  status?: HabitStatus;
  category?: HabitCategory;
}

// =============================================================================
// HABIT LOGS
// =============================================================================

export interface HabitLog {
  id: string; // UUID
  habit_id: string; // UUID
  user_id: string; // UUID
  logged_date: string; // DATE (YYYY-MM-DD)
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export type HabitLogInsert = Omit<HabitLog, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type HabitLogUpdate = Partial<Pick<HabitLog, 'completed'>>;

// =============================================================================
// HABIT WITH LOGS (for joined queries)
// =============================================================================

export interface HabitWithTodayStatus extends Habit {
  completed_today: boolean;
  monthly_completion_rate: number; // 0-100, percentage of days completed this month
}

/** Absence enrichment data — only meaningful in the dashboard context. */
export interface AbsenceData {
  missed_scheduled_days: number; // consecutive scheduled-but-missed days before today
  previous_streak: number; // streak length before the current absence gap
}

/** Habit with absence enrichment, used only in dashboard responses. */
export type HabitWithAbsence = HabitWithTodayStatus & AbsenceData;

export interface HabitWithLogs extends Habit {
  logs: HabitLog[];
}

// =============================================================================
// HABIT MILESTONES
// =============================================================================

import type { MilestoneThreshold } from '@/lib/habits/milestones';

export interface HabitMilestone {
  id: string; // UUID
  habit_id: string; // UUID
  user_id: string; // UUID
  milestone: MilestoneThreshold;
  achieved_at: string; // TIMESTAMPTZ
  created_at: string;
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface DashboardData {
  habits: HabitWithAbsence[];
  tasks_today: Task[];
  tasks_tomorrow: Task[];
  milestones_today: HabitMilestone[];
  stats: {
    total_habits: number;
    completed_today: number;
    current_best_streak: number;
    total_tasks: number;
    tasks_due_today: number;
    tasks_completed_today: number;
  };
  /** Non-fatal warnings about degraded data (omitted when empty) */
  _warnings?: string[];
}
