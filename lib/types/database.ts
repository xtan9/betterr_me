/**
 * Database types for BetterR.me
 * Generated from supabase/migrations/20260129_initial_schema.sql
 */

// ============================================================================
// Core Types
// ============================================================================

export interface Profile {
  id: string; // UUID from auth.users
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  timezone: string;
  date_format: string;
  week_start_day: number;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
  };
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  style: CategoryStyle;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryStyle {
  color: string;
  icon: string;
  gradient?: string | null;
}

// ============================================================================
// Habit Types
// ============================================================================

export type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';
export type HabitType = 'boolean' | 'numeric' | 'duration' | 'checklist';

export interface Habit {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  config: HabitConfig;
  frequency: HabitFrequency;
  schedule_config: ScheduleConfig;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitConfig {
  type: HabitType;
  target_value: number | null;
  target_unit: string | null;
  difficulty_level: number;
  points_reward: number;
  style: {
    color: string;
    icon: string;
  };
}

export interface ScheduleConfig {
  days_of_week?: number[]; // 0=Sunday, 6=Saturday
  dates_of_month?: number[];
  custom_schedule?: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  logged_at: string; // TIMESTAMPTZ
  log_date: string; // DATE
  value: number | null;
  duration_minutes: number | null;
  notes: string | null;
  mood_rating: number | null; // 1-5
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Streak {
  id: string;
  habit_id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  streak_data: StreakData;
  created_at: string;
  updated_at: string;
}

export interface StreakData {
  weekly_stats?: {
    week: string;
    completions: number;
  }[];
  monthly_stats?: {
    month: string;
    completions: number;
  }[];
  milestones_reached?: string[];
}

export interface HabitReminder {
  id: string;
  habit_id: string;
  user_id: string;
  reminder_time: string; // TIME
  timezone: string;
  days_of_week: number[]; // 1=Monday, 7=Sunday
  is_active: boolean;
  notification_config: NotificationConfig;
  created_at: string;
  updated_at: string;
}

export interface NotificationConfig {
  methods: ('push' | 'email' | 'sms')[];
  sound?: string;
  vibration?: boolean;
  message_template?: string;
}

// ============================================================================
// Goals & Milestones
// ============================================================================

export type GoalType = 'habit_streak' | 'habit_count' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'failed' | 'paused';

export interface Goal {
  id: string;
  user_id: string;
  habit_id: string | null;
  title: string;
  description: string | null;
  goal_type: GoalType;
  target_value: number;
  current_value: number;
  unit: string | null;
  start_date: string;
  target_date: string;
  status: GoalStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Milestone {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_value: number;
  is_completed: boolean;
  completed_at: string | null;
  reward_points: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Journal Types
// ============================================================================

export type MoodRating = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: string; // DATE
  title: string | null;
  content: string;
  mood: MoodRating | null;
  tags: string[];
  is_private: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ReflectionPrompt {
  id: string;
  prompt_text: string;
  category: string;
  difficulty_level: number;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

// ============================================================================
// Gamification Types
// ============================================================================

export type RewardType = 'badge' | 'trophy' | 'achievement' | 'bonus_points';
export type AchievementType = 'streak' | 'milestone' | 'consistency' | 'challenge';

export interface Reward {
  id: string;
  title: string;
  description: string | null;
  reward_type: RewardType;
  points_value: number;
  icon_url: string | null;
  rarity: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string | null;
  achievement_type: AchievementType;
  icon_url: string | null;
  points_reward: number;
  criteria: AchievementCriteria;
  is_active: boolean;
  created_at: string;
}

export interface AchievementCriteria {
  type: string;
  target_value: number;
  conditions?: Record<string, unknown>;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  progress: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Database Row Insert/Update Types
// ============================================================================

export type InsertProfile = Omit<Profile, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProfile = Partial<InsertProfile>;

export type InsertCategory = Omit<Category, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCategory = Partial<InsertCategory>;

export type InsertHabit = Omit<Habit, 'id' | 'created_at' | 'updated_at'>;
export type UpdateHabit = Partial<InsertHabit>;

export type InsertHabitLog = Omit<HabitLog, 'id' | 'created_at'>;
export type UpdateHabitLog = Partial<InsertHabitLog>;

export type InsertGoal = Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'completed_at'>;
export type UpdateGoal = Partial<InsertGoal>;

export type InsertJournalEntry = Omit<JournalEntry, 'id' | 'created_at' | 'updated_at'>;
export type UpdateJournalEntry = Partial<InsertJournalEntry>;
