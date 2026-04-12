// Database types for betterr.me
// Mirrors the Supabase schema defined across supabase/migrations/

// =============================================================================
// PROFILES
// =============================================================================

export type ProfileRole = 'user' | 'admin';

export interface Profile {
  id: string; // UUID
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  email_notifications_enabled: boolean;
  role: ProfileRole;
  preferences: ProfilePreferences;
  created_at: string;
  updated_at: string;
}

export interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs";
  quiet_hours_start?: string | null;  // HH:MM format
  quiet_hours_end?: string | null;    // HH:MM format
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

export type HabitStatus = "active" | "paused" | "formed";

// Discriminated union for habit frequency
export type HabitFrequency =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekly" }
  | { type: "times_per_week"; count: 2 | 3 }
  | { type: "custom"; days: number[] }; // 0=Sunday, 1=Monday, etc.

// TODO: Consider a discriminated union on `status` to encode the invariant that
// formed habits have non-null graduated_at/graduated_streak.
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
  graduated_at: string | null;
  graduated_streak: number | null;
  nudge_dismissed_at: string | null;
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
  | "graduated_at"
  | "graduated_streak"
  | "nudge_dismissed_at"
> & {
  id?: string;
  current_streak?: number;
  best_streak?: number;
  paused_at?: string | null;
  // graduation fields intentionally omitted — set via graduateHabit/reactivateHabit only
};

export type HabitUpdate = Partial<
  Omit<Habit, "id" | "user_id" | "created_at" | "updated_at">
>;

export interface HabitFilters {
  status?: HabitStatus;
  category_id?: string;
}

export interface HabitGraduation {
  id: string;
  habit_id: string;
  user_id: string;
  graduated_at: string;
  graduated_streak: number;
  reactivated_at: string | null;
  created_at: string;
}

export type HabitGraduationInsert = Omit<HabitGraduation, "id" | "created_at" | "reactivated_at"> & {
  id?: string;
  reactivated_at?: string | null;
};

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
  graduation_eligible: boolean;
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
    last_workout_at: string | null;
    week_workout_count: number;
  };
  /** Non-fatal warnings about degraded data (omitted when empty) */
  _warnings?: string[];
}

// =============================================================================
// JOURNAL ENTRIES
// =============================================================================

export type MoodRating = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: string; // UUID
  user_id: string; // UUID
  entry_date: string; // DATE (YYYY-MM-DD)
  title: string;
  content: Record<string, unknown>; // Tiptap JSON
  mood: MoodRating | null; // 1-5 or null
  word_count: number;
  tags: string[]; // text[]
  prompt_key: string | null;
  created_at: string;
  updated_at: string;
}

export type JournalEntryInsert = Omit<
  JournalEntry,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type JournalEntryUpdate = Partial<
  Omit<JournalEntry, "id" | "user_id" | "entry_date" | "created_at" | "updated_at">
>;

/** Lightweight calendar view data */
export interface JournalCalendarDay {
  entry_date: string;
  mood: MoodRating | null;
  title: string;
}

/** On This Day entry used by widget and full page */
export interface OnThisDayEntry {
  id: string;
  entry_date: string;
  mood: MoodRating | null;
  title: string;
  content: Record<string, unknown>;
  word_count: number;
  period: string;
}

// =============================================================================
// JOURNAL ENTRY LINKS
// =============================================================================

export type JournalLinkType = "habit" | "task" | "project";

export interface JournalEntryLink {
  id: string; // UUID
  entry_id: string; // UUID
  link_type: JournalLinkType;
  link_id: string; // UUID
  created_at: string;
}

export type JournalEntryLinkInsert = Omit<
  JournalEntryLink,
  "id" | "created_at"
> & {
  id?: string;
};

// =============================================================================
// FITNESS: EXERCISES
// =============================================================================

import {
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  EQUIPMENT,
  SET_TYPES,
  WORKOUT_STATUSES,
  WEIGHT_UNITS,
} from "@/lib/constants/enums";

export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];

export interface ExerciseMedia {
  gif_url: string | null;
  thumbnail_url: string | null;
  instructions: string[] | null;
  alternative_names: string[] | null;
  exercisedb_id: string | null;
  media_status: "active" | "broken" | "fallback";
}

export interface Exercise {
  id: string;
  user_id: string | null; // NULL for preset exercises
  name: string;
  muscle_group_primary: MuscleGroup;
  muscle_groups_secondary: MuscleGroup[];
  equipment: Equipment;
  exercise_type: ExerciseType;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
  exercise_media: ExerciseMedia | null;
}

export type ExerciseInsert = Omit<
  Exercise,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type ExerciseUpdate = Partial<
  Omit<Exercise, "id" | "user_id" | "created_at" | "updated_at" | "is_custom">
>;

export interface ExerciseFilters {
  muscle_group?: MuscleGroup;
  equipment?: Equipment;
  exercise_type?: ExerciseType;
  is_custom?: boolean;
  search?: string;
}

// =============================================================================
// FITNESS: WORKOUTS
// =============================================================================

export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

/**
 * A workout session.
 *
 * Status invariants:
 * - 'in_progress': completed_at is null, duration_seconds is null. Only one per user (DB constraint).
 * - 'completed': completed_at and duration_seconds are set on transition.
 * - 'discarded': completed_at may remain null.
 */
export interface Workout {
  id: string;
  user_id: string;
  title: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: WorkoutStatus;
  notes: string | null;
  routine_id: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkoutInsert = Omit<
  Workout,
  "id" | "created_at" | "updated_at" | "completed_at" | "duration_seconds"
> & {
  id?: string;
};

export type WorkoutUpdate = Partial<
  Omit<Workout, "id" | "user_id" | "created_at" | "updated_at" | "completed_at" | "duration_seconds">
>;

// =============================================================================
// FITNESS: WORKOUT EXERCISES
// =============================================================================

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  sort_order: number;
  notes: string | null;
  rest_timer_seconds: number;
  created_at: string;
}

export type WorkoutExerciseInsert = Omit<
  WorkoutExercise,
  "id" | "created_at"
> & {
  id?: string;
};

// Joined type for display
export interface WorkoutExerciseWithDetails extends WorkoutExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
}

// =============================================================================
// FITNESS: WORKOUT SETS
// =============================================================================

export type SetType = (typeof SET_TYPES)[number];

/**
 * A single set within a workout exercise.
 *
 * Nullable measurement fields (weight_kg, reps, duration_seconds, distance_meters)
 * are intentional: EXERCISE_FIELD_MAP determines which fields are relevant for each
 * exercise type. Fields irrelevant to the exercise type remain null.
 */
export interface WorkoutSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  is_completed: boolean;
  rpe: number | null; // 1-10
  created_at: string;
  updated_at: string;
}

export type WorkoutSetInsert = Omit<
  WorkoutSet,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type WorkoutSetUpdate = Partial<
  Omit<WorkoutSet, "id" | "workout_exercise_id" | "created_at" | "updated_at">
>;

// =============================================================================
// FITNESS: ROUTINES
// =============================================================================

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  last_performed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RoutineInsert = Omit<
  Routine,
  "id" | "created_at" | "updated_at" | "last_performed_at"
> & {
  id?: string;
  last_performed_at?: string | null;
};

export type RoutineUpdate = Partial<
  Omit<Routine, "id" | "user_id" | "created_at" | "updated_at">
>;

export interface RoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_seconds: number | null;
  rest_timer_seconds: number;
  notes: string | null;
  created_at: string;
}

export type RoutineExerciseInsert = Omit<
  RoutineExercise,
  "id" | "created_at"
> & {
  id?: string;
};

// Joined type for display
export interface RoutineWithExercises extends Routine {
  exercises: (RoutineExercise & { exercise: Exercise })[];
}

// =============================================================================
// FITNESS: AGGREGATED TYPES
// =============================================================================

/** Full workout with nested exercises and sets, used by workout detail view */
export interface WorkoutWithExercises extends Workout {
  exercises: WorkoutExerciseWithDetails[];
}

/** Personal record for a specific exercise */
export interface PersonalRecord {
  exercise_id: string;
  best_weight_kg: number | null;
  best_reps: number | null;
  best_volume: number | null; // weight * reps
  best_duration_seconds: number | null;
  achieved_at: string | null;
}

/** Exercise history entry for progression charts */
export interface ExerciseHistoryEntry {
  started_at: string; // raw ISO timestamp — client formats to local date
  workout_id: string;
  best_set_weight_kg: number | null;
  best_set_reps: number | null;
  total_volume: number | null; // sum(weight * reps) across all sets
  total_sets: number;
}

/** Weight unit type */
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

// =============================================================================
// HOUSEHOLDS
// =============================================================================

export interface Household {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface HouseholdMemberWithProfile extends HouseholdMember {
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface HouseholdInvitation {
  id: string;
  household_id: string;
  invited_by: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
}

// =============================================================================
// BANK CONNECTIONS
// =============================================================================

export interface BankConnection {
  id: string;
  household_id: string;
  provider: string;
  status: "pending" | "connected" | "error" | "disconnected";
  plaid_item_id: string | null;
  institution_id: string | null;
  institution_name: string | null;
  vault_secret_name: string | null;
  sync_cursor: string | null;
  last_synced_at: string | null;
  error_code: string | null;
  error_message: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BankConnectionInsert = Omit<
  BankConnection,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

// =============================================================================
// MONEY ACCOUNTS
// =============================================================================

/**
 * Named MoneyAccount to avoid collision with JS global Account / auth Account.
 * Maps to the `accounts` table in the database.
 */
export type AccountType = "checking" | "savings" | "credit" | "investment" | "loan" | "other";
export type AccountVisibility = "mine" | "ours" | "hidden";
export type ViewMode = "mine" | "household";

export interface MoneyAccount {
  id: string;
  household_id: string;
  bank_connection_id: string | null;
  name: string;
  account_type: AccountType;
  balance_cents: number;
  currency: "USD";
  is_hidden: boolean;
  owner_id: string | null;
  visibility: AccountVisibility;
  shared_since: string | null;
  plaid_account_id: string | null;
  official_name: string | null;
  mask: string | null;
  subtype: string | null;
  created_at: string;
  updated_at: string;
}

export type MoneyAccountInsert = Omit<
  MoneyAccount,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

// =============================================================================
// TRANSACTIONS
// =============================================================================

export interface Transaction {
  id: string;
  household_id: string;
  account_id: string;
  amount_cents: number;
  description: string;
  merchant_name: string | null;
  category: string | null;
  category_id: string | null;
  notes: string | null;
  transaction_date: string;
  is_pending: boolean;
  is_hidden_from_household: boolean;
  is_shared_to_household: boolean;
  plaid_transaction_id: string | null;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  source: "plaid" | "manual";
  created_at: string;
  updated_at: string;
}

export type TransactionInsert = Omit<
  Transaction,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  category_id?: string | null;
  notes?: string | null;
};

// =============================================================================
// MONEY CATEGORIES (for transaction classification)
// =============================================================================

/** Money category (system defaults have household_id = null) */
export interface MoneyCategory {
  id: string;
  household_id: string | null;
  name: string;
  icon: string | null;
  is_system: boolean;
  color: string | null;
  display_name: string | null;
  created_at: string;
}

export type MoneyCategoryInsert = Omit<MoneyCategory, "id" | "created_at"> & {
  id?: string;
};

// =============================================================================
// MERCHANT CATEGORY RULES
// =============================================================================

export interface MerchantCategoryRule {
  id: string;
  household_id: string;
  merchant_name: string;
  merchant_name_lower: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

export type MerchantCategoryRuleInsert = Omit<
  MerchantCategoryRule,
  "id" | "created_at" | "updated_at"
>;

// =============================================================================
// TRANSACTION SPLITS
// =============================================================================

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  category_id: string;
  amount_cents: number;
  notes: string | null;
  created_at: string;
}

export type TransactionSplitInsert = Omit<TransactionSplit, "id" | "created_at">;

// =============================================================================
// HIDDEN CATEGORIES
// =============================================================================

export interface HiddenCategory {
  household_id: string;
  category_id: string;
}

// =============================================================================
// BUDGETS
// =============================================================================

export interface Budget {
  id: string;
  household_id: string;
  month: string; // '2026-02-01'
  total_cents: number;
  rollover_enabled: boolean;
  owner_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  allocated_cents: number;
  rollover_cents: number;
  created_at: string;
}

export interface BudgetCategoryWithSpending extends BudgetCategory {
  spent_cents: number;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
}

export interface BudgetWithCategories extends Budget {
  categories: BudgetCategoryWithSpending[];
  total_allocated_cents: number;
  total_spent_cents: number;
}

// =============================================================================
// RECURRING BILLS
// =============================================================================

export type BillFrequency = "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "ANNUALLY";
export type BillUserStatus = "auto" | "confirmed" | "dismissed";
export type BillSource = "plaid" | "manual";

export interface RecurringBill {
  id: string;
  household_id: string;
  plaid_stream_id: string | null;
  account_id: string | null;
  name: string;
  description: string | null;
  amount_cents: number;
  frequency: BillFrequency;
  next_due_date: string | null;
  user_status: BillUserStatus;
  is_active: boolean;
  plaid_status: string | null;
  category_primary: string | null;
  previous_amount_cents: number | null;
  source: BillSource;
  created_at: string;
  updated_at: string;
}

export type RecurringBillInsert = Omit<
  RecurringBill,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type RecurringBillUpdate = Partial<
  Omit<RecurringBill, "id" | "household_id" | "created_at" | "updated_at">
>;

// =============================================================================
// SAVINGS GOALS
// =============================================================================

export type GoalFundingType = "manual" | "linked";
export type GoalStatus = "active" | "completed" | "archived";

export interface SavingsGoal {
  id: string;
  household_id: string;
  name: string;
  target_cents: number;
  current_cents: number;
  deadline: string | null;
  funding_type: GoalFundingType;
  linked_account_id: string | null;
  icon: string | null;
  color: string | null;
  status: GoalStatus;
  owner_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export type SavingsGoalInsert = Omit<
  SavingsGoal,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type SavingsGoalUpdate = Partial<
  Omit<SavingsGoal, "id" | "household_id" | "current_cents" | "created_at" | "updated_at">
>;

// =============================================================================
// GOAL CONTRIBUTIONS
// =============================================================================

export interface GoalContribution {
  id: string;
  goal_id: string;
  amount_cents: number;
  note: string | null;
  contributed_at: string;
}

export type GoalContributionInsert = Omit<
  GoalContribution,
  "id" | "contributed_at"
> & {
  id?: string;
  contributed_at?: string;
};

// =============================================================================
// NET WORTH SNAPSHOTS
// =============================================================================

export interface NetWorthSnapshot {
  id: string;
  household_id: string;
  snapshot_date: string;
  total_cents: number;
  assets_cents: number;
  liabilities_cents: number;
  created_at: string;
}

// =============================================================================
// MANUAL ASSETS
// =============================================================================

export type ManualAssetType = "property" | "vehicle" | "investment" | "other";

export interface ManualAsset {
  id: string;
  household_id: string;
  name: string;
  value_cents: number;
  asset_type: ManualAssetType;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ManualAssetInsert = Omit<
  ManualAsset,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type ManualAssetUpdate = Partial<
  Omit<ManualAsset, "id" | "household_id" | "created_at" | "updated_at">
>;

// =============================================================================
// GOAL PROJECTIONS (consolidated from goal-card.tsx, use-goals.ts, goals/route.ts)
// =============================================================================

export type StatusColor = "green" | "yellow" | "red";

export interface GoalWithProjection extends SavingsGoal {
  projected_date: string | null;
  monthly_rate_cents: number;
  status_color: StatusColor;
}

// =============================================================================
// DISMISSED INSIGHTS
// =============================================================================

export interface DismissedInsight {
  id: string;
  household_id: string;
  insight_id: string;
  dismissed_at: string;
}

// =============================================================================
// CONFIRMED INCOME PATTERNS
// =============================================================================

export type IncomeFrequency = "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";

export interface ConfirmedIncomePattern {
  id: string;
  household_id: string;
  merchant_name: string;
  amount_cents: number;
  frequency: IncomeFrequency;
  next_expected_date: string;
  confirmed_at: string;
  needs_reconfirmation: boolean;
}

// =============================================================================
// INSIGHTS (Phase 24 - Dashboard & AI)
// =============================================================================

export type InsightType =
  | "spending_anomaly"
  | "subscription_increase"
  | "goal_progress"
  | "low_balance_warning"
  | "bill_upcoming";

export type InsightPage = "dashboard" | "budgets" | "bills" | "goals";

export type InsightSeverity = "info" | "attention" | "positive";

export interface Insight {
  id: string;
  type: InsightType;
  page: InsightPage;
  severity: InsightSeverity;
  data: Record<string, string | number>;
}

// =============================================================================
// DETECTED INCOME (from income pattern detection algorithm)
// =============================================================================

export interface DetectedIncome {
  merchant_name: string;
  amount_cents: number;
  frequency: string;
  confidence: number;
  last_occurrence: string;
  next_predicted: string;
}

// =============================================================================
// DAILY BALANCE (from cash flow projection)
// =============================================================================

export interface DailyBalance {
  date: string;
  projected_balance_cents: number;
  has_income: boolean;
  bill_total_cents: number;
}

// =============================================================================
// API KEYS
// =============================================================================

export type ApiKeyPermissions = 'read' | 'read_write';

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: ApiKeyPermissions;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type ApiKeyInsert = Omit<ApiKey, 'id' | 'created_at' | 'last_used_at' | 'expires_at'> & {
  id?: string;
  expires_at?: string | null;
};

// What's returned to the client (no hash)
export type ApiKeyPublic = Omit<ApiKey, 'key_hash'>;

// =============================================================================
// CALENDAR EVENTS
// =============================================================================

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string;       // DATE (YYYY-MM-DD)
  start_time: string | null; // TIME (HH:MM:SS), null = all-day
  end_date: string;          // DATE (YYYY-MM-DD)
  end_time: string | null;
  location: string | null;
  color: string | null;
  category_id: string | null;
  is_recurring: boolean;
  recurrence_rule: RecurrenceRule | null;
  end_type: EndType | null;
  end_date_recurrence: string | null;
  end_count: number | null;
  recurring_event_id: string | null;
  original_date: string | null;
  is_exception: boolean;
  created_at: string;
  updated_at: string;
}

export type CalendarEventInsert = Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type CalendarEventUpdate = Partial<Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// =============================================================================
// REMINDERS
// =============================================================================

export type ReminderSourceType = 'calendar_event' | 'task' | 'habit' | 'bill';
export type ReminderType = 'relative' | 'absolute';
export type ReminderChannel = 'push' | 'email';
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'snoozed';

export interface Reminder {
  id: string;
  user_id: string;
  source_type: ReminderSourceType;
  source_id: string;
  reminder_type: ReminderType;
  relative_minutes: number | null;
  absolute_time: string | null;
  channels: ReminderChannel[];
  status: ReminderStatus;
  fire_at: string;         // TIMESTAMPTZ as ISO string
  sent_at: string | null;
  created_at: string;
}

export type ReminderInsert = Omit<Reminder, 'id' | 'created_at' | 'status' | 'sent_at'> & {
  id?: string;
  status?: ReminderStatus;
  sent_at?: string | null;
};

export type ReminderUpdate = Partial<Pick<Reminder, 'status' | 'fire_at' | 'sent_at' | 'channels'>>;

// =============================================================================
// REMINDER DEFAULTS
// =============================================================================

export interface ReminderDefault {
  id: string;
  user_id: string;
  source_type: ReminderSourceType;
  relative_minutes: number;
  channels: ReminderChannel[];
  created_at: string;
}

export type ReminderDefaultInsert = Omit<ReminderDefault, 'id' | 'created_at'> & {
  id?: string;
};

export type ReminderDefaultUpdate = Partial<Pick<ReminderDefault, 'relative_minutes' | 'channels'>>;

// =============================================================================
// PUSH SUBSCRIPTIONS
// =============================================================================

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export type PushSubscriptionInsert = Omit<PushSubscription, 'id' | 'created_at'> & {
  id?: string;
};

// =============================================================================
// CHAT — SHARED
// =============================================================================

export const CHAT_ROLES = ['user', 'assistant', 'system'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// =============================================================================
// CONVERSATIONS
// =============================================================================

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}

export type ConversationInsert = {
  user_id: string;
  title?: string | null;
  model?: string;
};

export type ConversationUpdate = Partial<Pick<Conversation, 'title' | 'model'>>;

// =============================================================================
// CHAT MESSAGES
// =============================================================================

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export type ChatMessageInsert = Omit<ChatMessage, 'id' | 'created_at'>;
