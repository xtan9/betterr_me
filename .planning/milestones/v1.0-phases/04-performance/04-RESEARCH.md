# Phase 4: Performance - Research

**Researched:** 2026-02-16
**Domain:** Supabase query optimization, streak algorithm efficiency
**Confidence:** HIGH

## Summary

Phase 4 has two concrete performance optimizations, both targeting unnecessary data transfer between the application and Supabase. The scope is narrow and well-defined: two requirements (PERF-01, PERF-02) with clear success criteria.

**PERF-01** addresses the dashboard route fetching ALL task rows just to derive two numbers: `total_tasks` (count of all user tasks) and `tasks_completed_today` (count of completed tasks for today). Currently, three separate `getUserTasks()` calls return full `Task[]` arrays when only counts are needed. The fix replaces these with Supabase `COUNT(*)` queries using the existing `{ count: 'exact', head: true }` pattern already proven in the codebase (see `getActiveHabitCount` in `lib/db/habits.ts` and `countCompletedLogs` in `lib/db/habit-logs.ts`). The same optimization applies to the server-side dashboard page (`app/dashboard/page.tsx`) which has identical redundant fetches.

**PERF-02** addresses the streak calculation in `calculateStreak()` which always fetches 365 days of habit logs regardless of actual streak length. A user with a 5-day streak triggers a query spanning an entire year. The fix uses an adaptive lookback strategy: start with a small window, and only expand if the streak extends to the window boundary.

**Primary recommendation:** Both optimizations are independent and can be implemented in a single plan. PERF-01 is mechanical (swap queries), PERF-02 requires careful algorithm changes to the streak walker.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/ssr | (in use) | Supabase client for count queries | Already in codebase; `{ count: 'exact', head: true }` pattern established |

No new libraries needed. Both optimizations use existing Supabase query capabilities already demonstrated in the codebase.

## Architecture Patterns

### Pattern 1: Supabase COUNT(*) Query (already in codebase)

**What:** Use `select('*', { count: 'exact', head: true })` to get row counts without transferring row data.
**When to use:** When you only need a count, not the actual rows.
**Already used in:**
- `lib/db/habits.ts` line 245: `getActiveHabitCount()`
- `lib/db/habit-logs.ts` line 475: `countCompletedLogs()`

**Example (from existing codebase):**
```typescript
// Source: lib/db/habits.ts lines 242-250
async getActiveHabitCount(userId: string): Promise<number> {
  const { count, error } = await this.supabase
    .from('habits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['active', 'paused']);

  if (error) throw error;
  return count ?? 0;
}
```

**Confidence:** HIGH -- this exact pattern is already working in production in this codebase.

### Pattern 2: Adaptive Lookback for Streak Calculation

**What:** Instead of always querying 365 days of logs, start with a small window (e.g., 30 days) and expand only if the streak reaches the window boundary.
**When to use:** When the common case (short streaks) is much cheaper than the worst case (year-long streaks).

**Algorithm sketch:**
```typescript
async calculateStreak(habitId, userId, frequency, previousBestStreak, weekStartDay) {
  const INITIAL_WINDOW = 30;   // days
  const MAX_WINDOW = 365;      // safety cap (unchanged)

  let windowDays = INITIAL_WINDOW;

  while (windowDays <= MAX_WINDOW) {
    const logs = await this.getLogsByDateRange(habitId, userId, startDate(windowDays), today);
    const completedDates = new Set(logs.filter(l => l.completed).map(l => l.logged_date));

    const { streak, hitWindowBoundary } = walkStreak(completedDates, frequency, today, windowDays);

    if (!hitWindowBoundary) {
      // Streak ended naturally (missed day), no need to look further back
      return { currentStreak: streak, bestStreak: Math.max(streak, previousBestStreak) };
    }

    // Streak extends to the window edge -- double the window and try again
    windowDays = Math.min(windowDays * 2, MAX_WINDOW);
  }

  // Hit MAX_WINDOW, return what we have
  return { currentStreak: streak, bestStreak: Math.max(streak, previousBestStreak) };
}
```

**Confidence:** HIGH -- standard adaptive/doubling strategy used widely in algorithms.

### Pattern 3: Weekly Streak Adaptive Lookback

**What:** For `times_per_week` and `weekly` frequency types, the streak unit is weeks not days. A 30-day initial window covers ~4 weeks, which is a reasonable starting point.
**Special consideration:** The weekly streak walker (`calculateWeeklyStreak`) works on week boundaries, so the lookback expansion should grow in multiples that make sense for weekly grouping. Doubling (30 -> 60 -> 120 -> 240 -> 365) works fine since the week grouping logic doesn't require aligned boundaries.

**Confidence:** HIGH

### Anti-Patterns to Avoid
- **Separate queries for count and data:** If you already need the rows (e.g., `todayTasks` for rendering), don't add a separate COUNT query -- use `.length` on the fetched data. COUNT queries are only an optimization when the rows themselves aren't needed.
- **Premature optimization of the weekly streak walker:** The weekly streak has a built-in `currentStreak > 52` safety limit. With the adaptive approach applying at the data-fetch level, the walker itself doesn't need changes to its termination logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row counting | Client-side `.length` on full result set | Supabase `{ count: 'exact', head: true }` | Avoids transferring potentially hundreds of task rows over the network |
| Streak lookback optimization | Complex caching/memoization layer | Adaptive window doubling on the existing query | Simple, no new dependencies, leverages existing query infrastructure |

**Key insight:** The Supabase JS client already supports server-side COUNT queries. The codebase already uses this pattern. The only work is applying it to the dashboard's task count queries.

## Common Pitfalls

### Pitfall 1: Dashboard Has Two Identical Codepaths
**What goes wrong:** Optimizing only the API route (`app/api/dashboard/route.ts`) but forgetting the server-side rendered page (`app/dashboard/page.tsx`) which has the same `getUserTasks(user.id)` calls.
**Why it happens:** The SSR page pre-fetches data independently from the API route.
**How to avoid:** Apply the same COUNT query changes to both files. Verify both by checking for any remaining `getUserTasks(user.id)` calls without filters that are only used for counting.
**Warning signs:** `getUserTasks` called without filters and result used only for `.length`.

### Pitfall 2: Breaking the allTodayTasks Filter
**What goes wrong:** The `allTodayTasks` query (`getUserTasks(user.id, { due_date: date })`) is used both for `tasks_completed_today` count AND potentially for other purposes.
**Why it happens:** Assuming it's only for counting.
**How to avoid:** Trace all usages carefully. In the current code:
  - `allTodayTasks` is ONLY used for `allTodayTasks.filter(t => t.is_completed).length` -- safe to replace with a count query.
  - `allTasks` (no filter) is ONLY used for `allTasks.length` -- safe to replace with a count query.
**Warning signs:** Check that no other code references the actual task objects from these arrays.

### Pitfall 3: Adaptive Lookback Returning Wrong Streak for Edge Cases
**What goes wrong:** The adaptive window might cause the streak walker to see a truncated view and return an incorrect streak.
**Why it happens:** If the streak extends exactly to the window boundary, and the expansion logic has an off-by-one error.
**How to avoid:** The `hitWindowBoundary` detection must be based on whether the streak walker reached the earliest date in the query range. If the walker stopped because it found a missed day BEFORE reaching the window boundary, the streak is definitive. If it ran out of data (reached the start of the queried range), it needs more history.
**Warning signs:** Streak values differ between the optimized and original (365-day) implementation for the same data.

### Pitfall 4: tasks_completed_today Needs TWO Counts, Not One
**What goes wrong:** Replacing `allTodayTasks.filter(t => t.is_completed).length` with a single count query that counts ALL tasks for today.
**Why it happens:** The current code fetches all today-tasks then filters client-side. The replacement needs a count query with BOTH `due_date = today` AND `is_completed = true`.
**How to avoid:** The count query must include the `is_completed` filter: `.eq('due_date', date).eq('is_completed', true)`.
**Warning signs:** `tasks_completed_today` always equals `tasks_due_today`.

### Pitfall 5: Test Mock Changes
**What goes wrong:** Existing dashboard tests mock `getUserTasks` and assert specific call patterns. After the optimization, those mocks and assertions need updating.
**Why it happens:** Tests are tightly coupled to the query implementation.
**How to avoid:** Update test mocks to match new method signatures. The dashboard route test currently expects `getUserTasks` to be called 3 times. After optimization, it should call new count methods instead for the count-only queries.
**Warning signs:** Tests fail after refactor because mock setup doesn't match new call patterns.

## Code Examples

### Current Dashboard Route - Lines to Change (PERF-01)

**File: `app/api/dashboard/route.ts` lines 60-69 (current):**
```typescript
const [habitsWithStatus, todayTasks, allTodayTasks, allTasks, tasksTomorrow] = await Promise.all([
  habitsDB.getHabitsWithTodayStatus(user.id, date),
  tasksDB.getTodayTasks(user.id),
  // Get all tasks for today to calculate completed count
  tasksDB.getUserTasks(user.id, { due_date: date }),        // <-- PERF-01: replace
  // Get all tasks to determine if user has any tasks at all
  tasksDB.getUserTasks(user.id),                             // <-- PERF-01: replace
  // Get incomplete tasks for tomorrow
  tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
]);
```

**After optimization:**
```typescript
const [habitsWithStatus, todayTasks, tasksCompletedTodayCount, totalTaskCount, tasksTomorrow] = await Promise.all([
  habitsDB.getHabitsWithTodayStatus(user.id, date),
  tasksDB.getTodayTasks(user.id),
  // Count completed tasks for today (HEAD-only, no row transfer)
  tasksDB.getTaskCount(user.id, { due_date: date, is_completed: true }),
  // Count all tasks for user (HEAD-only, no row transfer)
  tasksDB.getTaskCount(user.id),
  // Get incomplete tasks for tomorrow (actual rows needed for display)
  tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
]);
```

### New TasksDB Method (PERF-01)

```typescript
/**
 * Count tasks matching filters without fetching row data.
 * Uses Supabase HEAD request (count only, no rows transferred).
 */
async getTaskCount(userId: string, filters?: TaskFilters): Promise<number> {
  let query = this.supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (filters) {
    if (filters.is_completed !== undefined) {
      query = query.eq('is_completed', filters.is_completed);
    }
    if (filters.priority !== undefined) {
      query = query.eq('priority', filters.priority);
    }
    if (filters.due_date) {
      query = query.eq('due_date', filters.due_date);
    }
    if (filters.has_due_date !== undefined) {
      query = filters.has_due_date
        ? query.not('due_date', 'is', null)
        : query.is('due_date', null);
    }
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
```

### Current calculateStreak - 365-Day Fetch (PERF-02)

**File: `lib/db/habit-logs.ts` lines 166-177 (current):**
```typescript
// Get all logs for the past 365 days (max streak calculation window)
const today = new Date();
today.setHours(0, 0, 0, 0);
const startDate = new Date(today);
startDate.setDate(startDate.getDate() - 365);

const logs = await this.getLogsByDateRange(
  habitId,
  userId,
  getLocalDateString(startDate),
  getLocalDateString(today)
);
```

### Adaptive Lookback Implementation (PERF-02)

```typescript
async calculateStreak(
  habitId: string,
  userId: string,
  frequency: HabitFrequency,
  previousBestStreak: number = 0,
  weekStartDay: number = 0
): Promise<{ currentStreak: number; bestStreak: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const INITIAL_WINDOW = 30;
  const MAX_WINDOW = 365;
  let windowDays = INITIAL_WINDOW;

  while (true) {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - windowDays);

    const logs = await this.getLogsByDateRange(
      habitId, userId,
      getLocalDateString(startDate),
      getLocalDateString(today)
    );

    const completedDates = new Set(
      logs.filter(log => log.completed).map(log => log.logged_date)
    );

    // For weekly-type frequencies, delegate to weekly streak calculator
    if (frequency.type === 'times_per_week') {
      const result = this.calculateWeeklyStreak(completedDates, frequency.count, weekStartDay, today, previousBestStreak);
      // Check if streak extends to window boundary
      const weeksInWindow = Math.floor(windowDays / 7);
      if (result.currentStreak < weeksInWindow || windowDays >= MAX_WINDOW) {
        return result;
      }
      // Need more data
      windowDays = Math.min(windowDays * 2, MAX_WINDOW);
      continue;
    }
    if (frequency.type === 'weekly') {
      const result = this.calculateWeeklyStreak(completedDates, 1, weekStartDay, today, previousBestStreak);
      const weeksInWindow = Math.floor(windowDays / 7);
      if (result.currentStreak < weeksInWindow || windowDays >= MAX_WINDOW) {
        return result;
      }
      windowDays = Math.min(windowDays * 2, MAX_WINDOW);
      continue;
    }

    // Daily/weekdays/custom: walk backward counting consecutive completions
    let currentStreak = 0;
    const checkDate = new Date(today);
    let hitBoundary = false;

    while (true) {
      const dateStr = getLocalDateString(checkDate);

      // Check if we've hit the window boundary
      if (checkDate < startDate) {
        hitBoundary = true;
        break;
      }

      if (shouldTrackOnDate(frequency, checkDate)) {
        if (completedDates.has(dateStr)) {
          currentStreak++;
        } else {
          // Allow today to be incomplete without breaking streak
          if (dateStr !== getLocalDateString(today)) {
            break; // Streak broken -- definitive result
          }
        }
      }

      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (!hitBoundary || windowDays >= MAX_WINDOW) {
      const bestStreak = Math.max(currentStreak, previousBestStreak);
      return { currentStreak, bestStreak };
    }

    // Streak extends to window boundary -- expand and retry
    windowDays = Math.min(windowDays * 2, MAX_WINDOW);
  }
}
```

## Scope Analysis

### Files That Need Changes

| File | Change | Requirement |
|------|--------|-------------|
| `lib/db/tasks.ts` | Add `getTaskCount()` method | PERF-01 |
| `app/api/dashboard/route.ts` | Replace `getUserTasks` count calls with `getTaskCount` | PERF-01 |
| `app/dashboard/page.tsx` | Same replacement as API route | PERF-01 |
| `lib/db/habit-logs.ts` | Refactor `calculateStreak` to use adaptive lookback | PERF-02 |
| `tests/app/api/dashboard/route.test.ts` | Update mocks for new `getTaskCount` method | PERF-01 |
| `tests/lib/db/tasks.test.ts` | Add tests for `getTaskCount` | PERF-01 |
| `tests/lib/db/habit-logs.test.ts` | Update/add streak tests for adaptive lookback | PERF-02 |

### Files That Do NOT Need Changes
- `lib/db/types.ts` -- `TaskFilters` interface is already sufficient for `getTaskCount`
- `lib/db/index.ts` -- already re-exports everything from `tasks.ts`
- `components/dashboard/*` -- consume `DashboardData` which doesn't change shape
- `app/api/habits/[id]/stats/route.ts` -- uses `getDetailedHabitStats`, not `calculateStreak` directly

### Consumer Impact
- `DashboardData` type in `lib/db/types.ts` is UNCHANGED -- `total_tasks` and `tasks_completed_today` remain numbers
- Frontend components receive the same data shape -- no UI changes needed
- The `calculateStreak` change is internal to `HabitLogsDB` -- callers (`toggleLog`) are unaffected

## Open Questions

1. **Should `tasks_completed_today` also use COUNT for `allTodayTasks`?**
   - What we know: `allTodayTasks` is ONLY used for `allTodayTasks.filter(t => t.is_completed).length`. The actual rows are never rendered or passed downstream.
   - Recommendation: YES -- replace with a count query. This eliminates yet another full-row fetch. This is strictly within scope since PERF-01 says "Dashboard uses COUNT(*) query for task count" and `tasks_completed_today` is a task count.

2. **Should the adaptive lookback initial window be 30 days or larger?**
   - What we know: The success criterion says "a habit with a 5-day streak does not query 365 days." A 30-day window covers this comfortably. Most users likely have streaks under 30 days.
   - Recommendation: 30 days is a good initial window. It covers the common case with a single query while limiting worst-case to 5 queries (30 -> 60 -> 120 -> 240 -> 365).

3. **Does `app/dashboard/page.tsx` also need the optimization?**
   - What we know: It has identical `getUserTasks(user.id)` calls. It's the server-side render path. SWR then revalidates from the API route.
   - Recommendation: YES -- optimize both. The SSR path runs on every page load before hydration.

## Sources

### Primary (HIGH confidence)
- `lib/db/habits.ts` lines 242-250 -- existing `{ count: 'exact', head: true }` pattern
- `lib/db/habit-logs.ts` lines 467-484 -- existing `countCompletedLogs` using same pattern
- `app/api/dashboard/route.ts` lines 60-69 -- current redundant queries (source of truth for what to change)
- `app/dashboard/page.tsx` lines 30-41 -- duplicate SSR queries
- `lib/db/tasks.ts` -- `getUserTasks` implementation and `TaskFilters` interface
- `lib/db/types.ts` -- `DashboardData` type showing `total_tasks` and `tasks_completed_today` are plain numbers
- `components/dashboard/dashboard-content.tsx` line 158 -- `total_tasks` used only for `=== 0` check

### Secondary (MEDIUM confidence)
- Supabase JS client docs -- `{ count: 'exact', head: true }` is the standard pattern for count-only queries (verified by existing codebase usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, uses existing Supabase patterns already proven in codebase
- Architecture (PERF-01): HIGH -- mechanical query replacement using established codebase pattern
- Architecture (PERF-02): HIGH -- standard adaptive algorithm, well-understood tradeoffs
- Pitfalls: HIGH -- derived from concrete codebase analysis, not speculation

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable patterns, no library changes expected)
