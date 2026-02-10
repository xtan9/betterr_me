# Engineering Plan V3: Vertical Depth Implementation

**Status:** Proposed
**Date:** Feb 9, 2026
**PRD:** `docs/VERTICAL_DEPTH_STRATEGY.md`

This plan translates the Vertical Depth Strategy into concrete engineering work, organized by phase. Each step includes database migrations, API changes, UI components, tests, and i18n — in dependency order.

---

## Prerequisites

Before starting any phase, ensure:
- Branch from `main` (latest)
- All existing tests pass (`pnpm test:run`)
- Lint clean (`pnpm lint`)

---

## Phase 1 — Quick Wins

### 1A. Feature T1: Intention Field

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_task_intention.sql`

```sql
ALTER TABLE tasks ADD COLUMN intention TEXT;
COMMENT ON COLUMN tasks.intention IS 'Optional user-stated reason/motivation for this task';
```

No new indexes needed — `intention` is not queried/filtered, only read with the task.

**Types:** `lib/db/types.ts`

```typescript
// Add to Task interface:
intention: string | null;

// Add to TaskInsert:
intention?: string | null;

// Add to TaskUpdate:
intention?: string | null;
```

**Validation:** `lib/validations/task.ts`

```typescript
// Add to taskFormSchema:
intention: z.string().max(200).optional().nullable(),
```

**DB layer:** `lib/db/tasks.ts` — no method changes needed. The existing `createTask`, `updateTask`, and query methods already pass through all columns. The new column is nullable with no default, so existing rows get `null` automatically.

**API routes:** No changes. Existing CRUD routes (`POST /api/tasks`, `PATCH /api/tasks/[id]`, `GET /api/tasks/[id]`) already pass through the full task object.

**UI changes:**

| File | Change |
|------|--------|
| `components/tasks/task-form.tsx` | Add `intention` field below description. Styled as a reflective prompt: lighter text, italic placeholder ("Why does this matter to you?"). Only show when mode is "create" or when editing a task that already has an intention. |
| `components/tasks/task-detail-content.tsx` | Add "Your Why" card below the title section. Only renders when `task.intention` is non-null. Styled with a subtle left border accent. |
| `components/dashboard/tasks-today.tsx` | For P3 tasks with an intention, show intention as a secondary line below the task title in `text-xs text-muted-foreground italic`. |

**i18n keys** (add to all 3 locale files):

```json
{
  "tasks": {
    "form": {
      "intentionLabel": "Why This Matters",
      "intentionPlaceholder": "Why does this matter to you?"
    },
    "detail": {
      "yourWhy": "Your Why"
    }
  }
}
```

**Tests:**
- `tests/components/tasks/task-form.test.tsx` — intention field renders, validates max 200 chars
- `tests/components/tasks/task-detail-content.test.tsx` — "Your Why" card renders when intention exists, hidden when null
- `tests/components/dashboard/tasks-today.test.tsx` — intention subtitle shows for P3 tasks with intention

**Estimated files touched:** 8 (1 migration, 3 TS, 1 validation, 3 i18n)

---

### 1B. Feature T4: Task Horizon

**Migration:** None.

**API:** `app/api/dashboard/route.ts`

Extend the dashboard response to include tomorrow's tasks:

```typescript
// Add to Promise.all:
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0]; // WRONG — use getLocalDateString()

// Correct approach: compute tomorrow from local date
const todayParts = localDate.split('-').map(Number);
const tomorrowDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2] + 1);
const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;

// Fetch: filter getUpcomingTasks to tomorrow only
const tasksTomorrow = await tasksDB.getUserTasks(user.id, {
  due_date: tomorrowStr,
  is_completed: false,
});
```

Add `tasks_tomorrow: Task[]` to the response JSON.

**Types:** `components/dashboard/dashboard-content.tsx`

```typescript
// Extend DashboardData:
interface DashboardData {
  // ...existing fields
  tasks_tomorrow: Task[];
}
```

**UI changes:**

| File | Change |
|------|--------|
| `components/dashboard/tasks-today.tsx` | Add `tasksTomorrow` prop. Below existing task list, render a "Coming Up" divider + up to 3 tomorrow tasks in `opacity-50` wrapper. When all today tasks are complete, expand to full opacity and show all tomorrow tasks. Add "View all tasks" link at bottom. |
| `components/dashboard/dashboard-content.tsx` | Pass `data.tasks_tomorrow` to `TasksToday` component. |

**Key implementation detail in `tasks-today.tsx`:**

```typescript
// New props:
interface TasksTodayProps {
  tasks: Task[];
  tasksTomorrow?: Task[];  // NEW
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  onCreateTask: () => void;
  isLoading?: boolean;
}

// Derived state:
const allTodayComplete = totalCount > 0 && completedCount === totalCount;
const tomorrowToShow = allTodayComplete
  ? tasksTomorrow
  : tasksTomorrow?.slice(0, 3);
const remainingTomorrow = (tasksTomorrow?.length ?? 0) - (tomorrowToShow?.length ?? 0);
```

**i18n keys:**

```json
{
  "dashboard": {
    "tasks": {
      "comingUp": "Coming Up (Tomorrow)",
      "headStart": "Get a head start on tomorrow",
      "moreTomorrow": "+{count} more tomorrow",
      "viewAll": "View all tasks"
    }
  }
}
```

**Tests:**
- `tests/components/dashboard/tasks-today.test.tsx` — test "Coming Up" section renders with tomorrow tasks, hidden when empty, auto-expands when all today complete, "+N more" shows correctly
- `tests/components/dashboard/dashboard-content.test.tsx` — verify `tasks_tomorrow` passed through

**Estimated files touched:** 5 (1 API route, 2 components, 3 i18n) — no migration

---

### 1C. Feature H1: Absence-Aware Recovery

**Migration:** None. Uses existing `habit_logs` table. The `missed_scheduled_days` count is computed at query time, not stored.

**DB layer:** `lib/db/habit-logs.ts`

Add a bulk query method and a pure computation function:

```typescript
/**
 * Fetch all completed logs for a user in the last N days.
 * ONE query for all habits — avoids N+1 problem on dashboard.
 */
async getAllUserLogs(
  userId: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
): Promise<HabitLog[]>
```

Add a **pure function** (no DB access) for computing absence from pre-fetched logs:

```typescript
/**
 * Compute missed scheduled days for a single habit from pre-fetched logs.
 * Pure function — operates entirely in memory.
 */
export function computeMissedDays(
  habitId: string,
  frequency: HabitFrequency,
  logs: HabitLog[],       // Pre-fetched, filtered to this habit
  maxLookback: number = 30
): { missedDays: number; previousStreak: number }
```

**Algorithm (in `computeMissedDays`):**
1. Filter `logs` to this habit's completed entries, build a `Set<string>` of completed dates for O(1) lookup
2. Walk backwards from yesterday, checking `shouldTrackOnDate()` for each day
3. For each scheduled day: if date not in completed set, increment `missedDays`
4. Stop when a completed date is found (or maxLookback reached)
5. Return `missedDays` and the habit's streak before the lapse

**Refactor:** Extract `shouldTrackOnDate` from private to a standalone exported utility function in `lib/habits/frequency.ts` (or make it a static method) so it can be reused without instantiating a full HabitLogsDB.

**API:** `app/api/dashboard/route.ts`

**Critical: 1 query, not N+1.** Fetch all user logs in bulk, then compute absence in memory:

```typescript
// ONE query for all habit logs in last 30 days:
const logsDB = new HabitLogsDB(supabase);
const thirtyDaysAgo = /* compute from localDate */;
const allLogs = await logsDB.getAllUserLogs(user.id, thirtyDaysAgo, localDate);

// Compute absence in memory — no additional queries:
const habitsWithAbsence = habits.map(habit => {
  const habitLogs = allLogs.filter(l => l.habit_id === habit.id);
  const absence = computeMissedDays(habit.id, habit.frequency, habitLogs);
  return {
    ...habit,
    missed_scheduled_days: absence.missedDays,
    previous_streak: absence.previousStreak,
  };
});
```

**Why:** Dashboard load time is critical. With 10 habits, the original plan fired 10 separate SQL queries (N+1 problem). This approach uses exactly 1 query regardless of habit count, then filters in memory which is negligible.

**Types:** `lib/db/types.ts`

```typescript
// Extend HabitWithTodayStatus:
interface HabitWithTodayStatus {
  // ...existing fields
  missed_scheduled_days: number;
  previous_streak: number;
}
```

**UI — New component:** `components/dashboard/absence-card.tsx`

```typescript
interface AbsenceCardProps {
  habit: {
    id: string;
    name: string;
    missed_scheduled_days: number;
    previous_streak: number;
    current_streak: number;
  };
  onToggle: (habitId: string) => Promise<void>;
  onPause: (habitId: string) => Promise<void>;
  onChangeFrequency: (habitId: string) => void;
  isToggling?: boolean;
}

// Tier derived from missed_scheduled_days:
// 1 → "recovery" (amber)
// 2-6 → "lapse" (blue)
// 7+ → "hiatus" (warm/welcoming)
```

**Visual variants:**

| Tier | Color | Icon | Copy |
|------|-------|------|------|
| Recovery (1 day) | `bg-amber-50 border-amber-200` | AlertCircle | "You missed {habit} yesterday. The rule: never miss twice." |
| Lapse (2-6 days) | `bg-blue-50 border-blue-200` | Clock | "It's been {X} days since {habit}. No judgment — today is a good day to restart." |
| Hiatus (7+ days) | `bg-orange-50 border-orange-200` | Heart | "Welcome back! Want to continue {habit}, or adjust your routine?" |

**Dashboard integration:** `components/dashboard/dashboard-content.tsx`

```typescript
// Filter habits needing absence cards:
const absenceHabits = data.habits
  .filter(h => h.missed_scheduled_days > 0 && !h.completed_today)
  .sort((a, b) => b.missed_scheduled_days - a.missed_scheduled_days) // Hiatus first
  .slice(0, 3); // Cap at 3

// Render between MotivationMessage and DailySnapshot
```

**i18n keys:**

```json
{
  "dashboard": {
    "absence": {
      "recovery": "You missed {habit} yesterday. The rule: never miss twice.",
      "recoverySuccess": "Back on track!",
      "lapse": "It's been {days} days since {habit}. No judgment — today is a good day to restart.",
      "lapsePreviousStreak": "Your streak was {count} days. Let's build a new one.",
      "lapseSuccess": "Day 1. Let's go.",
      "hiatus": "Welcome back! Want to continue {habit}, or adjust your routine?",
      "hiatusResume": "Resume",
      "hiatusPause": "Pause this habit",
      "hiatusChangeFrequency": "Change frequency",
      "hiatusSuccess": "Fresh start! Day 1."
    }
  }
}
```

**Tests:**
- `tests/lib/db/habit-logs.test.ts` — `getMissedScheduledDays()` with daily/weekly/custom habits, edge cases (0 missed, 1 missed, 7+ missed, habit never completed)
- `tests/components/dashboard/absence-card.test.tsx` — renders 3 visual variants, CTAs work, success state transforms, accessibility
- `tests/components/dashboard/dashboard-content.test.tsx` — absence cards render in correct order, capped at 3

**Estimated files touched:** 8 (1 DB, 1 API, 1 new component, 1 dashboard, 1 types, 3 i18n)

---

## Phase 2 — Medium Effort

### 2A. Feature H2: Streak Milestones & Celebrations

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_create_habit_milestones.sql`

```sql
CREATE TABLE habit_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  milestone INTEGER NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_habit_milestones_habit ON habit_milestones(habit_id);
CREATE INDEX idx_habit_milestones_user ON habit_milestones(user_id);
CREATE UNIQUE INDEX idx_habit_milestones_unique ON habit_milestones(habit_id, milestone);

ALTER TABLE habit_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own milestones"
  ON habit_milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own milestones"
  ON habit_milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE habit_milestones IS 'Records when a habit reaches a streak milestone (7, 14, 30, etc.)';
```

**Constants:** `lib/habits/milestones.ts` (new file)

```typescript
export const MILESTONE_THRESHOLDS = [7, 14, 30, 50, 100, 200, 365] as const;

export function getNextMilestone(currentStreak: number): number | null {
  return MILESTONE_THRESHOLDS.find(m => m > currentStreak) ?? null;
}

export function isMilestoneStreak(streak: number): boolean {
  return MILESTONE_THRESHOLDS.includes(streak as any);
}

export function getDaysToNextMilestone(currentStreak: number): number | null {
  const next = getNextMilestone(currentStreak);
  return next ? next - currentStreak : null;
}
```

**DB layer:** `lib/db/habit-milestones.ts` (new file)

```typescript
export class HabitMilestonesDB {
  constructor(private supabase: SupabaseClient) {}

  async recordMilestone(habitId: string, userId: string, milestone: number): Promise<void>
  async getHabitMilestones(habitId: string, userId: string): Promise<HabitMilestone[]>
  async getTodaysMilestones(userId: string): Promise<HabitMilestone[]>
}
```

**Toggle integration:** `app/api/habits/[id]/toggle/route.ts`

After the existing streak calculation, check if the new streak hits a milestone:

```typescript
import { isMilestoneStreak } from '@/lib/habits/milestones';

// After toggle completes and streak is updated:
if (result.completed && isMilestoneStreak(result.currentStreak)) {
  const milestonesDB = new HabitMilestonesDB(supabase);
  await milestonesDB.recordMilestone(id, user.id, result.currentStreak);
}
```

**API:** `app/api/dashboard/route.ts`

Add today's milestones to the dashboard response:

```typescript
const milestonesDB = new HabitMilestonesDB(supabase);
const todaysMilestones = await milestonesDB.getTodaysMilestones(user.id);
// Add to response: milestones_today: todaysMilestones
```

**UI — New components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| `MilestoneCard` | `components/habits/milestone-card.tsx` | Dashboard celebration card. Gradient background (emerald-to-teal), trophy icon, habit name, milestone number, congratulatory message. |
| `NextMilestone` | `components/habits/next-milestone.tsx` | Habit detail page indicator. Shows "X more days to your Y-day milestone!" with a progress ring or bar. |

**Dashboard integration:** `components/dashboard/dashboard-content.tsx`

Render `MilestoneCard` components above the main content grid (below stats, above habits/tasks). Show max 2 milestone cards.

**Habit detail integration:** `components/habits/habit-detail-content.tsx`

Add `NextMilestone` below the `StreakCounter` component.

**i18n keys:**

```json
{
  "habits": {
    "milestone": {
      "celebration": "Incredible! {habit} just hit {count} days!",
      "celebration7": "One week strong!",
      "celebration14": "Two weeks and counting!",
      "celebration30": "A full month! You're building something real.",
      "celebration50": "50 days. Half the people who start never get here.",
      "celebration100": "Triple digits. Legendary.",
      "celebration200": "200 days. This isn't a habit anymore — it's who you are.",
      "celebration365": "One full year. Unbelievable commitment.",
      "nextMilestone": "{days} more days to your {milestone}-day milestone!",
      "noNextMilestone": "You've passed every milestone. Keep going!"
    }
  }
}
```

**Tests:**
- `tests/lib/habits/milestones.test.ts` — getNextMilestone, isMilestoneStreak, getDaysToNextMilestone
- `tests/components/habits/milestone-card.test.tsx` — renders celebration for each threshold, accessibility
- `tests/components/habits/next-milestone.test.tsx` — shows correct days remaining, handles edge cases

**Estimated files touched:** 14 (1 migration, 2 new DB/util files, 2 API routes, 2 new components, 2 existing components, 1 types, 3 i18n, 1 test util)

---

### 2B. Feature T3: Completion Reflection

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_task_completion_difficulty.sql`

```sql
ALTER TABLE tasks ADD COLUMN completion_difficulty INTEGER
  CHECK (completion_difficulty >= 1 AND completion_difficulty <= 3);
COMMENT ON COLUMN tasks.completion_difficulty IS '1=easy, 2=good, 3=hard — optional post-completion reflection';
```

**Types:** `lib/db/types.ts`

```typescript
// Add to Task interface:
completion_difficulty: 1 | 2 | 3 | null;
```

**API:** `app/api/tasks/[id]/toggle/route.ts`

After toggling to completed, include `completion_difficulty` in the response so the frontend knows to show the reflection UI. The actual save happens via a separate `PATCH /api/tasks/[id]` call (already exists) when the user taps an emoji.

**UI changes:**

| File | Change |
|------|--------|
| `components/dashboard/tasks-today.tsx` | In `TaskRow`: after toggle-to-complete for qualifying tasks (P3 or has intention), show inline reflection strip instead of immediately marking as done. Use `useState` for a `reflectingTaskId` and a `setTimeout` for 3s auto-dismiss. |
| `components/tasks/task-card.tsx` | Same reflection logic for the tasks list page. |
| `components/tasks/task-detail-content.tsx` | Display saved reflection as a badge/label: "You rated this: Easy/Good/Hard" with the corresponding emoji. |

**Reflection strip implementation pattern:**

```typescript
// Inside TaskRow:
const [reflectingTaskId, setReflectingTaskId] = useState<string | null>(null);
const reflectionTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleToggle = async (taskId: string) => {
  const task = tasks.find(t => t.id === taskId);
  const isCompleting = task && !task.is_completed;
  const qualifies = task && (task.priority === 3 || task.intention);

  await onToggle(taskId);

  if (isCompleting && qualifies) {
    setReflectingTaskId(taskId);
    reflectionTimerRef.current = setTimeout(() => {
      setReflectingTaskId(null);
    }, 3000);
  }
};

const handleReflection = async (taskId: string, difficulty: 1 | 2 | 3) => {
  if (reflectionTimerRef.current) clearTimeout(reflectionTimerRef.current);
  setReflectingTaskId(null);
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completion_difficulty: difficulty }),
  });
};
```

**Reflection strip UI:**

```tsx
{reflectingTaskId === task.id && (
  <div className="flex items-center gap-2 text-xs animate-in fade-in duration-200">
    <span className="text-muted-foreground">{t("reflection.howWasIt")}</span>
    <button onClick={() => handleReflection(task.id, 1)}>⚡ {t("reflection.easy")}</button>
    <button onClick={() => handleReflection(task.id, 2)}>👌 {t("reflection.good")}</button>
    <button onClick={() => handleReflection(task.id, 3)}>💪 {t("reflection.hard")}</button>
  </div>
)}
```

**i18n keys:**

```json
{
  "tasks": {
    "reflection": {
      "howWasIt": "How was it?",
      "easy": "Easy",
      "good": "Good",
      "hard": "Hard",
      "ratedEasy": "You rated this: ⚡ Easy",
      "ratedGood": "You rated this: 👌 Good",
      "ratedHard": "You rated this: 💪 Hard"
    }
  }
}
```

**Tests:**
- `tests/components/dashboard/tasks-today.test.tsx` — reflection strip shows for P3 tasks, auto-dismisses after 3s, saves on tap, does NOT show for P0-P2 without intention
- `tests/components/tasks/task-card.test.tsx` — same reflection behavior
- `tests/components/tasks/task-detail-content.test.tsx` — displays saved reflection

**Estimated files touched:** 8 (1 migration, 1 types, 3 components, 3 i18n)

---

## Phase 3 — Deeper Investment

### 3A. Feature H3: Weekly Insight Card

**Migration:** None. Insights are computed on-the-fly from existing `habit_logs` data.

**DB layer:** `lib/db/insights.ts` (new file)

```typescript
export interface WeeklyInsight {
  type: 'best_week' | 'worst_day' | 'best_habit' | 'streak_proximity' | 'improvement' | 'decline';
  message: string;        // i18n key
  params: Record<string, string | number>;  // i18n params
  priority: number;       // Higher = more relevant
}

export class InsightsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Compute weekly insights for a user.
   * Analyzes the previous full week of habit data.
   */
  async getWeeklyInsights(
    userId: string,
    weekStartDay: number  // 0=Sun, 1=Mon from user preferences
  ): Promise<WeeklyInsight[]>
}
```

**Insight computation logic:**

```typescript
// 1. Fetch all habit logs for previous week + the week before (for comparison)
// 2. Compute per-habit completion rates for both weeks
// 3. Compute per-day-of-week completion rates
// 4. Generate insight candidates:

// best_week: if this week's overall rate > all previous weeks
//   → "You completed {percent}% of habits this week — your best week yet!"

// worst_day: find the day with lowest completion rate
//   → "You tend to skip habits on {day}. Consider adjusting your {day} routine."

// best_habit: highest completion rate habit
//   → "{habit} is your strongest habit at {percent}% this week."

// streak_proximity: any habit within 3 days of a milestone
//   → "{habit} is {days} days from a {milestone}-day milestone!"

// improvement: week-over-week rate increase > 10%
//   → "Up {change}% from last week. You're building momentum."

// decline: week-over-week rate decrease > 15%
//   → "This week was {percent}%, down from {lastPercent}%. Everyone has off weeks."

// 5. Sort by priority, return top 1-2 insights
```

**API route:** `app/api/insights/weekly/route.ts` (new file)

```typescript
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user's week_start_day preference
  const profilesDB = new ProfilesDB(supabase);
  const profile = await profilesDB.getProfile(user.id);
  const weekStartDay = profile?.week_start_day ?? 1; // Default Monday

  const insightsDB = new InsightsDB(supabase);
  const insights = await insightsDB.getWeeklyInsights(user.id, weekStartDay);

  return NextResponse.json({ insights });
}
```

**UI — New component:** `components/dashboard/weekly-insight-card.tsx`

```typescript
interface WeeklyInsightCardProps {
  insights: WeeklyInsight[];
  onDismiss: () => void;
}
```

- Visual: blue/indigo card with Brain icon from lucide-react
- Shows the top insight with translated message
- Dismiss button (X) stores dismissal in localStorage with week key
- Only renders on the user's configured `week_start_day`

**Dashboard integration:** `components/dashboard/dashboard-content.tsx`

```typescript
// Fetch insights via separate SWR call (not in main dashboard endpoint):
const { data: insightsData } = useSWR(
  isWeekStartDay ? '/api/insights/weekly' : null,
  fetcher
);

// Check localStorage for dismissal:
const weekKey = `insight-dismissed-${getWeekKey(today)}`;
const isDismissed = typeof window !== 'undefined' && localStorage.getItem(weekKey);

// Render between greeting and motivation message, only on week start day
```

**i18n keys:**

```json
{
  "dashboard": {
    "insight": {
      "title": "Your Week in Review",
      "bestWeek": "You completed {percent}% of habits this week — your best week yet!",
      "worstDay": "You tend to skip habits on {day}. Consider adjusting your {day} routine.",
      "bestHabit": "{habit} is your strongest habit at {percent}% this week.",
      "streakProximity": "{habit} is {days} days from a {milestone}-day milestone!",
      "improvement": "Up {change}% from last week. You're building momentum.",
      "decline": "This week was {percent}%, down from {lastPercent}%. Everyone has off weeks.",
      "dismiss": "Dismiss"
    }
  }
}
```

**Tests:**
- `tests/lib/db/insights.test.ts` — comprehensive tests for each insight type: best_week, worst_day, best_habit, streak_proximity, improvement, decline. Test with various data shapes (no habits, all complete, all missed, mixed). Test priority sorting.
- `tests/components/dashboard/weekly-insight-card.test.tsx` — renders insight message, dismiss hides card, only shows on week start day
- `tests/api/insights/weekly.test.ts` — API route returns insights, handles no data, handles unauthorized

**Estimated files touched:** 9 (1 new DB file, 1 new API route, 1 new component, 1 dashboard, 1 types, 3 i18n, 1 util)

---

## Execution Order Within Each Phase

### Phase 1 (recommended order):
1. **T1 first** — simplest (one column, one form field), validates the migration workflow
2. **T4 second** — no migration, extends existing component, quick win
3. **H1 third** — most complex in Phase 1, but builds on understanding from T1/T4

### Phase 2 (recommended order):
4. **H2 first** — new table + new components, independent of T3
5. **T3 second** — depends on T1 (intention field used as trigger condition)

### Phase 3:
6. **H3 last** — most backend-heavy, can reference patterns established in Phase 1-2

---

## Cross-Cutting Concerns

### i18n Workflow
For every feature, add keys to all 3 files simultaneously:
- `i18n/messages/en.json`
- `i18n/messages/zh.json`
- `i18n/messages/zh-TW.json`

### Testing Strategy
Each feature must include:
1. DB method unit tests (Vitest, mock Supabase client)
2. Component tests (Vitest + Testing Library + vitest-axe)
3. Updated snapshot/integration tests for dashboard
4. E2E test for the critical path (Playwright)

### Migration Safety
- Migrations are additive only (ALTER TABLE ADD COLUMN, CREATE TABLE)
- No column renames or drops
- All new columns are nullable or have defaults
- Existing queries are unaffected (SELECT * picks up new columns automatically)

### Performance Considerations
- H1 (absence calculation): 1 bulk query for all user logs in last 30 days, then in-memory computation per habit. O(1) queries regardless of habit count — no N+1 problem.
- H3 (weekly insights): Compute on-demand via separate API endpoint. Not included in main dashboard load. Cached via SWR on the client.
- H2 (milestones): Record milestone inline during toggle. Dashboard query for today's milestones is 1 query.

---

## File Impact Summary

| Phase | New Files | Modified Files | Migrations | Total |
|-------|-----------|----------------|------------|-------|
| Phase 1 | 1 component | 7 existing files | 1 | ~11 |
| Phase 2 | 4 files (2 components, 1 DB, 1 util) | 6 existing files | 2 | ~14 |
| Phase 3 | 3 files (1 component, 1 DB, 1 API) | 2 existing files | 0 | ~8 |
| **Total** | **8 new** | **15 modified** | **3** | **~33** |

Plus test files (1-2 per feature) and i18n updates (3 files x 6 features).
