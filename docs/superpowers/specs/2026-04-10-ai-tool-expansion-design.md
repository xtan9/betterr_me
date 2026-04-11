# AI Assistant Tool Expansion Design

**Date:** 2026-04-10
**Goal:** Maximize AI chat assistant capabilities by exposing full CRUD operations across all user-facing domains.

## Current State

The AI assistant has 25 tools across 8 domains. Most domains only expose read operations, leaving the assistant unable to create, update, or delete data in most areas.

**Current coverage:** Tasks (10 tools, best covered), Habits (3), Calendar (2), Journal (3), Money (4), Workouts (2), Projects (1), Reminders (1).

## Design

### New Tools by Domain

#### 1. Habits (7 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `createHabit` | `HabitsDB.createHabit()` | Create a new habit with name, frequency, category |
| `updateHabit` | `HabitsDB.updateHabit()` | Update habit name, description, frequency, category |
| `pauseHabit` | `HabitsDB.pauseHabit()` | Pause a habit (stops tracking) |
| `resumeHabit` | `HabitsDB.resumeHabit()` | Resume a paused habit |
| `archiveHabit` | `HabitsDB.archiveHabit()` | Archive a habit (soft delete) |
| `deleteHabit` | `HabitsDB.deleteHabit()` | Permanently delete a habit (destructive) |
| `getDetailedHabitStats` | `HabitLogsDB.getDetailedHabitStats()` | Get detailed completion stats with streaks, rates by period |

**Parameters:**
- `createHabit`: `{ name: string, description?: string, frequency: { type: "daily" | "weekdays" | "weekly" | "times_per_week" | "custom", count?: number, days?: number[] }, categoryId?: string }`
- `updateHabit`: `{ habitId: string, name?: string, description?: string, frequency?: object, categoryId?: string }`
- `pauseHabit` / `resumeHabit` / `archiveHabit` / `deleteHabit`: `{ habitId: string }`
- `getDetailedHabitStats`: `{ habitId: string }`

#### 2. Recurring Tasks (5 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `getRecurringTasks` | `RecurringTasksDB.getUserRecurringTasks()` | List all recurring tasks with optional status filter |
| `createRecurringTask` | `RecurringTasksDB.createRecurringTask()` | Create a new recurring task with recurrence rule |
| `updateRecurringTask` | `RecurringTasksDB.updateRecurringTask()` | Update recurring task fields |
| `pauseRecurringTask` | `RecurringTasksDB.pauseRecurringTask()` | Pause a recurring task |
| `deleteRecurringTask` | `RecurringTasksDB.deleteRecurringTask()` | Delete a recurring task and its future instances |

**Parameters:**
- `getRecurringTasks`: `{ status?: "active" | "paused" | "archived" }`
- `createRecurringTask`: `{ title: string, description?: string, priority?: 0|1|2|3, categoryId?: string, dueTime?: string, startDate: string, recurrenceRule: { frequency: "daily" | "weekly" | "monthly" | "yearly", interval?: number, daysOfWeek?: number[], dayOfMonth?: number }, endType?: "never" | "date" | "count", endDate?: string, endCount?: number }`
- `updateRecurringTask`: `{ recurringTaskId: string, title?: string, description?: string, priority?: number, recurrenceRule?: object }`
- `pauseRecurringTask` / `deleteRecurringTask`: `{ recurringTaskId: string }`

#### 3. Projects (4 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `getProject` | `ProjectsDB.getProject()` | Get a single project by ID with details |
| `createProject` | `ProjectsDB.createProject()` | Create a new project |
| `updateProject` | `ProjectsDB.updateProject()` | Update project name, description, status, color |
| `deleteProject` | `ProjectsDB.deleteProject()` | Delete a project (destructive) |

**Parameters:**
- `getProject`: `{ projectId: string }`
- `createProject`: `{ name: string, description?: string, color?: string }`
- `updateProject`: `{ projectId: string, name?: string, description?: string, color?: string, status?: string }`
- `deleteProject`: `{ projectId: string }`

#### 4. Calendar (2 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `updateEvent` | `CalendarEventsDB.updateEvent()` | Update a calendar event's title, date, time, etc. |
| `deleteEvent` | `CalendarEventsDB.deleteEvent()` | Delete a calendar event |

**Parameters:**
- `updateEvent`: `{ eventId: string, title?: string, description?: string, startDate?: string, endDate?: string, startTime?: string, endTime?: string, allDay?: boolean, location?: string }`
- `deleteEvent`: `{ eventId: string }`

#### 5. Reminders (3 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `createReminder` | `RemindersDB.createReminder()` | Create a standalone reminder |
| `dismissReminder` | `RemindersDB.updateReminderStatus()` | Dismiss/snooze a reminder |
| `deleteReminder` | `RemindersDB.deleteReminder()` | Delete a reminder |

**Parameters:**
- `createReminder`: `{ title: string, remindAt: string (ISO datetime), sourceType?: string, sourceId?: string }`
- `dismissReminder`: `{ reminderId: string, action: "dismiss" | "snooze", snoozeUntil?: string }`
- `deleteReminder`: `{ reminderId: string }`

#### 6. Journal (1 new tool)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `deleteJournalEntry` | `JournalEntriesDB.deleteEntry()` | Delete a journal entry |

**Parameters:**
- `deleteJournalEntry`: `{ entryId: string }`

#### 7. Money (10 new tools)

All money tools require `ctx.householdId` (same pattern as existing money tools).

| Tool | DB Method | Description |
|------|-----------|-------------|
| `updateTransaction` | `TransactionsDB.update()` | Update transaction amount, category, note, date |
| `deleteTransaction` | `TransactionsDB — delete via update` | Mark a transaction as excluded/deleted |
| `getAccounts` | `MoneyAccountsDB.getByHousehold()` | List all financial accounts |
| `getSavingsGoals` | `SavingsGoalsDB.getByHousehold()` | List all savings goals with progress |
| `createSavingsGoal` | `SavingsGoalsDB.create()` | Create a new savings goal |
| `updateSavingsGoal` | `SavingsGoalsDB.update()` | Update savings goal target or name |
| `deleteSavingsGoal` | `SavingsGoalsDB.delete()` | Delete a savings goal |
| `addSavingsContribution` | `SavingsGoalsDB.addContribution()` | Add money toward a savings goal |
| `getRecurringBills` | `RecurringBillsDB.getByHousehold()` | List recurring bills and subscriptions |
| `getSpendingTrends` | `BudgetsDB.getSpendingTrends()` | Get spending trends across months |

**Parameters:**
- `updateTransaction`: `{ transactionId: string, amount?: number, categoryId?: string, note?: string, date?: string, merchantName?: string }`
- `deleteTransaction`: `{ transactionId: string }`
- `getAccounts` / `getSavingsGoals` / `getRecurringBills`: `{}`
- `createSavingsGoal`: `{ name: string, targetCents: number, targetDate?: string }`
- `updateSavingsGoal`: `{ goalId: string, name?: string, targetCents?: number, targetDate?: string }`
- `deleteSavingsGoal`: `{ goalId: string }`
- `addSavingsContribution`: `{ goalId: string, amountCents: number, note?: string }`
- `getSpendingTrends`: `{ months: number }`

#### 8. Workouts (6 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `startWorkout` | `WorkoutsDB.startWorkout()` | Start a new workout session |
| `completeWorkout` | `WorkoutsDB.updateWorkout()` | Complete/end an active workout |
| `getExercises` | `ExercisesDB.getAllExercises()` | List available exercises |
| `getRoutines` | `RoutinesDB.getUserRoutines()` | List user's workout routines |
| `getExerciseHistory` | `WorkoutsDB.getExerciseHistory()` | Get performance history for an exercise |
| `getWorkoutDetails` | `WorkoutsDB.getWorkoutWithExercises()` | Get full workout with all exercises and sets |

**Parameters:**
- `startWorkout`: `{ name?: string, routineId?: string }`
- `completeWorkout`: `{ workoutId: string, notes?: string }`
- `getExercises`: `{}`
- `getRoutines`: `{}`
- `getExerciseHistory`: `{ exerciseId: string, limit?: number }`
- `getWorkoutDetails`: `{ workoutId: string }`

#### 9. Categories (2 new tools)

| Tool | DB Method | Description |
|------|-----------|-------------|
| `getCategories` | `CategoriesDB.getUserCategories()` | List all user categories (for tasks/habits) |
| `createCategory` | `CategoriesDB.createCategory()` | Create a new category |

**Parameters:**
- `getCategories`: `{}`
- `createCategory`: `{ name: string, color: string, icon?: string }`

### Summary

| Metric | Before | After |
|--------|--------|-------|
| Total tools | 25 | **65** |
| Habits | 3 (read-only + toggle) | **10** (full CRUD) |
| Tasks | 9 | **14** (+ recurring) |
| Projects | 1 (read-only) | **5** (full CRUD) |
| Calendar | 2 | **4** (full CRUD) |
| Reminders | 1 (read-only) | **4** (full CRUD) |
| Journal | 3 | **4** (+ delete) |
| Money | 4 | **14** (+ accounts, goals, bills, trends) |
| Workouts | 2 (read-only) | **8** (+ start, complete, exercises, routines) |
| Categories | 0 | **2** (list + create) |

### Excluded (Internal/Sensitive)

These are intentionally NOT exposed as tools:
- **BankConnectionsDB** — Plaid integration internals (sync cursors, access tokens)
- **PushSubscriptionsDB** — System-level push notification management
- **ApiKeysDB** — Security-sensitive API key management
- **ChatMessagesDB / ConversationsDB** — Chat managing itself creates circular behavior
- **ExerciseMediaDB** — Admin sync operation for media assets
- **HouseholdsDB** — Complex invite/membership flows unsuitable for chat
- **TransactionSplitsDB** — Complex split logic better handled in UI
- **MerchantRulesDB** — Auto-categorization rules, internal plumbing
- **InsightsDB** — Dashboard-specific aggregation, not conversational

### System Prompt Updates

Update `buildSystemPrompt()` to mention the expanded capabilities:
- Habit management (create, pause, archive)
- Recurring task creation
- Project management
- Calendar event updates/deletion
- Reminder creation
- Savings goals
- Workout management

### Confirmation Requirements

Destructive/high-impact tools that require user confirmation before execution (enforced in system prompt):
- `deleteHabit`, `deleteProject`, `deleteEvent`, `deleteReminder`, `deleteJournalEntry`
- `deleteTransaction`, `deleteSavingsGoal`, `deleteRecurringTask`
- `addTransaction` (existing), `addSavingsContribution`
- `createRecurringTask` (creates many future instances)
- `startWorkout` (begins a session)

### Tool Call Indicator Labels

All 40 new tools need labels in `tool-call-indicator.tsx`:

```
createHabit → "Creating habit"
updateHabit → "Updating habit"
pauseHabit → "Pausing habit"
resumeHabit → "Resuming habit"
archiveHabit → "Archiving habit"
deleteHabit → "Deleting habit"
getDetailedHabitStats → "Analyzing habit stats"
getRecurringTasks → "Looking up recurring tasks"
createRecurringTask → "Creating recurring task"
updateRecurringTask → "Updating recurring task"
pauseRecurringTask → "Pausing recurring task"
deleteRecurringTask → "Deleting recurring task"
getProject → "Looking up project"
createProject → "Creating project"
updateProject → "Updating project"
deleteProject → "Deleting project"
updateEvent → "Updating event"
deleteEvent → "Deleting event"
createReminder → "Creating reminder"
dismissReminder → "Dismissing reminder"
deleteReminder → "Deleting reminder"
deleteJournalEntry → "Deleting journal entry"
updateTransaction → "Updating transaction"
deleteTransaction → "Deleting transaction"
getAccounts → "Looking up accounts"
getSavingsGoals → "Looking up savings goals"
createSavingsGoal → "Creating savings goal"
updateSavingsGoal → "Updating savings goal"
deleteSavingsGoal → "Deleting savings goal"
addSavingsContribution → "Adding to savings"
getRecurringBills → "Looking up recurring bills"
getSpendingTrends → "Analyzing spending trends"
startWorkout → "Starting workout"
completeWorkout → "Completing workout"
getExercises → "Looking up exercises"
getRoutines → "Looking up routines"
getExerciseHistory → "Checking exercise history"
getWorkoutDetails → "Loading workout details"
getCategories → "Looking up categories"
createCategory → "Creating category"
```

### Architecture

No architectural changes needed. Each new tool follows the existing pattern:
1. Define in the appropriate `lib/ai/tools/<domain>.ts` file
2. Export from `lib/ai/tools/index.ts` via the domain's `*Tools()` function
3. Chat adapter and MCP adapter pick them up automatically
4. Add label to `tool-call-indicator.tsx`

### File Changes

| File | Change |
|------|--------|
| `lib/ai/tools/habits.ts` | Add 7 new tools |
| `lib/ai/tools/tasks.ts` | Add 5 recurring task tools |
| `lib/ai/tools/projects.ts` | Add 4 new tools |
| `lib/ai/tools/calendar.ts` | Add 2 new tools |
| `lib/ai/tools/reminders.ts` | Add 3 new tools |
| `lib/ai/tools/journal.ts` | Add 1 new tool |
| `lib/ai/tools/money.ts` | Add 10 new tools |
| `lib/ai/tools/workouts.ts` | Add 6 new tools |
| `lib/ai/tools/categories.ts` | **New file** — 2 tools |
| `lib/ai/tools/index.ts` | Import + register `categoryTools()` |
| `lib/ai/system-prompt.ts` | Expand capability description |
| `components/chat/tool-call-indicator.tsx` | Add 40 new labels |
| `lib/mcp/tools.ts` | No changes needed (auto-picks up from `getAllTools()`) |
| Tests | Add tests for each new tool file |

### Testing Strategy

Each tool file gets a corresponding test file following existing patterns:
- Mock Supabase client with `mockSupabaseClient.setMockResponse()`
- Test each tool's `execute()` with valid params
- Test error handling (missing householdId for money tools, not found, etc.)
- Test parameter transformation (camelCase to snake_case)
