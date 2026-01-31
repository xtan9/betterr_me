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
  timezone: string;
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

export interface Task {
  id: string; // UUID
  user_id: string; // UUID
  title: string;
  description: string | null;
  is_completed: boolean;
  priority: 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high
  due_date: string | null; // DATE (YYYY-MM-DD)
  due_time: string | null; // TIME (HH:MM:SS)
  completed_at: string | null; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at'> & {
  id?: string;
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
