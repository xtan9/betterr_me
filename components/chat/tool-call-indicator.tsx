"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  getHabitsToday: "Looking up habits",
  getHabitStats: "Checking habit stats",
  logHabit: "Logging habit",
  getTodayTasks: "Looking up today's tasks",
  getUpcomingTasks: "Checking upcoming tasks",
  getOverdueTasks: "Checking overdue tasks",
  getTask: "Looking up task",
  getProjectTasks: "Looking up project tasks",
  createTask: "Creating task",
  toggleTask: "Toggling task",
  updateTask: "Updating task",
  deleteTask: "Deleting task",
  getUpcomingEvents: "Checking calendar",
  createEvent: "Creating event",
  getTodayJournal: "Reading journal",
  getRecentJournal: "Reading recent journal entries",
  createJournalEntry: "Writing journal entry",
  getRecentTransactions: "Looking up transactions",
  getBudgetStatus: "Checking budget",
  getSpendingSummary: "Analyzing spending",
  addTransaction: "Adding transaction",
  getRecentWorkouts: "Looking up workouts",
  getActiveWorkout: "Checking active workout",
  getProjects: "Looking up projects",
  getUpcomingReminders: "Checking reminders",
  // Habit CRUD
  createHabit: "Creating habit",
  updateHabit: "Updating habit",
  pauseHabit: "Pausing habit",
  resumeHabit: "Resuming habit",
  graduateHabit: "Graduating habit",
  reactivateHabit: "Reactivating habit",
  deleteHabit: "Deleting habit",
  getDetailedHabitStats: "Analyzing habit stats",
  // Recurring tasks
  getRecurringTasks: "Looking up recurring tasks",
  createRecurringTask: "Creating recurring task",
  updateRecurringTask: "Updating recurring task",
  pauseRecurringTask: "Pausing recurring task",
  deleteRecurringTask: "Deleting recurring task",
  // Projects
  getProject: "Looking up project",
  createProject: "Creating project",
  updateProject: "Updating project",
  deleteProject: "Deleting project",
  // Calendar
  updateEvent: "Updating event",
  deleteEvent: "Deleting event",
  // Reminders
  createReminder: "Creating reminder",
  dismissReminder: "Dismissing reminder",
  deleteReminder: "Deleting reminder",
  // Journal
  deleteJournalEntry: "Deleting journal entry",
  // Money
  updateTransaction: "Updating transaction",
  getAccounts: "Looking up accounts",
  getSavingsGoals: "Looking up savings goals",
  createSavingsGoal: "Creating savings goal",
  updateSavingsGoal: "Updating savings goal",
  deleteSavingsGoal: "Deleting savings goal",
  addSavingsContribution: "Adding to savings",
  getRecurringBills: "Looking up recurring bills",
  getSpendingTrends: "Analyzing spending trends",
  // Workouts
  startWorkout: "Starting workout",
  completeWorkout: "Completing workout",
  getWorkoutDetails: "Loading workout details",
  getExercises: "Looking up exercises",
  getRoutines: "Looking up routines",
  getExerciseHistory: "Checking exercise history",
  // Categories
  getCategories: "Looking up categories",
  createCategory: "Creating category",
};

interface ToolCallIndicatorProps {
  toolName: string;
  state: "partial-call" | "call" | "result";
}

export function ToolCallIndicator({ toolName, state }: ToolCallIndicatorProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const isRunning = state !== "result";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-caption text-muted-foreground py-1",
        !isRunning && "opacity-60",
      )}
    >
      {isRunning ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className="h-3 w-3 text-center">✓</span>
      )}
      <span>{isRunning ? `${label}...` : label}</span>
    </div>
  );
}
