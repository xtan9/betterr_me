# BetterR.Me - Product Requirements Document (PRD)
## V1.1 - Final Scope & Strategy (Revised)

**Date:** February 2, 2026
**Status:** Final (Ready for Implementation)
**Version:** 1.1 (Revised based on Principal Engineer Review)
**Prepared by:** Staff Product Manager (Claude)
**Reviewed by:** Principal Product Engineer (Claude)

---

## REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2, 2026 | Staff PM | Initial PRD |
| 1.1 | Feb 2, 2026 | Principal Engineer | Technical fixes, added missing sections |
| 1.2 | Feb 3, 2026 | Product + Engineering | Added Mood Check-ins feature spec for V1.5 |

### Key Changes in V1.2
- Added new user persona: "The Self-Awareness Seeker"
- Added comprehensive Mood Check-ins feature specification for V1.5
- Added database schema, API routes, and components for Mood Check-ins
- Added therapist export functionality specification
- Added privacy considerations for mental health data
- Updated competitive positioning with mental health angle

### Key Changes in V1.1
- Fixed PostgreSQL schema syntax errors
- Added streak calculation rules with edge cases
- Defined JSONB frequency schema with TypeScript types
- Removed `linked_habit_id` from V1 scope (deferred to V1.5)
- Added performance optimization notes for dashboard
- Added empty state designs
- Defined edit past logs constraints (7-day window)
- Added rate limiting requirements
- Added Error Handling Strategy section
- Added Logging & Observability section
- Added Migration Strategy section
- Added Testing Strategy Details section
- Added Accessibility Requirements section

---

## 1. EXECUTIVE SUMMARY

BetterR.Me is a **daily operating system for self-improvement and productivity** that helps anyone become a better version of themselves through consistent habit building and task execution.

**Core Thesis:** Users will return daily (like opening HEVY before a workout or Oura for readiness scores) if we create an addictive daily ritual around tracking habits, seeing streaks, and visualizing progress.

**Primary Goals for V1.0:**
- Get users to open the app daily
- Keep users engaged past the critical 30-day drop-off threshold
- Build retention through visual feedback, streaks, and progress tracking
- Establish the habit + task combo as a daily ritual

---

## 2. MARKET CONTEXT

### Competitive Landscape
**The Good News:** The habit tracking market is fragmented. No clear winner.

| Competitor | Strength | Weakness | Audience |
|-----------|----------|----------|----------|
| **Habitica** | Gamification/community | Niche appeal (RPG-heavy) | Gamers |
| **Streaks** | Beautiful design | iOS-only | Apple devotees |
| **Loop** | Privacy-first, free | No engagement hooks | Privacy enthusiasts |
| **Habitify** | Most integrations + AI | Over-featured, less polished | Feature lovers |
| **Strides** | Goals + habit combo | Limited social features | Goal-setters |

**The Bad News:** 52% of users drop off within 30 days (across ALL habit apps)

### Market Opportunity
- **TAM (2026):** $14.94 billion globally
- **Key Gaps:**
  - Retention/engagement layer (nobody is winning here)
  - True AI personalization
  - Cross-platform excellence
  - Coaching integration (not just tracking)

**BetterR.Me's Competitive Edge:**
- Position as "AI-powered life coaching platform" (not just habit tracker)
- Retention-first design (optimize for daily ritual, not features)
- Cross-platform from day one (eventually)
- Connect habits to life outcomes (not isolated tracking)

---

## 3. PRODUCT VISION & VALUES

### Vision
"BetterR.Me is where users go every day to become the best version of themselves—through building consistent habits, executing on daily priorities, and seeing measurable progress toward their goals."

### User Personas

**Persona 1: The Consistency Builder**
- Goal: Build sustainable habits (meditation, exercise, reading)
- Motivation: Streaks, seeing long-term patterns
- Frequency: Daily, 2-3 minutes
- Example: "I want a 365-day meditation streak"

**Persona 2: The Productivity Warrior**
- Goal: Execute priorities and get work done
- Motivation: Completing tasks, clearing backlog
- Frequency: 2-3x daily
- Example: "I want to ship my best work every day"

**Persona 3: The Data Junkie**
- Goal: Track everything and understand patterns
- Motivation: Dashboard metrics, trends, insights
- Frequency: Daily + weekly reviews
- Example: "I want to know if better sleep correlates with productivity"

**Persona 4: The Self-Awareness Seeker** *(V1.5+)*
- Goal: Understand emotional patterns and triggers
- Motivation: Mental health improvement, therapy support
- Frequency: As-needed (during emotional moments) + weekly review
- Example: "I want to track when I feel anxious so I can discuss patterns with my therapist"
- Key need: Quick capture in the moment, exportable reports for healthcare providers

### Core Values
1. **Simplicity First** - No friction between intention and action
2. **Progress Visible** - Make it impossible to ignore your improvement
3. **Compassionate** - Streaks break; we don't shame users
4. **Multi-lingual** - Support EN, 中文, 繁體中文 equally

---

## 4. V1.0 MUST HAVE (Lean, Retention-Focused Scope)

### 4.1 HABIT SYSTEM

**Create Habit:**
- Name (required), description (optional)
- Category: Health, Wellness, Learning, Productivity, Other
- Frequency: Daily, Mon-Fri, 3x/week, 2x/week, Weekly, Custom days
- Status: Active, Paused, Archived

**Habit Tracking:**
- 1-click toggle from dashboard to log completion for today
- Edit past logs (add missed days, undo mistakes) - **Limited to 7 days back**
- View habit detail page with:
  - Current streak + personal best streak
  - Completion percentage (this week, this month, all-time)
  - 30-day calendar heatmap (green = done, gray = missed)

**Key UX Principle:** Zero friction. Checking off a habit should be 1 tap from dashboard.

### 4.2 TASK SYSTEM

**Create Task:**
- Title (required), description (optional)
- Priority: Low, Medium, High, Urgent
- Due date (required), due time (optional)
- Status: Not started, In progress, Completed
- Category: Work, Personal, Shopping, Other (optional)

**Task Management:**
- View all tasks with filter/sort by priority, due date, status
- Mark complete, snooze, delete
- Today's view showing tasks due today
- Quick stats: X/Y tasks completed today

**Task Sorting Rules (when due_time is optional):**
1. Tasks with due_time sort before tasks without (for same due_date)
2. Tasks without due_time are treated as "all-day" and appear after timed tasks
3. Secondary sort: Priority (Urgent > High > Medium > Low)

**Note:** Recurring tasks deferred to V1.5 (don't block MVP)

### 4.3 DAILY DASHBOARD (The Hero Feature)

```
┌──────────────────────────────────────────────────────┐
│ Good Morning, Alex! Let's build consistency today    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  TODAY'S SNAPSHOT                                    │
│  * Habits: 3/7 completed (43%) +15% vs yesterday    │
│  * Tasks: 2/5 completed (40%)                        │
│  * Best streak: Reading (45 days)                    │
│                                                      │
│  CHECK OFF YOUR HABITS                               │
│  [ ] Meditate 10 min (Wellness) [Streak: 23 days]   │
│  [ ] Exercise 30 min (Health) [Streak: 8 days]      │
│  [x] Read 20 pages (Learning) [Streak: 45 days]     │
│  [... more habits, 1-click to toggle]               │
│                                                      │
│  TODAY'S TASKS                                       │
│  [!] Finish project proposal [Due 5 PM]             │
│  [.] Team standup [Due 10 AM] Done                  │
│  [-] Grocery shopping                                │
│  [... more tasks]                                    │
│                                                      │
│  MOTIVATION                                          │
│  You're 2 habits away from 100% today!              │
│  Keep the reading streak alive!                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Key Elements:**
- Greeting with time-based message
- Progress vs yesterday (creates daily comparison habit)
- All habits visible in one view with 1-click toggle
- Streak counter prominent (psychologically addictive)
- Motivational message (celebrate progress, encourage streaks)
- All tasks visible with quick status

**Empty State Designs:**

| State | Display |
|-------|---------|
| No habits | "Start your journey! Add your first habit to begin tracking." + CTA button |
| No tasks | "All clear! Add a task to stay productive." + CTA button |
| New user (Day 1) | Welcome message, skip "vs yesterday" comparison, show onboarding tips |
| All habits complete | "Perfect day! You've completed all your habits." + celebration animation |
| Zero streaks | "Every streak starts at 1. Complete a habit today!" (encouraging, not shaming) |

**"vs Yesterday" Edge Cases:**
- **Day 1 user:** Hide comparison, show "Your first day! Let's make it count."
- **No habits yesterday:** Show absolute numbers only, no percentage change
- **Different habit count:** Compare completion rates, not absolute numbers
- **Weekend vs weekday:** Only compare habits that were due on both days

### 4.4 SETTINGS & PREFERENCES
- Timezone (critical for date tracking)
- Date format (MM/DD/YYYY vs DD/MM/YYYY)
- Week start day (Monday vs Sunday)
- Theme (Light/Dark/System)
- Language (English, 中文, 繁體中文)
- Data export (CSV of habits + tasks)

### 4.5 INTERNATIONALIZATION (i18n)
- English (en)
- Simplified Chinese (zh)
- Traditional Chinese (zh-TW)

All dashboard strings, habit categories, and UI elements translated across three languages.

---

## 5. V1.0 EXPLICITLY OUT OF SCOPE

These are deferred to V1.5+:

- Habit templates library (V1.5)
- Notifications/reminders (V1.5)
- Weekly analytics dashboard (V1.5 - minimum version only)
- Recurring tasks (V1.5)
- Habit category customization (V1.5)
- **Habit-task linking (V1.5)** - Originally planned, deferred for scope
- **Mood Check-ins (V1.5)** - Mental health tracking with therapist export (see Section 27)
- Leaderboards/comparison (V2)
- Daily score/consistency index (V2)
- Health data integrations (V2+ - requires mobile apps)
- Workout tracking (V2+)
- AI suggestions (V3+)
- Native mobile apps (V2+)
- **Offline support (V1.5)** - Explicitly deferred, revisit based on user feedback

**Rationale:** V1 focus is on retention mechanics, not features. Ship lean, measure what works, iterate based on user data.

---

## 6. STREAK CALCULATION RULES

### 6.1 Core Streak Logic

A **streak** is the number of consecutive scheduled occurrences where a habit was completed.

**Key Principle:** Streaks are calculated based on *scheduled days*, not calendar days.

### 6.2 Calculation by Frequency Type

| Frequency | Streak Increment Rule | Streak Break Rule |
|-----------|----------------------|-------------------|
| **Daily** | +1 for each consecutive day completed | Miss any day |
| **Weekdays (Mon-Fri)** | +1 for each weekday completed | Miss any weekday (weekends ignored) |
| **Weekly** | +1 for each week with at least 1 completion | Full week passes with 0 completions |
| **3x/week** | +1 for each week meeting 3+ completions | Week ends with <3 completions |
| **2x/week** | +1 for each week meeting 2+ completions | Week ends with <2 completions |
| **Custom days** | +1 for each scheduled day completed | Miss any scheduled day |

### 6.3 Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Future date logging** | Rejected by API. Cannot log habits for future dates. |
| **Habit created mid-week** | Streak starts from creation date. Prior days not counted as missed. |
| **Paused habit** | Streak is **frozen** (preserved). Days while paused don't count as missed. |
| **Resumed habit** | Streak continues from where it left off. First day back must be completed to maintain. |
| **Archived habit** | Streak is preserved for historical display. Cannot be modified. |
| **Timezone change** | Habit logs use user's current timezone. Historical logs not retroactively adjusted. |
| **Edit past log (within 7 days)** | Streak recalculated. Can restore a broken streak if log was missed by mistake. |
| **Edit past log (>7 days)** | Not allowed. Returns 403 error. |

### 6.4 Streak Calculation Algorithm

```typescript
function calculateStreak(habitId: string, userId: string): number {
  const habit = getHabit(habitId);
  const logs = getHabitLogs(habitId, { order: 'desc' });
  const scheduledDays = getScheduledDays(habit.frequency, habit.created_at);

  let streak = 0;
  let currentDate = today();

  // Skip today if not yet completed (still has time)
  if (!isCompletedToday(logs)) {
    currentDate = yesterday();
  }

  for (const scheduledDay of scheduledDays) {
    if (scheduledDay > currentDate) continue; // Skip future
    if (scheduledDay < habit.created_at) break; // Stop at habit creation

    // Check if habit was paused on this day
    if (wasHabitPaused(habit, scheduledDay)) continue; // Skip paused days

    const log = logs.find(l => l.logged_date === scheduledDay);
    if (log?.completed) {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}
```

### 6.5 Best Streak Tracking

- Best streak is stored as a denormalized field on the `habits` table
- Updated whenever current streak exceeds best streak
- Displayed on habit detail page
- Never decreases (historical record)

---

## 7. DATABASE SCHEMA

### 7.1 New Tables

```sql
-- ============================================
-- HABITS TABLE
-- ============================================
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('health', 'wellness', 'learning', 'productivity', 'other')),
  frequency JSONB NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  best_streak INTEGER DEFAULT 0,
  paused_at TIMESTAMP,  -- Track when habit was paused for streak calculation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes (separate statements for PostgreSQL)
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_status ON habits(user_id, status);

-- ============================================
-- HABIT LOGS TABLE
-- ============================================
CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (habit_id, logged_date)
);

-- Indexes
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, logged_date);
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, logged_date);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to habits table
CREATE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to habit_logs table
CREATE TRIGGER update_habit_logs_updated_at
  BEFORE UPDATE ON habit_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

-- Habits policies
CREATE POLICY habits_select ON habits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY habits_insert ON habits
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY habits_update ON habits
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY habits_delete ON habits
  FOR DELETE USING (user_id = auth.uid());

-- Habit logs policies
CREATE POLICY habit_logs_select ON habit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY habit_logs_insert ON habit_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY habit_logs_update ON habit_logs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY habit_logs_delete ON habit_logs
  FOR DELETE USING (user_id = auth.uid());
```

### 7.2 Tasks Table Update

```sql
-- Add category column to existing tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN ('work', 'personal', 'shopping', 'other'));

-- NOTE: linked_habit_id deferred to V1.5
```

### 7.3 JSONB Frequency Schema

**TypeScript Type Definition:**

```typescript
// Frequency type definitions for habit scheduling
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday

type HabitFrequency =
  | { type: 'daily' }
  | { type: 'weekdays' }  // Mon-Fri (days 1-5)
  | { type: 'weekly' }    // Once per week (any day counts)
  | { type: 'times_per_week'; count: 2 | 3 }  // X times per week
  | { type: 'custom'; days: DayOfWeek[] };    // Specific days

// Examples:
// Daily:        { "type": "daily" }
// Weekdays:     { "type": "weekdays" }
// Weekly:       { "type": "weekly" }
// 3x/week:      { "type": "times_per_week", "count": 3 }
// Mon/Wed/Fri:  { "type": "custom", "days": [1, 3, 5] }
```

**Zod Validation Schema:**

```typescript
import { z } from 'zod';

const DayOfWeekSchema = z.union([
  z.literal(0), z.literal(1), z.literal(2),
  z.literal(3), z.literal(4), z.literal(5), z.literal(6)
]);

export const HabitFrequencySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('weekdays') }),
  z.object({ type: z.literal('weekly') }),
  z.object({
    type: z.literal('times_per_week'),
    count: z.union([z.literal(2), z.literal(3)])
  }),
  z.object({
    type: z.literal('custom'),
    days: z.array(DayOfWeekSchema).min(1).max(7)
  }),
]);
```

---

## 8. API ROUTES (REST)

### 8.1 Habits Endpoints

```
GET    /api/habits
       Query params: ?status=active|paused|archived
       Response: List of habits for current user
       Rate limit: 100/min

POST   /api/habits
       Body: { name, description, category, frequency, status }
       Response: Created habit
       Rate limit: 30/min

GET    /api/habits/[id]
       Response: Habit detail (but NOT logs - separate endpoint)
       Rate limit: 100/min

PATCH  /api/habits/[id]
       Body: { name, description, category, frequency, status }
       Response: Updated habit
       Rate limit: 30/min

DELETE /api/habits/[id]
       Response: 204 No Content
       Rate limit: 30/min

POST   /api/habits/[id]/toggle
       Body: { logged_date: "2026-02-02" }
       Response: { completed: true, streak: 23 }
       Action: Create/update habit_log for given date
       Special: Toggling again on same date deletes the log (undo behavior)
       Validation:
         - logged_date must not be in the future
         - logged_date must be within 7 days of today
       Rate limit: 60/min

GET    /api/habits/[id]/stats
       Response: {
         current_streak: 23,
         best_streak: 67,
         completion_percentage: 87,
         completion_this_week: 5,
         completion_this_month: 26,
         completion_all_time: 187,
         total_days_tracked: 215
       }
       Rate limit: 100/min

GET    /api/habits/[id]/logs
       Query params: ?days=30 (last N days, max 90)
       Response: Array of { logged_date, completed }
       Used for: 30-day heatmap
       Rate limit: 100/min
```

### 8.2 Tasks Endpoints

```
GET    /api/tasks
       Query params: ?status=&priority=&due_date=&category=&sort=
       Sort options: due_date_asc, due_date_desc, priority_desc, created_at_desc
       Response: List of tasks
       Rate limit: 100/min

POST   /api/tasks
       Body: { title, description, priority, due_date, due_time, category }
       Response: Created task
       Rate limit: 30/min

GET    /api/tasks/[id]
       Response: Task detail
       Rate limit: 100/min

PATCH  /api/tasks/[id]
       Body: Partial task fields
       Response: Updated task
       Rate limit: 30/min

DELETE /api/tasks/[id]
       Response: 204 No Content
       Rate limit: 30/min

POST   /api/tasks/[id]/complete
       Response: { status: "completed", completed_at: "2026-02-02T14:30:00Z" }
       Action: Mark task as completed with timestamp
       Rate limit: 60/min
```

### 8.3 Dashboard Endpoints

```
GET    /api/dashboard/today
       Response: {
         user: { name, timezone },
         habits_today: { completed: 3, total: 7, percentage: 43 },
         habits_yesterday: { completed: 2, total: 7, percentage: 29 } | null,
         tasks_today: { completed: 2, total: 5, percentage: 40 },
         top_streaks: [
           { habit_id, name, streak: 45 },
           ...
         ],
         habits_list: [{ id, name, category, streak, completed_today, frequency }],
         tasks_list: [{ id, title, priority, due_time, status, category }],
         is_first_day: boolean,
         motivational_message: string
       }
       Rate limit: 60/min

       Performance notes:
       - Use single query with JOINs for habits + today's logs
       - Cache top_streaks (5 min TTL)
       - Limit habits_list to active habits only
       - Limit tasks_list to today's tasks + overdue
```

### 8.4 Settings Endpoints

```
GET    /api/settings
       Response: User preferences (timezone, theme, language, etc.)
       Rate limit: 100/min

PATCH  /api/settings
       Body: { timezone, date_format, week_start_day, theme, language }
       Response: Updated settings
       Rate limit: 30/min

POST   /api/settings/export
       Response: { export_url: "...", expires_at: "..." }
       Action: Generate CSV export (async for large datasets)
       Rate limit: 5/hour
       Max records: 10,000 per export
```

**All endpoints require authentication. All data scoped to current user via middleware + RLS.**

---

## 9. FRONTEND COMPONENTS (React)

### 9.1 Pages

1. **`/dashboard`** (Server component)
   - Daily dashboard (hero feature)
   - Calls `/api/dashboard/today`
   - Displays habits, tasks, stats

2. **`/habits`** (Client component)
   - List all habits with filter (active/paused/archived)
   - Quick action: create, pause, archive
   - Links to habit detail

3. **`/habits/[id]`** (Client component)
   - Habit detail: current streak, best streak, completion %
   - 30-day heatmap (calendar view)
   - Edit button
   - Edit past logs (within 7-day window)

4. **`/habits/new`** (Client component)
   - Create new habit form

5. **`/tasks`** (Client component)
   - All tasks with filter (by priority, due date, status, category)
   - Quick actions: create, mark complete, delete, snooze
   - Today's priority view

6. **`/settings`** (Client component)
   - Timezone, date format, week start day
   - Theme toggle
   - Language selector
   - Data export button

### 9.2 Components (Shared UI)

**Habit-Specific:**
- `HabitForm` - Create/edit habit
- `HabitCard` - Display individual habit (name, streak, toggle button)
- `HabitList` - Grid/list of habits with filter controls
- `HabitDetail` - Full habit view with stats and heatmap
- `Heatmap30Day` - 30-day calendar visualization (green/gray)
- `StreakCounter` - Display current and best streak (large, prominent)
- `HabitEmptyState` - Encouraging message + CTA when no habits

**Task-Specific:**
- `TaskForm` - Create/edit task
- `TaskCard` - Display individual task with priority indicator
- `TaskList` - Filter/sort interface for tasks
- `TaskEmptyState` - Encouraging message + CTA when no tasks

**Dashboard:**
- `DailySnapshot` - Quick stats section
- `HabitChecklist` - All habits with 1-click toggle
- `TasksToday` - Priority tasks section
- `MotivationMessage` - Contextual encouragement
- `WelcomeMessage` - Time-based greeting
- `FirstDayOnboarding` - Tips for new users

**Shared:**
- Updated `Navbar` (add Habits link)
- `LoadingState` - Skeleton loaders for async content
- `ErrorState` - User-friendly error display with retry
- `ConfirmDialog` - For destructive actions (delete, archive)

---

## 10. RETENTION MECHANICS (Core Strategy)

### Hook 1: Daily Opening (Ritual)
- Dashboard greets by time of day ("Good Morning", "Good Afternoon", etc.)
- Shows comparison vs yesterday (+15% today vs yesterday)
- Streaks are visually prominent
- Motivational message tailored to progress

### Hook 2: Quick Wins (Dopamine Loop)
- 1-click habit completion from dashboard (zero friction)
- Instant visual feedback (checkbox fills, streak updates)
- Celebration on perfect day ("You've completed all habits today!")

### Hook 3: Streaks (Loss Aversion)
- Streak counter is LARGE and prominent
- 30-day heatmap shows consistency visually
- Psychological: "I can't break my 45-day reading streak"
- Visual red/yellow warning when streak at risk (V1.5)

### Hook 4: Visual Progress (Data Addiction)
- Completion % vs yesterday shown daily
- Weekly stats showing completion trends
- 30-day heatmap is satisfying (sea of green)
- Insights: "You're most productive on Thursdays" (V1.5+)

### Hook 5: Daily Completion Addiction
- Finishing all habits/tasks creates psychological reward
- "You completed 100% today!" celebration
- Builds into a ritual: "I must complete everything today"

---

## 11. ERROR HANDLING STRATEGY

### 11.1 Error Response Format

All API errors return consistent JSON:

```typescript
interface ApiError {
  error: {
    code: string;        // Machine-readable code
    message: string;     // User-friendly message
    details?: object;    // Additional context (validation errors, etc.)
  };
  status: number;        // HTTP status code
}
```

### 11.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for this resource |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `FUTURE_DATE` | 400 | Cannot log habit for future date |
| `EDIT_WINDOW_EXCEEDED` | 403 | Cannot edit logs older than 7 days |

### 11.3 Frontend Error Handling

| Scenario | User Experience |
|----------|-----------------|
| Network error | Toast: "Connection lost. Your changes will sync when back online." (V1.5) / "Connection error. Please try again." (V1.0) |
| 401 Unauthorized | Redirect to login page |
| 403 Forbidden | Toast: "You don't have permission to do that." |
| 404 Not Found | Show friendly 404 page with navigation back |
| 429 Rate Limited | Toast: "Slow down! Please wait a moment before trying again." |
| 500 Server Error | Toast: "Something went wrong. Please try again." + Log to Sentry |
| Validation Error | Inline field errors on forms |

### 11.4 Retry Strategy

- **Idempotent requests (GET):** Auto-retry 3x with exponential backoff (1s, 2s, 4s)
- **Mutations (POST/PATCH/DELETE):** No auto-retry, show error to user
- **Toggle habit:** Optimistic update, revert on failure with toast

---

## 12. LOGGING & OBSERVABILITY

### 12.1 Error Tracking

**Tool:** Sentry (already integrated in Next.js ecosystem)

**Captured:**
- All unhandled exceptions
- API errors (500s, 4xx patterns)
- Client-side errors
- Performance metrics

**Configuration:**
```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,  // 10% of transactions
  environment: process.env.NODE_ENV,
});
```

### 12.2 Analytics

**Tool:** PostHog (privacy-friendly, self-hostable)

**Key Events:**
| Event | Properties | Purpose |
|-------|------------|---------|
| `habit_created` | category, frequency_type | Understand habit patterns |
| `habit_completed` | habit_id, streak_length | Measure engagement |
| `streak_broken` | habit_id, streak_length | Identify drop-off points |
| `dashboard_viewed` | habits_count, tasks_count | DAU tracking |
| `onboarding_completed` | step_count, duration | Funnel analysis |
| `export_requested` | record_count | Feature usage |

### 12.3 Application Logging

**Levels:**
- `error`: Exceptions, failed operations
- `warn`: Deprecated usage, near-limit conditions
- `info`: API requests, user actions
- `debug`: Detailed debugging (dev only)

**Format:**
```json
{
  "timestamp": "2026-02-02T10:30:00Z",
  "level": "info",
  "message": "Habit toggled",
  "userId": "uuid",
  "habitId": "uuid",
  "action": "complete",
  "streak": 23
}
```

---

## 13. MIGRATION STRATEGY

### 13.1 Database Migrations

**Tool:** Supabase Migrations (SQL files in `supabase/migrations/`)

**Migration Order:**
1. `001_create_habits_table.sql` - Create habits table with indexes
2. `002_create_habit_logs_table.sql` - Create habit_logs table with indexes
3. `003_add_rls_policies.sql` - Enable RLS and create policies
4. `004_add_triggers.sql` - Add updated_at triggers
5. `005_alter_tasks_add_category.sql` - Add category to tasks

**Rollback Strategy:**
- Each migration has corresponding `down` migration
- Test rollbacks in staging before production
- Keep migrations small and focused

### 13.2 Data Migration (Existing Users)

For V1.0 launch:
- No existing habit data to migrate
- Tasks table alteration is additive (new column with NULL default)
- No data transformation required

### 13.3 Zero-Downtime Deployment

1. Run migrations (additive changes only)
2. Deploy new code (handles both old and new schema)
3. Backfill data if needed (async job)
4. Remove old code paths in next release

---

## 14. TESTING STRATEGY

### 14.1 Test Coverage Targets

| Layer | Target | Focus |
|-------|--------|-------|
| Unit Tests | 80% | Business logic, utilities, streak calculation |
| Integration Tests | 70% | API routes, database operations |
| E2E Tests | Critical paths | Auth, habit CRUD, dashboard load |

### 14.2 Test Types

**Unit Tests (Vitest):**
- Streak calculation algorithm
- Frequency scheduling logic
- Date/timezone utilities
- Validation schemas
- React component rendering

**Integration Tests (Vitest + Supabase):**
- API route handlers
- Database queries
- RLS policy enforcement
- Rate limiting

**E2E Tests (Playwright):**
- User registration/login
- Create first habit
- Complete habit from dashboard
- View streak update
- Settings changes persist

### 14.3 Test Data

**Fixtures:**
- `testUser` - Standard authenticated user
- `testHabits` - Set of habits with various frequencies
- `testLogs` - Historical logs for streak testing
- `testTasks` - Tasks with various priorities/dates

**Factories:**
```typescript
// test/factories/habit.ts
export const createHabit = (overrides?: Partial<Habit>): Habit => ({
  id: randomUUID(),
  user_id: testUser.id,
  name: 'Test Habit',
  frequency: { type: 'daily' },
  status: 'active',
  ...overrides,
});
```

### 14.4 CI/CD Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm test:e2e
      - run: pnpm test:coverage
        # Fail if coverage < 80%
```

---

## 15. ACCESSIBILITY REQUIREMENTS

### 15.1 Compliance Target

**WCAG 2.1 Level AA**

### 15.2 Key Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Keyboard Navigation** | All interactive elements focusable, logical tab order |
| **Screen Reader Support** | Semantic HTML, ARIA labels on icons, live regions for updates |
| **Color Contrast** | 4.5:1 minimum for text, 3:1 for UI components |
| **Focus Indicators** | Visible focus rings on all interactive elements |
| **Text Scaling** | UI functional at 200% zoom |
| **Motion Preferences** | Respect `prefers-reduced-motion` |
| **Error Identification** | Form errors linked to fields, announced by screen readers |

### 15.3 Component-Specific Requirements

**Habit Toggle:**
- `role="checkbox"` with `aria-checked`
- `aria-label="Mark [habit name] as complete"`
- Keyboard: Space/Enter to toggle

**Streak Counter:**
- `aria-live="polite"` for updates
- Text alternative: "Current streak: 23 days"

**Heatmap:**
- Not just color-dependent (pattern/icon for completed)
- Keyboard navigable cells
- Screen reader: "February 1st: completed" / "February 2nd: not completed"

**Dashboard:**
- Landmark regions (`main`, `nav`, `complementary`)
- Heading hierarchy (h1 for greeting, h2 for sections)
- Skip link to main content

### 15.4 Testing

- Automated: axe-core in Vitest component tests
- Manual: VoiceOver (Mac), NVDA (Windows) testing
- Keyboard-only navigation testing

---

## 16. USER FLOWS

### Onboarding Flow (5 minutes)
1. Sign up / Login
2. Set basic preferences (timezone, theme, language)
3. Create first habit (e.g., "Meditate 10 min")
4. Create first task (e.g., "Check email")
5. See dashboard with habit + task
6. Check off habit -> see streak appear
7. Mark task complete -> see dashboard update
8. Done! User now has first-day momentum

### Daily Usage Flow (2-3 minutes)
1. Open app -> See dashboard
2. Check off completed habits (1-click each)
3. Mark priority tasks done / adjust priorities
4. (Optional) View streaks / weekly stats
5. Come back tomorrow

### Weekly Reflection Flow (5 minutes, optional)
1. View weekly overview (completion rates, trends)
2. Review which habits are thriving vs struggling
3. Adjust next week's focus
4. (V1.5+) Get AI suggestion to add/pause a habit

---

## 17. SUCCESS METRICS

### Engagement (Daily/Weekly)
- **DAU (Daily Active Users)** - Target: 50% of signups
- **Retention:** Day 1 (90%), Day 3 (60%), Day 7 (45%), Day 30 (25%)
- **Session duration:** 2-3 minutes average
- **Sessions per day:** 1-2 (morning check, evening review)

### Habit-Specific
- **Habits per user:** 4-7 average
- **Habit completion rate:** 70%+ on active habits
- **Average streak length:** 20+ days
- **Habit abandonment rate:** <20% of created habits paused/deleted

### Task-Specific
- **Tasks per user per day:** 3-5
- **Task completion rate:** 75%+
- **Time to completion:** <2 days average

### Product Health
- **Crash-free sessions:** >99%
- **Page load time:** <2 seconds
- **Error rate:** <0.1%
- **Accessibility score:** 90+ (Lighthouse)

### Retention Drivers (A/B Testing Candidates)
- Impact of streak counter on retention
- Impact of daily comparison (vs yesterday) on retention
- Impact of celebration messages on retention
- Impact of 30-day heatmap visualization on retention

---

## 18. IMPLEMENTATION ROADMAP

### Phase 1: Database & Backend (Week 1)
- [ ] Create database migrations (habits, habit_logs tables)
- [ ] Implement database utility functions (`lib/db/habits.ts`, `lib/db/habit_logs.ts`)
- [ ] Build all API routes (GET/POST/PATCH/DELETE /habits, etc.)
- [ ] Write comprehensive API tests
- [ ] Implement RLS policies (security)
- [ ] Set up Sentry error tracking

**Deliverable:** Full backend ready for frontend integration

**Priority Order:**
1. Database migrations (day 1)
2. Dashboard endpoint (critical path for Week 2)
3. Habit CRUD endpoints
4. Habit toggle + stats endpoints
5. Tests throughout

### Phase 2: Frontend Components (Week 2)
- [ ] Create habit management pages and components
- [ ] Build 30-day heatmap visualization
- [ ] Create daily dashboard with habits + tasks
- [ ] Update settings page (timezone, language)
- [ ] Integrate with API (client-side hooks)
- [ ] Implement empty states

**Deliverable:** UI complete, wired to backend

### Phase 3: Onboarding & Refinement (Days 11-14)
- [ ] Design/build onboarding flow (5-minute first experience)
- [ ] Refinement based on testing
- [ ] Performance optimization
- [ ] Cross-browser testing

**Deliverable:** Ready for beta launch

### Phase 4: Testing & Quality (Week 3)
- [ ] Comprehensive test coverage (>80%)
- [ ] Manual testing on desktop + mobile
- [ ] Accessibility audit
- [ ] Performance profiling
- [ ] Security review

**Deliverable:** V1.0 ready for production launch

---

## 19. V1.5+ ROADMAP (Defer to Phase 2)

### V1.5 (2 weeks after V1 launch)
- Habit templates library (50+ pre-built habits)
- Basic notifications/reminders (in-app)
- Improved settings UI
- Weekly stats dashboard (simple version)
- Habit-task linking
- Offline support (basic)
- **Mood Check-ins** - Quick emotional logging with therapist export (see Section 27)
- Bug fixes from user feedback

### V2.0 (Month 2 after V1)
- Native iOS + Android apps (React Native or native)
- Health data integrations (Apple Health, Google Fit)
- Anonymous leaderboards ("Better than 73% of users")
- Daily score / Consistency index
- Advanced analytics

### V3.0+ (Month 3+)
- AI-powered habit suggestions
- Wearable integration (Oura Ring)
- Goals system (connect habits to larger outcomes)
- Journal/reflection entries
- Coaching integration

---

## 20. TECHNOLOGY STACK (No Changes from Existing)

**Frontend:**
- Next.js 15.5.8 with React 19 (RSCs)
- Tailwind CSS + shadcn/ui (46 components)
- React Hook Form + Zod validation
- next-intl for i18n

**Backend:**
- Supabase (PostgreSQL + Auth)
- Node.js / TypeScript

**Observability:**
- Sentry (error tracking)
- PostHog (analytics)

**Testing:**
- Vitest + React Testing Library
- Playwright (E2E)
- axe-core (accessibility)

**Deployment:**
- Vercel (frontend)
- Supabase (backend/DB)

---

## 21. KEY STRATEGIC DECISIONS

### Decision 1: Lean V1 Scope
**Why:** Retention is driven by daily ritual, not features. Shipping fast enables data collection. 52% drop-off happens regardless of feature count.

### Decision 2: Retention-First, Not Feature-First
**Why:** Competitors fail because they optimize for feature count. We optimize for "Will this get users to open the app tomorrow?"

### Decision 3: Defer Mobile Apps to V2
**Why:** Web works on mobile browsers. Native apps don't unlock new core value in V1. Build desktop-first, optimize mobile web UX.

### Decision 4: No Leaderboards in V1
**Why:** Social comparison can feel toxic. Better to establish individual streaks first, then layer social later with care.

### Decision 5: Defer Notifications to V1.5
**Why:** Can still drive high engagement without push notifications. V1.5 adds them once we understand optimal timing from data.

### Decision 6: Defer AI to V3
**Why:** V1-2 collect data. V3 uses that data for personalization. Premature personalization = poor recommendations.

### Decision 7: 7-Day Edit Window for Logs
**Why:** Balance between allowing mistake corrections and preventing system gaming. Users can fix yesterday's forgotten log, but can't retroactively build fake streaks.

### Decision 8: Defer Habit-Task Linking to V1.5
**Why:** Added complexity without clear user value in V1. Focus on core habit + task flows first, then explore connections.

---

## 22. COMPETITIVE POSITIONING

**BetterR.Me's Edge:**

| Dimension | BetterR.Me | Habitica | Streaks | Loop | Habitify |
|-----------|-----------|---------|---------|------|----------|
| **Simplicity** | +++++ | +++ | +++++ | +++++ | ++++ |
| **Habits + Tasks** | +++++ | +++++ | ++++ | +++ | ++++ |
| **Design** | ++++ | +++ | +++++ | ++++ | ++++ |
| **Retention** | +++++ | ++++ | +++ | +++ | +++ |
| **Cross-Platform** | ++++ | ++++ | ++ | +++ | ++++ |
| **AI/Personalization** | ++ | + | + | + | +++ |
| **Multilingual** | +++++ | +++ | ++ | ++ | +++ |
| **Accessibility** | ++++ | ++ | +++ | +++ | +++ |

**Winning Formula:**
- Simplicity of Streaks + Design polish
- Retention focus of Habitica (without RPG niche)
- Cross-platform of Habitify
- Multilingual support (advantage in APAC)
- Accessibility-first (underserved market)
- **Mental health integration (V1.5+)** - Bridge between self-tracking and professional care
- Coaching integration eventually (unique)

---

## 23. RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| **30-day drop-off** | Retention metrics dashboard, A/B test onboarding, early user interviews |
| **Over-scoping** | Stick to V1 scope, defer templates/notifications, lock feature list now |
| **Performance issues** | Database indexes, API caching, optimize dashboard query |
| **Users overwhelm with too many habits** | UI suggests max 5-7 habits (V1), capacity warning in V2+ |
| **Streak resets discourage users** | Compassionate messaging, allow editing past logs (7 days), no shame |
| **Low engagement with tasks** | Make task completion as rewarding as habits (celebrations, streaks) |
| **Privacy concerns** | Transparent privacy policy, RLS policies, local storage option (V2+) |
| **Accessibility lawsuits** | WCAG 2.1 AA compliance, regular audits |

---

## 24. GO-TO-MARKET & LAUNCH

### Pre-Launch (Week 3-4)
- Beta testing with 50-100 early users
- Gather feedback on retention (Day 3, 7, 14, 30)
- Iterate based on feedback
- Prepare marketing (Product Hunt, Reddit, content)

### Launch Week
- Submit to Product Hunt
- Social media campaign
- Reddit launch posts (r/productivity, r/getdisciplined)
- Email outreach to habit tracking communities
- Partner outreach (coaches, therapists, wellness programs)

### Post-Launch (Week 1-4)
- Monitor retention metrics daily
- Fix bugs reported by users
- Gather qualitative feedback
- Plan V1.5 based on user requests

---

## 25. FINAL SCOPE SUMMARY

### V1.0 (What We're Building)

**Features:**
- Habit creation + completion tracking
- Daily/weekly/custom habit frequency
- Habit streaks (current + best)
- 30-day heatmap visualization
- Task creation + management
- Daily dashboard with habits + tasks
- Completion % tracking (vs yesterday)
- Settings (timezone, theme, language)
- Internationalization (EN, 中文, 繁體中文)
- Authentication (already exists)
- Error tracking (Sentry)
- Analytics (PostHog)

**NOT Building:**
- Habit templates
- Notifications
- Recurring tasks
- Health integrations
- Leaderboards
- AI suggestions
- Native mobile apps
- Advanced analytics
- Habit-task linking
- Offline support

**Database:**
- `habits` table
- `habit_logs` table
- Updated `tasks` table (add category only)

**API:**
- 8 habit endpoints
- 6 task endpoints
- 1 dashboard endpoint
- 2 settings endpoints
- All authenticated + tested + rate-limited

**Frontend:**
- Dashboard page (refactored)
- Habits page + components
- Habit detail page
- Tasks refinement
- Settings updates
- Empty states
- Error states
- i18n throughout

---

## 26. WHAT SUCCESS LOOKS LIKE

### By End of Week 1 (Launch)
- V1.0 shipped to production
- 0 critical bugs
- >80% test coverage
- Sentry + PostHog configured

### By End of Week 2-3 (Post-Launch)
- 1,000+ signups
- 90%+ Day 1 retention
- 60%+ Day 3 retention
- Positive user feedback on onboarding

### By End of Month (V1 Stable)
- 5,000+ signups
- 25%+ Day 30 retention (industry avg ~15%)
- Clear patterns on which habits stick
- Feature request list for V1.5

### By Month 2 (V1.5 Launch)
- Habit templates + notifications shipped
- Retention improved to 30%+ Day 30
- Ready to plan mobile apps

---

## 27. MOOD CHECK-INS (V1.5 Feature Specification)

### 27.1 Overview

**Purpose:** Enable users to quickly capture emotional states and physical sensations in the moment, creating a log that can be reviewed personally or shared with mental health professionals.

**Key Insight:** Most journaling apps expect reflection time. Mood Check-ins are designed for *real-time emotional capture* - when you're feeling anxious with a tight chest, you want to log it in <30 seconds, not write a journal entry.

**Target Persona:** The Self-Awareness Seeker (Persona 4)

### 27.2 User Stories

1. **As a user experiencing anxiety**, I want to quickly log my stress level and physical sensations so I can track patterns over time.

2. **As a therapy client**, I want to export my mood logs as a report so I can share specific incidents with my therapist instead of trying to remember them.

3. **As a self-aware individual**, I want to see correlations between my habits and my mood so I can understand what helps me feel better.

### 27.3 Feature Specification

**Quick Check-in Flow:**

```
┌──────────────────────────────────────────────────────┐
│  How are you feeling right now?                      │
│                                                      │
│  Stress Level                                        │
│  [1]   [2]   [3]   [4]   [5]                        │
│  Calm              Overwhelmed                       │
│                                                      │
│  What's going on? (optional)                         │
│  ┌────────────────────────────────────────────────┐ │
│  │ Tight chest, anxious about tomorrow's meeting  │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Body sensations (tap to select)                    │
│  [Tight chest] [Racing heart] [Tense shoulders]    │
│  [Headache] [Fatigue] [Restless] [Nausea]         │
│  [Shortness of breath] [+ Add custom]              │
│                                                      │
│                    [Save Check-in]                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Design Principles:**
- **<30 second capture** - Stress level is required, everything else optional
- **Pre-built body tags** - Faster than typing, consistent for analysis
- **No streaks** - Mental health should not be gamified
- **Compassionate tone** - "It's okay to not be okay"
- **Private by default** - Data never leaves device without explicit export

### 27.4 Database Schema (V1.5)

```sql
-- ============================================
-- MOOD CHECK-INS TABLE
-- ============================================
CREATE TABLE mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stress_level INTEGER NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  note TEXT,
  body_sensations TEXT[],  -- Array of tags: ['tight_chest', 'racing_heart']
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  -- When the feeling occurred
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_mood_checkins_user_id ON mood_checkins(user_id);
CREATE INDEX idx_mood_checkins_user_logged_at ON mood_checkins(user_id, logged_at);

-- RLS Policies
ALTER TABLE mood_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY mood_checkins_select ON mood_checkins
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY mood_checkins_insert ON mood_checkins
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY mood_checkins_update ON mood_checkins
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY mood_checkins_delete ON mood_checkins
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- BODY SENSATIONS REFERENCE TABLE
-- ============================================
CREATE TABLE body_sensations (
  id TEXT PRIMARY KEY,  -- 'tight_chest', 'racing_heart', etc.
  label_en TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  label_zh_tw TEXT NOT NULL,
  category TEXT,  -- 'chest', 'head', 'general', etc.
  sort_order INTEGER DEFAULT 0
);

-- Pre-populated sensations
INSERT INTO body_sensations (id, label_en, label_zh, label_zh_tw, category, sort_order) VALUES
  ('tight_chest', 'Tight chest', '胸闷', '胸悶', 'chest', 1),
  ('racing_heart', 'Racing heart', '心跳加速', '心跳加速', 'chest', 2),
  ('shortness_of_breath', 'Shortness of breath', '呼吸困难', '呼吸困難', 'chest', 3),
  ('tense_shoulders', 'Tense shoulders', '肩膀紧绷', '肩膀緊繃', 'body', 4),
  ('headache', 'Headache', '头痛', '頭痛', 'head', 5),
  ('fatigue', 'Fatigue', '疲劳', '疲勞', 'general', 6),
  ('restless', 'Restless', '坐立不安', '坐立不安', 'general', 7),
  ('nausea', 'Nausea', '恶心', '噁心', 'stomach', 8),
  ('dizziness', 'Dizziness', '头晕', '頭暈', 'head', 9),
  ('muscle_tension', 'Muscle tension', '肌肉紧张', '肌肉緊張', 'body', 10);
```

### 27.5 API Routes (V1.5)

```
POST   /api/mood-checkins
       Body: { stress_level, note?, body_sensations?, logged_at? }
       Response: Created check-in with id
       Note: logged_at defaults to now, but can be set to recent past
       Rate limit: 30/min

GET    /api/mood-checkins
       Query params: ?start_date=&end_date=&limit=50
       Response: List of check-ins, newest first
       Rate limit: 100/min

GET    /api/mood-checkins/[id]
       Response: Single check-in detail
       Rate limit: 100/min

PATCH  /api/mood-checkins/[id]
       Body: { stress_level?, note?, body_sensations? }
       Response: Updated check-in
       Rate limit: 30/min

DELETE /api/mood-checkins/[id]
       Response: 204 No Content
       Rate limit: 30/min

GET    /api/mood-checkins/stats
       Query params: ?start_date=&end_date=
       Response: {
         total_checkins: 45,
         average_stress: 3.2,
         stress_distribution: { "1": 5, "2": 10, "3": 15, "4": 10, "5": 5 },
         common_sensations: [
           { id: "tight_chest", count: 23 },
           { id: "racing_heart", count: 15 }
         ],
         by_day_of_week: { "monday": 3.8, "tuesday": 2.9, ... },
         by_hour: { "9": 3.5, "14": 2.8, "22": 3.9, ... }
       }
       Rate limit: 60/min

POST   /api/mood-checkins/export
       Body: { start_date, end_date, format: "pdf" | "csv" }
       Response: { export_url, expires_at }
       Rate limit: 5/hour
```

### 27.6 Therapist Export Format

**PDF Report Structure:**

```
═══════════════════════════════════════════════════════
           MOOD CHECK-IN REPORT
═══════════════════════════════════════════════════════
Patient: [User's Name]
Period: February 1 - February 28, 2026
Generated: February 28, 2026 at 3:00 PM
Report ID: RPT-2026-02-ABC123

For use in therapy sessions. Generated by BetterR.Me
═══════════════════════════════════════════════════════

SUMMARY
───────────────────────────────────────────────────────
Total Check-ins:        23
Average Stress Level:   3.2 / 5
Highest Stress Day:     Monday, Feb 15 (4.5 avg)
Most Common Sensation:  Tight chest (12 occurrences)

STRESS DISTRIBUTION
───────────────────────────────────────────────────────
Level 1 (Calm):       ██░░░░░░░░  3 (13%)
Level 2:              ████░░░░░░  5 (22%)
Level 3:              ██████░░░░  7 (30%)
Level 4:              ████░░░░░░  5 (22%)
Level 5 (Overwhelmed): ███░░░░░░░  3 (13%)

DETAILED LOG
───────────────────────────────────────────────────────

Feb 15, 2026 - 3:42 PM                    Stress: 4/5
"Tight chest, anxious about tomorrow's presentation.
Can't focus on work."
Body: Tight chest, Racing heart, Tense shoulders
───────────────────────────────────────────────────────

Feb 12, 2026 - 9:15 AM                    Stress: 2/5
"Feeling okay after morning meditation. Calmer than
yesterday."
Body: None noted
───────────────────────────────────────────────────────

[... additional entries ...]

PATTERNS OBSERVED
───────────────────────────────────────────────────────
• Peak stress times: Late afternoon (3-5 PM)
• Higher stress on: Mondays and Sundays
• Recurring themes in notes: "meeting", "presentation"

═══════════════════════════════════════════════════════
This report is for informational purposes and should be
reviewed with a qualified mental health professional.
═══════════════════════════════════════════════════════
```

### 27.7 Frontend Components (V1.5)

**Pages:**
- `/check-in` - Quick check-in form (optimized for speed)
- `/check-ins` - List view of past check-ins with filters
- `/check-ins/insights` - Trends and patterns visualization

**Components:**
- `MoodCheckinForm` - Quick capture form with stress slider and body tags
- `StressLevelSelector` - 1-5 scale with visual feedback
- `BodySensationTags` - Pre-built tag selector with custom option
- `MoodCheckinCard` - Display single check-in in list
- `MoodCheckinList` - Filterable list of check-ins
- `MoodTrendsChart` - Stress level over time visualization
- `TherapistExportDialog` - Date range picker + format selector + download

**Dashboard Integration:**
- Optional "Quick Check-in" button on main dashboard
- NOT prominently featured (avoid over-prompting about emotions)
- Accessible via menu/navigation

### 27.8 Privacy & Safety Considerations

**Data Privacy:**
| Concern | Mitigation |
|---------|-----------|
| **Sensitive data** | All mood data encrypted at rest, strict RLS policies |
| **Accidental sharing** | Export requires explicit action + confirmation dialog |
| **Data portability** | Users can export all their data, delete account |
| **Third-party access** | No analytics on mood content, only aggregate metrics |

**Mental Health Safety:**
| Concern | Mitigation |
|---------|-----------|
| **Crisis situations** | If stress=5 selected, show crisis resources (hotlines) |
| **Over-tracking** | No streaks, no gamification, no "you haven't checked in" prompts |
| **Negative reinforcement** | Compassionate copy: "Thank you for checking in with yourself" |
| **Professional boundary** | Clear disclaimer: "This is not a substitute for professional care" |

**Crisis Resources Display (when stress_level = 5):**
```
┌──────────────────────────────────────────────────────┐
│  If you're in crisis, help is available:            │
│                                                      │
│  🇺🇸 National Suicide Prevention: 988               │
│  🇺🇸 Crisis Text Line: Text HOME to 741741          │
│  🌏 International Association for Suicide           │
│     Prevention: https://www.iasp.info/resources/    │
│                                                      │
│  [Continue to save check-in]                        │
└──────────────────────────────────────────────────────┘
```

### 27.9 V2+ Enhancements (Future)

- **Habit-Mood Correlation:** "On days you meditated, average stress was 2.1 vs 3.8"
- **Trigger Identification:** ML-based pattern detection in notes
- **Therapist Portal:** Direct secure sharing (requires HIPAA compliance work)
- **Guided Check-ins:** Optional prompts like "What triggered this feeling?"
- **Voice Notes:** Audio capture for when typing is too much

### 27.10 Success Metrics (V1.5)

| Metric | Target |
|--------|--------|
| Check-ins per user per week | 2-5 (not too many, not too few) |
| Export usage | 10% of check-in users export at least once |
| Feature retention | 40% of users who try it continue using after 2 weeks |
| Crisis resource clicks | Track for safety, no target (awareness metric) |

### 27.11 Why V1.5 (Not V1)

1. **Scope discipline** - V1 must ship fast with core habit/task features
2. **UX sensitivity** - Mental health features need extra design care
3. **Privacy infrastructure** - Want to ensure data handling is solid first
4. **User feedback** - See if users request this after V1 launch
5. **Competitive timing** - Still differentiating, but not blocking launch

---

## APPENDIX A: GLOSSARY

| Term | Definition |
|------|------------|
| **Streak** | Consecutive scheduled completions of a habit |
| **Scheduled day** | A day when a habit is supposed to be done based on frequency |
| **Completion rate** | Percentage of scheduled days where habit was completed |
| **Toggle** | Mark a habit as complete or incomplete for a given day |
| **Heatmap** | Calendar visualization showing habit completion patterns |
| **RLS** | Row Level Security - Supabase/PostgreSQL feature for data isolation |
| **Mood Check-in** | Quick capture of emotional state with stress level and optional notes |
| **Body Sensation** | Physical feeling associated with emotional state (e.g., tight chest) |
| **Therapist Export** | PDF/CSV report of mood check-ins formatted for clinical review |

---

## NEXT STEPS

1. **Review & Approve:** This PRD is final and ready for implementation
2. **Create Tasks:** Break down Phase 1-4 into GitHub issues
3. **Start Coding:** Database schema migrations (Week 1 start)
4. **Measure:** Track retention metrics from Day 1
5. **Iterate:** Gather user feedback, plan V1.5 based on data

---

**Document Version:** 1.2 (Mood Check-ins Added)
**Last Updated:** February 3, 2026
**Status:** Ready for Implementation
