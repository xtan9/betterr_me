// Database types for betterr.me
// Mirrors the Supabase schema defined across supabase/migrations/

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
  theme: "system" | "light" | "dark";
}

export type ProfileInsert = Omit<
  Profile,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type ProfileUpdate = Partial<
  Omit<Profile, "id" | "email" | "created_at" | "updated_at">
>;

// =============================================================================
// CATEGORIES
// =============================================================================

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export type CategoryInsert = Omit<Category, 'id' | 'created_at'> & {
  id?: string;
};

export type CategoryUpdate = Partial<Pick<Category, 'name' | 'color' | 'icon' | 'sort_order'>>;

// =============================================================================
// TASKS
// =============================================================================

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TaskSection = 'personal' | 'work';

export interface Task {
  id: string; // UUID
  user_id: string; // UUID
  title: string;
  description: string | null;
  is_completed: boolean;
  priority: 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high
  category_id: string | null;
  due_date: string | null; // DATE (YYYY-MM-DD)
  due_time: string | null; // TIME (HH:MM:SS)
  completion_difficulty: 1 | 2 | 3 | null;
  completed_at: string | null; // TIMESTAMPTZ
  status: TaskStatus;
  section: TaskSection;
  sort_order: number;
  project_id: string | null; // UUID, link to projects table
  recurring_task_id: string | null; // UUID, link to recurring_tasks template
  is_exception: boolean; // true if this instance was individually modified
  original_date: string | null; // DATE (YYYY-MM-DD), the scheduled date from recurrence rule
  created_at: string;
  updated_at: string;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'category_id' | 'completion_difficulty' | 'project_id' | 'recurring_task_id' | 'is_exception' | 'original_date' | 'status' | 'section' | 'sort_order'> & {
  id?: string;
  category_id?: string | null;
  completion_difficulty?: 1 | 2 | 3 | null;
  project_id?: string | null;
  recurring_task_id?: string | null;
  is_exception?: boolean;
  original_date?: string | null;
  completed_at?: string | null;
  status?: TaskStatus;
  section?: TaskSection;
  sort_order?: number;
};

export type TaskUpdate = Partial<
  Omit<Task, "id" | "user_id" | "created_at" | "updated_at">
>;

// =============================================================================
// PROJECTS
// =============================================================================

export type ProjectSection = 'personal' | 'work';
export type ProjectStatus = 'active' | 'archived';

export interface Project {
  id: string; // UUID
  user_id: string; // UUID
  name: string;
  section: ProjectSection;
  color: string;
  status: ProjectStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'status' | 'sort_order'> & {
  id?: string;
  status?: ProjectStatus;
  sort_order?: number;
};

export type ProjectUpdate = Partial<Pick<Project, 'name' | 'section' | 'color' | 'status' | 'sort_order'>>;

// =============================================================================
// RECURRING TASKS
// =============================================================================

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type WeekPosition = "first" | "second" | "third" | "fourth" | "last";
export type EndType = "never" | "after_count" | "on_date";

interface BaseRule {
  interval: number; // e.g., every 2 weeks
}

export interface DailyRule extends BaseRule {
  frequency: "daily";
}

export interface WeeklyRule extends BaseRule {
  frequency: "weekly";
  days_of_week: number[]; // 0-6 (Sun=0)
}

export interface MonthlyByDateRule extends BaseRule {
  frequency: "monthly";
  day_of_month: number; // 1-31
}

export interface MonthlyByWeekdayRule extends BaseRule {
  frequency: "monthly";
  week_position: WeekPosition;
  day_of_week_monthly: number; // 0-6
}

export interface YearlyRule extends BaseRule {
  frequency: "yearly";
  month_of_year: number; // 1-12
  day_of_month: number; // 1-31
}

export type RecurrenceRule =
  | DailyRule
  | WeeklyRule
  | MonthlyByDateRule
  | MonthlyByWeekdayRule
  | YearlyRule;

export interface RecurringTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  category_id: string | null;
  due_time: string | null;
  recurrence_rule: RecurrenceRule;
  start_date: string; // DATE (YYYY-MM-DD)
  end_type: EndType;
  end_date: string | null;
  end_count: number | null;
  instances_generated: number;
  next_generate_date: string | null;
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
}

export type RecurringTaskInsert = Omit<
  RecurringTask,
  | "id"
  | "created_at"
  | "updated_at"
  | "instances_generated"
  | "next_generate_date"
> & {
  id?: string;
  instances_generated?: number;
  next_generate_date?: string | null;
};

export type RecurringTaskUpdate = Partial<
  Omit<
    RecurringTask,
    | "id"
    | "user_id"
    | "created_at"
    | "updated_at"
    | "instances_generated"
    | "next_generate_date"
  >
>;

// =============================================================================
// HELPER TYPES
// =============================================================================

export type Priority = Task["priority"];

export interface TaskFilters {
  is_completed?: boolean;
  priority?: Priority;
  due_date?: string; // YYYY-MM-DD
  has_due_date?: boolean;
  status?: TaskStatus;
  project_id?: string | null;
}

// =============================================================================
// HABITS
// =============================================================================

export type HabitStatus = "active" | "paused" | "archived";

// Discriminated union for habit frequency
export type HabitFrequency =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekly" }
  | { type: "times_per_week"; count: 2 | 3 }
  | { type: "custom"; days: number[] }; // 0=Sunday, 1=Monday, etc.

export interface Habit {
  id: string; // UUID
  user_id: string; // UUID
  name: string;
  description: string | null;
  category_id: string | null;
  frequency: HabitFrequency;
  status: HabitStatus;
  current_streak: number;
  best_streak: number;
  paused_at: string | null; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

export type HabitInsert = Omit<
  Habit,
  | "id"
  | "created_at"
  | "updated_at"
  | "current_streak"
  | "best_streak"
  | "paused_at"
> & {
  id?: string;
  current_streak?: number;
  best_streak?: number;
  paused_at?: string | null;
};

export type HabitUpdate = Partial<
  Omit<Habit, "id" | "user_id" | "created_at" | "updated_at">
>;

export interface HabitFilters {
  status?: HabitStatus;
  category_id?: string;
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

export type HabitLogInsert = Omit<
  HabitLog,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type HabitLogUpdate = Partial<Pick<HabitLog, "completed">>;

// =============================================================================
// HABIT WITH LOGS (for joined queries)
// =============================================================================

export interface HabitWithTodayStatus extends Habit {
  completed_today: boolean;
  monthly_completion_rate: number; // 0-100, percentage of days completed this month
}

/** Absence enrichment data — only meaningful in the dashboard context. */
export interface AbsenceData {
  missed_scheduled_periods: number; // consecutive missed periods (days or weeks) before today
  previous_streak: number; // streak length before the current absence gap
  absence_unit: "days" | "weeks"; // what missed_scheduled_periods counts
}

/** Default zero-absence data for SSR fallback and error paths. */
export const ZERO_ABSENCE: AbsenceData = {
  missed_scheduled_periods: 0,
  previous_streak: 0,
  absence_unit: "days",
};

/** Habit with absence enrichment, used only in dashboard responses. */
export type HabitWithAbsence = HabitWithTodayStatus & AbsenceData;

export interface HabitWithLogs extends Habit {
  logs: HabitLog[];
}

// =============================================================================
// HABIT MILESTONES
// =============================================================================

import type { MilestoneThreshold } from "@/lib/habits/milestones";

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
