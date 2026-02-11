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
  completed_at: string | null; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'category' | 'intention'> & {
  id?: string;
  category?: TaskCategory | null;
  intention?: string | null;
};

export type TaskUpdate = Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

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
  missed_scheduled_days: number; // consecutive scheduled-but-missed days before today
  previous_streak: number; // streak length before the current absence gap
}

export interface HabitWithLogs extends Habit {
  logs: HabitLog[];
}

// =============================================================================
// HABIT MILESTONES
// =============================================================================

export interface HabitMilestone {
  id: string; // UUID
  habit_id: string; // UUID
  user_id: string; // UUID
  milestone: number;
  achieved_at: string; // TIMESTAMPTZ
  created_at: string;
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface DashboardData {
  habits: HabitWithTodayStatus[];
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
}
