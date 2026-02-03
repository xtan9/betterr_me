# V1.0 GitHub Issues

This file contains all issues for V1.0 implementation. Use the script `scripts/create-issues.sh` to bulk create them, or copy/paste into GitHub manually.

---

## Epic 1: Database Foundation

### Issue: DB-001 - Create habits table migration

**Labels:** `database`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create the PostgreSQL migration for the `habits` table.

**Requirements:**
- [ ] Create migration file `supabase/migrations/20260203_001_create_habits_table.sql`
- [ ] Include all columns: id, user_id, name, description, category, frequency (JSONB), status, current_streak, best_streak, paused_at, created_at, updated_at
- [ ] Add indexes: user_id, (user_id, status), active habits
- [ ] Add CHECK constraints for category and status enums
- [ ] Test migration runs successfully with `supabase db reset`

**Acceptance Criteria:**
- Migration applies without errors
- Table visible in Supabase dashboard
- Indexes created correctly

**Reference:** Engineering Plan Section 6.2

---

### Issue: DB-002 - Create habit_logs table migration

**Labels:** `database`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create the PostgreSQL migration for the `habit_logs` table.

**Requirements:**
- [ ] Create migration file `supabase/migrations/20260203_002_create_habit_logs_table.sql`
- [ ] Include columns: id, habit_id, user_id, logged_date, completed, created_at, updated_at
- [ ] Add UNIQUE constraint on (habit_id, logged_date)
- [ ] Add foreign keys to habits and profiles tables
- [ ] Add indexes for common queries

**Acceptance Criteria:**
- Migration applies without errors
- Unique constraint prevents duplicate logs per day
- Cascade delete works when habit is deleted

**Reference:** Engineering Plan Section 6.3

---

### Issue: DB-003 - Add RLS policies for habit tables

**Labels:** `database`, `backend`, `security`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Add Row Level Security policies to ensure users can only access their own data.

**Requirements:**
- [ ] Create migration file `supabase/migrations/20260203_003_add_rls_policies.sql`
- [ ] Enable RLS on habits table
- [ ] Enable RLS on habit_logs table
- [ ] Add SELECT/INSERT/UPDATE/DELETE policies for both tables
- [ ] Policies should use `auth.uid()` for user verification

**Acceptance Criteria:**
- User A cannot see User B's habits
- User A cannot modify User B's habit logs
- Verified with test queries

**Reference:** Engineering Plan Section 6.4

---

### Issue: DB-004 - Add updated_at triggers

**Labels:** `database`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Add triggers to automatically update `updated_at` timestamp on row modifications.

**Requirements:**
- [ ] Create migration file `supabase/migrations/20260203_004_add_triggers.sql`
- [ ] Reuse existing `update_updated_at_column()` function if it exists
- [ ] Apply trigger to habits table
- [ ] Apply trigger to habit_logs table

**Acceptance Criteria:**
- Updating a habit row updates its `updated_at` timestamp
- Updating a habit_log row updates its `updated_at` timestamp

**Reference:** Engineering Plan Section 6.5

---

### Issue: DB-005 - Add category column to tasks table

**Labels:** `database`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Add optional category column to existing tasks table.

**Requirements:**
- [ ] Create migration file `supabase/migrations/20260203_005_alter_tasks_add_category.sql`
- [ ] Add category column with CHECK constraint
- [ ] Categories: 'work', 'personal', 'shopping', 'other'
- [ ] Column should be nullable (existing tasks don't have category)

**Acceptance Criteria:**
- Migration applies without affecting existing data
- New tasks can have category assigned
- Existing tasks remain unchanged

---

### Issue: DB-006 - Generate TypeScript types for habits

**Labels:** `database`, `types`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Generate and update TypeScript types to include new habit tables.

**Requirements:**
- [ ] Run `supabase gen types typescript --local > lib/types/database.ts`
- [ ] Verify Habit and HabitLog types are generated
- [ ] Create manual type definitions in `lib/db/types.ts` for app use
- [ ] Add Zod validation schemas for habit frequency

**Acceptance Criteria:**
- TypeScript compilation passes
- Types match database schema exactly
- Frequency JSONB has proper discriminated union type

---

## Epic 2: Database Layer

### Issue: DAL-001 - Implement HabitsDB class

**Labels:** `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create the database access layer for habits following the existing pattern (TasksDB, ProfilesDB).

**Requirements:**
- [ ] Create `lib/db/habits.ts`
- [ ] Implement methods: getAll, getById, create, update, delete
- [ ] Add filtering by status (active, paused, archived)
- [ ] Add updateStreak method
- [ ] Follow existing error handling patterns

**Acceptance Criteria:**
- All CRUD operations work correctly
- Filtering returns correct results
- Errors are handled consistently with existing code

**Reference:** Engineering Plan Section 7.2

---

### Issue: DAL-002 - Implement HabitLogsDB class

**Labels:** `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create the database access layer for habit logs.

**Requirements:**
- [ ] Create `lib/db/habit-logs.ts`
- [ ] Implement toggle method (create or delete log for date)
- [ ] Implement getByDateRange for heatmap
- [ ] Implement getByDate for dashboard (all habits for a day)
- [ ] Handle the 7-day edit window constraint

**Acceptance Criteria:**
- Toggle creates log if not exists, deletes if exists
- Date range query returns correct logs
- Rejects edits older than 7 days

---

### Issue: DAL-003 - Implement streak calculation

**Labels:** `backend`, `P0`, `complex`
**Milestone:** V1.0 Phase 1

**Description:**
Implement the streak calculation algorithm that handles all frequency types.

**Requirements:**
- [ ] Create `lib/habits/streak.ts`
- [ ] Handle daily frequency
- [ ] Handle weekdays (Mon-Fri) frequency
- [ ] Handle weekly frequency
- [ ] Handle times_per_week (2x, 3x)
- [ ] Handle custom days frequency
- [ ] Handle paused habits (freeze streak)
- [ ] Skip today if not yet completed

**Acceptance Criteria:**
- All frequency types calculate correctly
- Edge cases handled (see test cases in DAL-005)
- Returns both current_streak and best_streak

**Reference:** PRD Section 6 (Streak Calculation Rules)

---

### Issue: DAL-004 - Unit tests for HabitsDB

**Labels:** `testing`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Write comprehensive unit tests for the HabitsDB class.

**Requirements:**
- [ ] Create `tests/lib/db/habits.test.ts`
- [ ] Test all CRUD operations
- [ ] Test filtering by status
- [ ] Test error cases (not found, unauthorized)
- [ ] Mock Supabase client following existing patterns

**Acceptance Criteria:**
- 80%+ code coverage for HabitsDB
- All tests pass
- Mocking follows established patterns

---

### Issue: DAL-005 - Unit tests for streak calculation

**Labels:** `testing`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Write comprehensive unit tests for streak calculation covering all edge cases.

**Test Cases Required:**
- [ ] Daily: consecutive days, missed day breaks streak
- [ ] Weekdays: skips weekends, breaks on missed weekday
- [ ] Weekly: counts weeks with completion
- [ ] Times per week: 2x and 3x patterns
- [ ] Custom days: Mon/Wed/Fri pattern
- [ ] Edge: habit created today
- [ ] Edge: habit paused and resumed
- [ ] Edge: timezone boundary
- [ ] Edge: no logs yet (streak = 0)
- [ ] Edge: skip today if not completed

**Acceptance Criteria:**
- 100% code coverage for streak.ts
- All edge cases documented and tested

**Reference:** Engineering Plan Section 9.3

---

### Issue: DAL-006 - Implement DashboardDB class

**Labels:** `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create aggregated data fetching for the dashboard endpoint.

**Requirements:**
- [ ] Create `lib/db/dashboard.ts`
- [ ] Implement getTodayData method
- [ ] Aggregate: habits completed today, tasks completed today
- [ ] Get comparison with yesterday
- [ ] Get top streaks
- [ ] Get motivational message based on progress

**Acceptance Criteria:**
- Single method returns all dashboard data
- Efficient queries (avoid N+1)
- Handles first-day user (no yesterday data)

---

## Epic 3: API Routes

### Issue: API-001 - GET /api/habits endpoint

**Labels:** `api`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to list user's habits with optional filtering.

**Requirements:**
- [ ] Create `app/api/habits/route.ts`
- [ ] Require authentication
- [ ] Support query param: `?status=active|paused|archived`
- [ ] Return habits sorted by created_at desc
- [ ] Include current_streak in response

**Acceptance Criteria:**
- Returns 401 if not authenticated
- Returns only user's own habits
- Filtering works correctly

---

### Issue: API-002 - POST /api/habits endpoint

**Labels:** `api`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to create a new habit.

**Requirements:**
- [ ] Add POST handler to `app/api/habits/route.ts`
- [ ] Validate request body with Zod schema
- [ ] Validate frequency JSONB structure
- [ ] Set user_id from authenticated user
- [ ] Return created habit with 201 status

**Acceptance Criteria:**
- Returns 400 for invalid data
- Returns 401 if not authenticated
- Frequency validation rejects invalid types

---

### Issue: API-003 - GET /api/habits/[id] endpoint

**Labels:** `api`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to get a single habit by ID.

**Requirements:**
- [ ] Create `app/api/habits/[id]/route.ts`
- [ ] Require authentication
- [ ] Return 404 if habit not found or belongs to other user
- [ ] Include current_streak and best_streak

**Acceptance Criteria:**
- Returns habit detail
- Returns 404 for non-existent habit
- Cannot access other user's habits

---

### Issue: API-004 - PATCH /api/habits/[id] endpoint

**Labels:** `api`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to update an existing habit.

**Requirements:**
- [ ] Add PATCH handler to `app/api/habits/[id]/route.ts`
- [ ] Allow partial updates
- [ ] Validate any frequency changes
- [ ] Handle status transitions (active → paused → archived)
- [ ] Set paused_at when status changes to paused

**Acceptance Criteria:**
- Partial updates work correctly
- Cannot update other user's habits
- Status transitions update paused_at appropriately

---

### Issue: API-005 - DELETE /api/habits/[id] endpoint

**Labels:** `api`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to delete a habit.

**Requirements:**
- [ ] Add DELETE handler to `app/api/habits/[id]/route.ts`
- [ ] Decision needed: Hard delete vs archive
- [ ] Return 204 on success
- [ ] Cascade delete habit_logs (via FK constraint)

**Acceptance Criteria:**
- Returns 204 on successful delete
- Returns 404 for non-existent habit
- Associated logs are removed

---

### Issue: API-006 - POST /api/habits/[id]/toggle endpoint

**Labels:** `api`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to toggle habit completion for a specific date.

**Requirements:**
- [ ] Create `app/api/habits/[id]/toggle/route.ts`
- [ ] Accept body: `{ logged_date: "2026-02-03" }`
- [ ] If log exists for date, delete it (toggle off)
- [ ] If log doesn't exist, create it (toggle on)
- [ ] Recalculate streak after toggle
- [ ] Update best_streak if current exceeds it
- [ ] Reject dates > 7 days ago
- [ ] Reject future dates

**Response:**
```json
{
  "completed": true,
  "current_streak": 24,
  "best_streak": 45
}
```

**Acceptance Criteria:**
- Toggle on/off works correctly
- Streak updates in response
- Rejects invalid dates with clear error

**Reference:** Engineering Plan ADR-001

---

### Issue: API-007 - GET /api/habits/[id]/logs endpoint

**Labels:** `api`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to get habit logs for heatmap visualization.

**Requirements:**
- [ ] Create `app/api/habits/[id]/logs/route.ts`
- [ ] Accept query param: `?days=30` (default 30, max 90)
- [ ] Return array of `{ logged_date, completed }`
- [ ] Fill in missing dates as `{ logged_date, completed: false }`

**Acceptance Criteria:**
- Returns last N days of logs
- Missing days filled with completed=false
- Sorted by date descending

---

### Issue: API-008 - GET /api/habits/[id]/stats endpoint

**Labels:** `api`, `backend`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Create endpoint to get detailed statistics for a habit.

**Requirements:**
- [ ] Create `app/api/habits/[id]/stats/route.ts`
- [ ] Calculate: current_streak, best_streak
- [ ] Calculate: completion_this_week, completion_this_month, completion_all_time
- [ ] Calculate: total_days_tracked, completion_percentage

**Response:**
```json
{
  "current_streak": 24,
  "best_streak": 45,
  "completion_this_week": 5,
  "completion_this_month": 22,
  "completion_all_time": 156,
  "total_days_tracked": 180,
  "completion_percentage": 87
}
```

**Acceptance Criteria:**
- All stats calculate correctly
- Handles habits with no logs

---

### Issue: API-009 - GET /api/dashboard/today endpoint

**Labels:** `api`, `backend`, `P0`
**Milestone:** V1.0 Phase 1

**Description:**
Create aggregated dashboard endpoint for efficient data loading.

**Requirements:**
- [ ] Create `app/api/dashboard/today/route.ts`
- [ ] Return habits summary (completed/total today)
- [ ] Return tasks summary (completed/total today)
- [ ] Return comparison with yesterday (or null for day 1)
- [ ] Return top streaks (top 3)
- [ ] Return full habits list with today's completion status
- [ ] Return today's tasks list
- [ ] Return motivational message

**Acceptance Criteria:**
- Single request returns all dashboard data
- Handles first-day users gracefully
- Performance: <500ms response time

**Reference:** Engineering Plan ADR-003

---

### Issue: API-010 - Integration tests for habit API routes

**Labels:** `testing`, `api`, `P1`
**Milestone:** V1.0 Phase 1

**Description:**
Write integration tests for all habit API endpoints.

**Requirements:**
- [ ] Create `tests/app/api/habits/` test files
- [ ] Test authentication requirements
- [ ] Test CRUD operations
- [ ] Test toggle endpoint edge cases
- [ ] Test error responses
- [ ] Mock Supabase following existing patterns

**Acceptance Criteria:**
- All endpoints have test coverage
- Auth failures return 401
- Validation failures return 400
- Not found returns 404

---

## Epic 4: Core UI Components

### Issue: UI-001 - HabitForm component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create form component for creating and editing habits.

**Requirements:**
- [ ] Create `components/habits/habit-form.tsx`
- [ ] Fields: name (required), description, category, frequency
- [ ] Use React Hook Form + Zod validation
- [ ] Support both create and edit modes
- [ ] Use shadcn/ui form components
- [ ] Add i18n for all labels and errors

**Acceptance Criteria:**
- Form validates before submission
- Works in create and edit modes
- Frequency selector shows all options
- Mobile responsive

---

### Issue: UI-002 - FrequencySelector component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create component for selecting habit frequency.

**Requirements:**
- [ ] Create `components/habits/frequency-selector.tsx`
- [ ] Options: Daily, Weekdays, Weekly, 2x/week, 3x/week, Custom
- [ ] Custom shows day-of-week checkboxes
- [ ] Visual feedback for selected option
- [ ] Outputs proper frequency JSONB structure

**Acceptance Criteria:**
- All frequency types selectable
- Custom days allow multi-select
- Returns correct JSONB structure
- Accessible with keyboard

---

### Issue: UI-003 - HabitCard component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create card component for displaying a habit with toggle.

**Requirements:**
- [ ] Create `components/habits/habit-card.tsx`
- [ ] Display: name, category badge, current streak
- [ ] Checkbox for today's completion (1-click toggle)
- [ ] Optimistic UI update on toggle
- [ ] Link to habit detail page
- [ ] Show streak fire emoji for streaks > 7 days

**Acceptance Criteria:**
- Toggle works with instant feedback
- Streak displays prominently
- Card is clickable to view details
- Accessible (keyboard, screen reader)

---

### Issue: UI-004 - HabitList component

**Labels:** `frontend`, `component`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Create list component with filtering.

**Requirements:**
- [ ] Create `components/habits/habit-list.tsx`
- [ ] Display HabitCards in grid/list layout
- [ ] Filter tabs: Active, Paused, Archived
- [ ] Show count per filter
- [ ] Empty state when no habits

**Acceptance Criteria:**
- Filtering works correctly
- Responsive grid layout
- Empty state is encouraging

---

### Issue: UI-005 - StreakCounter component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create prominent streak display component.

**Requirements:**
- [ ] Create `components/habits/streak-counter.tsx`
- [ ] Large display of current streak
- [ ] Smaller display of best streak
- [ ] Fire/flame animation for active streaks
- [ ] Different styles for milestones (7, 30, 100, 365)

**Acceptance Criteria:**
- Visually prominent
- Celebrates milestones
- Accessible (aria-live for updates)

---

### Issue: UI-006 - Heatmap30Day component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create 30-day calendar heatmap visualization.

**Requirements:**
- [ ] Create `components/habits/heatmap-30day.tsx`
- [ ] Display last 30 days in calendar grid
- [ ] Green = completed, Gray = missed, Light = not scheduled
- [ ] Tooltips showing date and status
- [ ] Click to toggle past days (within 7-day window)
- [ ] Respect user's week start preference

**Acceptance Criteria:**
- Correctly displays completion history
- Color coding is clear
- Keyboard navigable
- Works with all frequency types

---

### Issue: UI-007 - HabitEmptyState component

**Labels:** `frontend`, `component`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Create encouraging empty state for habits.

**Requirements:**
- [ ] Create `components/habits/habit-empty-state.tsx`
- [ ] Friendly illustration or icon
- [ ] Encouraging message: "Start your journey!"
- [ ] CTA button to create first habit
- [ ] i18n for all text

**Acceptance Criteria:**
- Visually appealing
- Clear call to action
- Translated to all languages

---

### Issue: UI-008 - Component tests for habits

**Labels:** `testing`, `frontend`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Write tests for all habit UI components.

**Requirements:**
- [ ] Test HabitCard renders correctly
- [ ] Test HabitCard toggle interaction
- [ ] Test HabitForm validation
- [ ] Test FrequencySelector outputs correct data
- [ ] Test Heatmap displays correctly

**Acceptance Criteria:**
- All components have basic render tests
- Key interactions are tested
- Follows existing test patterns

---

## Epic 5: Pages

### Issue: PG-001 - Create /habits page

**Labels:** `frontend`, `page`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create the main habits listing page.

**Requirements:**
- [ ] Create `app/habits/page.tsx`
- [ ] Server component that fetches habits
- [ ] Display HabitList with filters
- [ ] "New Habit" button in header
- [ ] Add to navbar navigation

**Acceptance Criteria:**
- Page loads with user's habits
- Filters work correctly
- Protected route (redirects if not logged in)

---

### Issue: PG-002 - Create /habits/new page

**Labels:** `frontend`, `page`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create page for new habit form.

**Requirements:**
- [ ] Create `app/habits/new/page.tsx`
- [ ] Display HabitForm in create mode
- [ ] Redirect to /habits after creation
- [ ] Show success toast

**Acceptance Criteria:**
- Form creates habit
- Redirects on success
- Handles errors gracefully

---

### Issue: PG-003 - Create /habits/[id] detail page

**Labels:** `frontend`, `page`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create habit detail page with stats and heatmap.

**Requirements:**
- [ ] Create `app/habits/[id]/page.tsx`
- [ ] Display habit name, description, category
- [ ] Display StreakCounter
- [ ] Display completion stats
- [ ] Display Heatmap30Day
- [ ] Edit and pause/archive actions

**Acceptance Criteria:**
- All stats display correctly
- Heatmap shows completion history
- Edit button links to edit page
- 404 if habit not found

---

### Issue: PG-004 - Create /habits/[id]/edit page

**Labels:** `frontend`, `page`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Create page to edit existing habit.

**Requirements:**
- [ ] Create `app/habits/[id]/edit/page.tsx`
- [ ] Display HabitForm in edit mode
- [ ] Pre-fill with existing data
- [ ] Redirect to detail page after save

**Acceptance Criteria:**
- Form loads with existing data
- Updates save correctly
- Handles errors

---

### Issue: PG-005 - Add habits to navigation

**Labels:** `frontend`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Add Habits link to the navigation bar.

**Requirements:**
- [ ] Update `components/navbar.tsx`
- [ ] Add "Habits" link next to existing nav items
- [ ] Highlight when on /habits/* routes
- [ ] Add i18n string for "Habits"

**Acceptance Criteria:**
- Link visible in navbar
- Active state when on habits pages
- Works on mobile nav

---

### Issue: PG-006 - i18n for habit strings

**Labels:** `i18n`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Add all habit-related strings to translation files.

**Requirements:**
- [ ] Update `i18n/messages/en.json`
- [ ] Update `i18n/messages/zh.json`
- [ ] Update `i18n/messages/zh-TW.json`
- [ ] Strings for: form labels, categories, frequencies, empty states, errors

**Acceptance Criteria:**
- All habit UI text is translated
- No hardcoded strings in components
- Verified in all 3 languages

---

## Epic 6: Dashboard Integration

### Issue: DASH-001 - DailySnapshot component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create component showing today's summary stats.

**Requirements:**
- [ ] Create `components/dashboard/daily-snapshot.tsx`
- [ ] Show habits: X/Y completed (Z%)
- [ ] Show tasks: X/Y completed (Z%)
- [ ] Show comparison vs yesterday (+/-%)
- [ ] Show best current streak

**Acceptance Criteria:**
- Stats display correctly
- Comparison shows improvement/decline
- Handles first-day user (no comparison)

---

### Issue: DASH-002 - HabitChecklist component

**Labels:** `frontend`, `component`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Create dashboard section for quick habit completion.

**Requirements:**
- [ ] Create `components/dashboard/habit-checklist.tsx`
- [ ] Display all active habits with checkboxes
- [ ] 1-click toggle from dashboard
- [ ] Show streak next to each habit
- [ ] Optimistic updates

**Acceptance Criteria:**
- All active habits shown
- Toggle works instantly
- Streak updates on toggle

---

### Issue: DASH-003 - TasksToday component

**Labels:** `frontend`, `component`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Create dashboard section for today's tasks.

**Requirements:**
- [ ] Create `components/dashboard/tasks-today.tsx`
- [ ] Show tasks due today + overdue
- [ ] Priority indicators (color coded)
- [ ] Quick complete toggle
- [ ] Link to full tasks page

**Acceptance Criteria:**
- Shows today's tasks
- Overdue tasks highlighted
- Toggle marks complete

---

### Issue: DASH-004 - MotivationMessage component

**Labels:** `frontend`, `component`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Create contextual motivational message.

**Requirements:**
- [ ] Create `components/dashboard/motivation-message.tsx`
- [ ] Different messages based on progress
- [ ] Celebrate 100% completion
- [ ] Encourage when close to goal
- [ ] Mention streak at risk
- [ ] i18n for all messages

**Messages:**
- "You're 2 habits away from 100% today!"
- "Perfect day! You've completed all habits!"
- "Keep the reading streak alive!"

**Acceptance Criteria:**
- Message changes based on context
- Feels encouraging, not nagging
- Translated

---

### Issue: DASH-005 - Refactor dashboard page with real data

**Labels:** `frontend`, `page`, `P0`
**Milestone:** V1.0 Phase 2

**Description:**
Update dashboard to use real data instead of placeholders.

**Requirements:**
- [ ] Update `app/dashboard/page.tsx`
- [ ] Fetch data from /api/dashboard/today
- [ ] Replace hardcoded stats with real data
- [ ] Integrate DailySnapshot, HabitChecklist, TasksToday, MotivationMessage
- [ ] Add SWR for client-side revalidation after toggles

**Acceptance Criteria:**
- Dashboard shows real user data
- Updates after habit/task toggle
- Fast load time (<500ms)

---

### Issue: DASH-006 - Dashboard empty states

**Labels:** `frontend`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Add empty states for new users.

**Requirements:**
- [ ] Empty state when no habits
- [ ] Empty state when no tasks
- [ ] First-day welcome message
- [ ] Quick-start prompts

**Acceptance Criteria:**
- New user sees helpful onboarding
- CTAs to create first habit/task
- Not overwhelming

---

### Issue: DASH-007 - Dashboard loading states

**Labels:** `frontend`, `P1`
**Milestone:** V1.0 Phase 2

**Description:**
Add skeleton loaders for dashboard.

**Requirements:**
- [ ] Skeleton for DailySnapshot
- [ ] Skeleton for HabitChecklist
- [ ] Skeleton for TasksToday
- [ ] Use shadcn/ui Skeleton component

**Acceptance Criteria:**
- Loading state looks polished
- No layout shift when data loads

---

## Epic 7: Settings & Polish

### Issue: SET-001 - Add timezone selector to settings

**Labels:** `frontend`, `settings`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Add timezone selection to settings page.

**Requirements:**
- [ ] Update `app/settings/page.tsx` (or create if doesn't exist)
- [ ] Timezone dropdown with common timezones
- [ ] Auto-detect user's timezone
- [ ] Save to profile preferences

**Acceptance Criteria:**
- User can select timezone
- Timezone persists after logout
- Used for streak calculations

---

### Issue: SET-002 - Add week start day setting

**Labels:** `frontend`, `settings`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Add setting to choose week start day.

**Requirements:**
- [ ] Add toggle: Monday vs Sunday
- [ ] Save to profile preferences
- [ ] Used in heatmap and weekly stats

**Acceptance Criteria:**
- User can choose week start
- Heatmap reflects preference

---

### Issue: SET-003 - Data export (CSV)

**Labels:** `frontend`, `backend`, `P2`
**Milestone:** V1.0 Phase 3

**Description:**
Add ability to export habits and logs as CSV.

**Requirements:**
- [ ] Create `POST /api/settings/export` endpoint
- [ ] Generate CSV with habits and completion history
- [ ] Return download URL
- [ ] Add export button to settings

**Acceptance Criteria:**
- CSV downloads successfully
- Includes all habits and logs
- Proper date formatting

---

### Issue: SET-004 - Settings i18n

**Labels:** `i18n`, `P2`
**Milestone:** V1.0 Phase 3

**Description:**
Add translations for new settings options.

**Requirements:**
- [ ] Timezone setting labels
- [ ] Week start setting labels
- [ ] Export setting labels

---

## Epic 8: Testing & Quality

### Issue: QA-001 - E2E test: Create habit flow

**Labels:** `testing`, `e2e`, `P0`
**Milestone:** V1.0 Phase 3

**Description:**
Write Playwright test for creating a habit.

**Test Flow:**
1. Login
2. Navigate to /habits
3. Click "New Habit"
4. Fill form
5. Submit
6. Verify habit appears in list

---

### Issue: QA-002 - E2E test: Complete habit flow

**Labels:** `testing`, `e2e`, `P0`
**Milestone:** V1.0 Phase 3

**Description:**
Write Playwright test for completing a habit.

**Test Flow:**
1. Login (with existing habit)
2. Go to dashboard
3. Toggle habit checkbox
4. Verify streak updates
5. Refresh page
6. Verify state persisted

---

### Issue: QA-003 - E2E test: Dashboard load

**Labels:** `testing`, `e2e`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Write Playwright test for dashboard loading.

**Test Flow:**
1. Login
2. Navigate to dashboard
3. Verify all sections load
4. Verify no console errors

---

### Issue: QA-004 - Accessibility audit

**Labels:** `accessibility`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Run accessibility audit and fix issues.

**Requirements:**
- [ ] Run axe-core on all pages
- [ ] Fix any critical issues
- [ ] Verify keyboard navigation
- [ ] Test with screen reader

---

### Issue: QA-005 - Performance audit

**Labels:** `performance`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Run Lighthouse audit and optimize.

**Requirements:**
- [ ] Run Lighthouse on key pages
- [ ] Target: >90 performance score
- [ ] Optimize any slow queries
- [ ] Check bundle size

---

### Issue: QA-006 - Cross-browser testing

**Labels:** `testing`, `P2`
**Milestone:** V1.0 Phase 3

**Description:**
Test on major browsers.

**Browsers:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

### Issue: QA-007 - Mobile responsive testing

**Labels:** `testing`, `P1`
**Milestone:** V1.0 Phase 3

**Description:**
Test responsive layouts on mobile.

**Viewports:**
- [ ] 375px (iPhone SE)
- [ ] 390px (iPhone 14)
- [ ] 768px (iPad)
- [ ] 1024px+ (Desktop)

---

### Issue: QA-008 - Bug fixes

**Labels:** `bug`, `P0`
**Milestone:** V1.0 Phase 3

**Description:**
Fix bugs found during testing.

Track bugs as they're discovered and link to this issue.

---

## Labels to Create

```
P0 (critical)
P1 (important)
P2 (nice to have)
database
backend
frontend
api
component
page
testing
e2e
i18n
accessibility
performance
settings
bug
complex
```

## Milestones to Create

```
V1.0 Phase 1 - Database & APIs (Days 1-3)
V1.0 Phase 2 - Frontend (Days 4-8)
V1.0 Phase 3 - Testing & Polish (Days 9-11)
V1.0 Launch
```
