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
// TASKS
// =============================================================================

export type TaskCategory = "work" | "personal" | "shopping" | "other";

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TaskSection = 'personal' | 'work';

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

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'category' | 'intention' | 'completion_difficulty' | 'project_id' | 'recurring_task_id' | 'is_exception' | 'original_date' | 'status' | 'section' | 'sort_order'> & {
  id?: string;
  category?: TaskCategory | null;
  intention?: string | null;
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

export type HabitCategory =
  | "health"
  | "wellness"
  | "learning"
  | "productivity"
  | "other";

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
  category: HabitCategory | null;
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
export type AccountVisibility = "mine" | "ours" | "hidden";
export type ViewMode = "mine" | "household";

export interface MoneyAccount {
  id: string;
  household_id: string;
  bank_connection_id: string | null;
  name: string;
  account_type: string;
  balance_cents: number;
  currency: string;
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
// CATEGORIES (extended for Phase 20)
// =============================================================================

/** Category (system defaults have household_id = null) */
export interface Category {
  id: string;
  household_id: string | null;
  name: string;
  icon: string | null;
  is_system: boolean;
  color: string | null;
  display_name: string | null;
  created_at: string;
}

export type CategoryInsert = Omit<Category, "id" | "created_at"> & {
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
  Omit<SavingsGoal, "id" | "household_id" | "created_at" | "updated_at">
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
