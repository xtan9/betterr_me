# Habit Graduation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `formed` lifecycle state to habits with user-initiated graduation, a Formed gallery, research-informed eligibility nudges, and day-21 milestone celebration; remove the `archived` state.

**Architecture:** New `formed` status on habits + snapshot columns (`graduated_at`, `graduated_streak`, `nudge_dismissed_at`). New `habit_graduations` history table. Eligibility is computed server-side per frequency bucket and returned as a boolean on list endpoints. Archived is hard-dropped — existing archived rows auto-deleted in migration. UI surfaces: new Formed tab, gallery cards, nudge banner on active habit cards, graduate/reactivate confirmation dialogs.

**Tech Stack:** Next.js 16 (App Router), Supabase SSR, TypeScript strict, Vitest + Testing Library, next-intl, Zod, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-04-12-habit-graduation-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/20260412000001_habit_graduation.sql` — schema changes + archived cleanup
- `lib/habits/graduation.ts` — eligibility logic
- `tests/lib/habits/graduation.test.ts` — eligibility tests
- `app/api/habits/[id]/graduate/route.ts` — POST graduate endpoint
- `app/api/habits/[id]/reactivate/route.ts` — POST reactivate endpoint
- `app/api/habits/[id]/dismiss-graduation-nudge/route.ts` — POST dismiss nudge
- `tests/app/api/habits/graduate.test.ts` — endpoint tests
- `components/habits/graduation-nudge-banner.tsx` — banner component
- `components/habits/graduate-dialog.tsx` — confirmation dialog
- `components/habits/reactivate-dialog.tsx` — reactivation dialog
- `components/habits/formed-habit-card.tsx` — gallery card
- `tests/components/habits/graduation-nudge-banner.test.tsx`
- `tests/components/habits/graduate-dialog.test.tsx`
- `tests/components/habits/reactivate-dialog.test.tsx`
- `tests/components/habits/formed-habit-card.test.tsx`

**Modify:**
- `lib/db/types.ts` — add `formed` to `HabitStatus`, new columns on `Habit`, add `HabitGraduation`
- `lib/db/habits.ts` — remove `archiveHabit`, add `graduateHabit`, `reactivateHabit`, `dismissGraduationNudge`, extend `getHabitsWithTodayStatus` with `graduation_eligible`
- `lib/habits/milestones.ts` — add 21 to threshold array
- `lib/validations/habit.ts` — update status enum (drop `archived`, add `formed`)
- `lib/ai/tools/habits.ts` — remove `archiveHabit`, add `graduateHabit`/`reactivateHabit`
- `app/api/habits/[id]/route.ts` — remove archive branch from DELETE
- `components/habits/habit-list.tsx` — tabs Active/Paused/Formed, render Formed gallery
- `components/habits/habit-empty-state.tsx` — drop `no_archived`, add `no_formed`
- `components/habits/habit-detail-content.tsx` — add Graduate action, remove archived styling branch
- `i18n/messages/en.json`, `zh.json`, `zh-TW.json` — new strings, remove archived references
- Test files listed below to reflect API changes

**Test-only edits (no code changes beyond fixtures):**
- `tests/lib/db/habits.test.ts`, `tests/lib/validations/habit.test.ts`, `tests/app/habits/habit-detail-page.test.tsx`, `tests/app/habits/habits-page-content.test.tsx`, `tests/components/habits/habit-list.test.tsx`, `tests/components/habits/habit-empty-state.test.tsx`, `tests/lib/ai/tools/habits.test.ts`

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260412000001_habit_graduation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- BetterR.Me Habit Graduation
-- Migration: 20260412000001_habit_graduation.sql

-- =============================================================================
-- 1. HARD-DELETE EXISTING ARCHIVED HABITS (approved by product)
-- =============================================================================
DELETE FROM habits WHERE status = 'archived';

-- =============================================================================
-- 2. NEW COLUMNS ON habits
-- =============================================================================
ALTER TABLE habits
  ADD COLUMN graduated_at TIMESTAMPTZ,
  ADD COLUMN graduated_streak INTEGER,
  ADD COLUMN nudge_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN habits.graduated_at IS 'Timestamp when user graduated this habit. Cleared on reactivate.';
COMMENT ON COLUMN habits.graduated_streak IS 'Snapshot of current_streak at graduation. Displayed in Formed gallery.';
COMMENT ON COLUMN habits.nudge_dismissed_at IS 'When user dismissed the graduation nudge. Re-evaluates after 30 days.';

-- =============================================================================
-- 3. REPLACE status CHECK CONSTRAINT: archived -> formed
-- =============================================================================
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_status_check;
ALTER TABLE habits
  ADD CONSTRAINT habits_status_check CHECK (status IN ('active', 'paused', 'formed'));

COMMENT ON COLUMN habits.status IS 'active = tracking, paused = temporarily stopped, formed = graduated/automatic';

-- Rebuild partial index (archived is gone; active still most common)
DROP INDEX IF EXISTS idx_habits_user_active;
CREATE INDEX idx_habits_user_active ON habits(user_id) WHERE status = 'active';

-- New partial index for Formed gallery
CREATE INDEX idx_habits_user_formed ON habits(user_id, graduated_at DESC) WHERE status = 'formed';

-- =============================================================================
-- 4. habit_graduations HISTORY TABLE
-- =============================================================================
CREATE TABLE habit_graduations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  graduated_at TIMESTAMPTZ NOT NULL,
  graduated_streak INTEGER NOT NULL,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_habit_graduations_habit ON habit_graduations(habit_id);
CREATE INDEX idx_habit_graduations_user ON habit_graduations(user_id, graduated_at DESC);

COMMENT ON TABLE habit_graduations IS 'History of graduate/reactivate cycles per habit';

-- =============================================================================
-- 5. RLS FOR habit_graduations (match habits pattern)
-- =============================================================================
ALTER TABLE habit_graduations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own graduations"
  ON habit_graduations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own graduations"
  ON habit_graduations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own graduations"
  ON habit_graduations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own graduations"
  ON habit_graduations FOR DELETE
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260412000001_habit_graduation.sql
git commit -m "feat(habits): add graduation schema — formed status, graduations history, drop archived"
```

Note: per project memory, migrations are applied by CI on merge, not manually.

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `lib/db/types.ts`

- [ ] **Step 1: Replace HabitStatus and extend Habit interface**

In `lib/db/types.ts`, change:

```ts
export type HabitStatus = "active" | "paused" | "archived";
```
to:
```ts
export type HabitStatus = "active" | "paused" | "formed";
```

In the same file, replace the `Habit` interface:

```ts
export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  frequency: HabitFrequency;
  status: HabitStatus;
  current_streak: number;
  best_streak: number;
  paused_at: string | null;
  graduated_at: string | null;
  graduated_streak: number | null;
  nudge_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}
```

Extend `HabitInsert` omits and optional block to include the new fields:

```ts
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
  graduated_at?: string | null;
  graduated_streak?: number | null;
  nudge_dismissed_at?: string | null;
};
```

Find `HabitWithTodayStatus` and add the new boolean:

```ts
export interface HabitWithTodayStatus extends Habit {
  completed_today: boolean;
  monthly_completion_rate: number;
  graduation_eligible: boolean;
}
```

- [ ] **Step 2: Add HabitGraduation type**

Append near the other habit types in `lib/db/types.ts`:

```ts
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
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm tsc --noEmit
```

Expect failures referencing `archived` / `archiveHabit` etc. — these are fixed in later tasks. Do not commit yet.

---

## Task 3: Add 21 to milestone thresholds

**Files:**
- Modify: `lib/habits/milestones.ts`
- Test: `tests/lib/habits/milestones.test.ts` (create if absent)

- [ ] **Step 1: Write test (TDD)**

Create `tests/lib/habits/milestones.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MILESTONE_THRESHOLDS,
  getNextMilestone,
  isMilestoneStreak,
} from "@/lib/habits/milestones";

describe("milestones", () => {
  it("includes 21 as a milestone", () => {
    expect(MILESTONE_THRESHOLDS).toContain(21);
  });

  it("orders milestones ascending", () => {
    const arr = [...MILESTONE_THRESHOLDS];
    const sorted = [...arr].sort((a, b) => a - b);
    expect(arr).toEqual(sorted);
  });

  it("getNextMilestone returns 21 after a 14-day streak", () => {
    expect(getNextMilestone(14)).toBe(21);
  });

  it("isMilestoneStreak recognises 21", () => {
    expect(isMilestoneStreak(21)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
pnpm vitest run tests/lib/habits/milestones.test.ts
```

Expected: `includes 21` fails, `getNextMilestone` returns 30 instead of 21.

- [ ] **Step 3: Add 21 to the array**

In `lib/habits/milestones.ts`:

```ts
export const MILESTONE_THRESHOLDS = [7, 14, 21, 30, 50, 100, 200, 365] as const;
```

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm vitest run tests/lib/habits/milestones.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/habits/milestones.ts tests/lib/habits/milestones.test.ts
git commit -m "feat(habits): add day 21 to milestone thresholds"
```

---

## Task 4: Graduation eligibility logic

**Files:**
- Create: `lib/habits/graduation.ts`
- Create: `tests/lib/habits/graduation.test.ts`

- [ ] **Step 1: Write tests (TDD)**

Create `tests/lib/habits/graduation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isGraduationEligible } from "@/lib/habits/graduation";
import type { HabitFrequency } from "@/lib/db/types";

function buildLogs(completedDates: string[]) {
  return completedDates.map((d) => ({ logged_date: d, completed: true }));
}

/** Generate n consecutive dates ending at endISO */
function consecutiveDates(endISO: string, n: number): string[] {
  const out: string[] = [];
  const end = new Date(endISO);
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe("isGraduationEligible", () => {
  const today = "2026-04-12";

  it("daily: not eligible before 21 days old", () => {
    const createdAt = "2026-04-01"; // 11 days old
    const logs = buildLogs(consecutiveDates(today, 11));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(false);
  });

  it("daily: eligible at 21 days with 100% consistency", () => {
    const createdAt = "2026-03-22";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("daily: not eligible when consistency < 80%", () => {
    const createdAt = "2026-03-22";
    // 16/21 = 76% — below threshold
    const logs = buildLogs(consecutiveDates(today, 16));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(false);
  });

  it("daily: eligible with one miss (20/21 = 95%)", () => {
    const createdAt = "2026-03-22";
    const dates = consecutiveDates(today, 21);
    const logs = buildLogs(dates.filter((_, i) => i !== 5)); // drop 1
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("weekdays: eligible at 21 days with all scheduled weekdays completed", () => {
    const createdAt = "2026-03-22";
    const dates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(d).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const logs = buildLogs(dates);
    const freq: HabitFrequency = { type: "weekdays" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("times_per_week(3): not eligible before 30 days", () => {
    const createdAt = "2026-04-01";
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("times_per_week(3): eligible at 30 days old with ≥80% consistency", () => {
    const createdAt = "2026-03-13"; // 30 days old
    // 30 days × (3/7) ≈ 13 scheduled; satisfy with 13 completions
    const logs = buildLogs(consecutiveDates(today, 13));
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("weekly: not eligible before 90 days", () => {
    const createdAt = "2026-02-01"; // ~70 days
    const freq: HabitFrequency = { type: "weekly" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("weekly: eligible at 90 days old with 80% consistency", () => {
    const createdAt = "2026-01-12"; // 90 days old — ~12 weekly opportunities
    const logs = buildLogs(consecutiveDates(today, 10)); // ~10/12 = 83%
    const freq: HabitFrequency = { type: "weekly" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("custom with 5+ days/week uses daily rule (21d)", () => {
    const createdAt = "2026-03-22";
    const freq: HabitFrequency = { type: "custom", days: [1, 2, 3, 4, 5] };
    const dates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(d).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const logs = buildLogs(dates);
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("custom with 1 day/week uses weekly rule (90d)", () => {
    const createdAt = "2026-02-01";
    const freq: HabitFrequency = { type: "custom", days: [1] };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("returns false when habit is already formed", () => {
    const createdAt = "2026-03-22";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs, status: "formed" })
    ).toBe(false);
  });

  it("returns false when nudge recently dismissed (< 30 days ago)", () => {
    const createdAt = "2026-03-22";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: "2026-04-01T00:00:00Z", // 11 days ago
      })
    ).toBe(false);
  });

  it("eligible again when nudge dismissed ≥ 30 days ago", () => {
    const createdAt = "2026-03-22";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: "2026-03-01T00:00:00Z", // 42 days ago
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect module-not-found**

```bash
pnpm vitest run tests/lib/habits/graduation.test.ts
```

Expected: all fail (module does not exist).

- [ ] **Step 3: Implement `lib/habits/graduation.ts`**

```ts
import type { HabitFrequency, HabitStatus } from "@/lib/db/types";
import { shouldTrackOnDate } from "@/lib/habits/format";

type LogRow = { logged_date: string; completed: boolean };

type Args = {
  createdAt: string;         // ISO timestamp
  today: string;             // YYYY-MM-DD
  frequency: HabitFrequency;
  logs: LogRow[];            // completed logs in window (or more — filtered below)
  status?: HabitStatus;
  nudgeDismissedAt?: string | null;
};

type Bucket = { minAgeDays: number; windowDays: number; consistency: number };

const DAILY_BUCKET: Bucket = { minAgeDays: 21, windowDays: 21, consistency: 0.8 };
const TIMES_PER_WEEK_BUCKET: Bucket = { minAgeDays: 30, windowDays: 30, consistency: 0.8 };
const WEEKLY_BUCKET: Bucket = { minAgeDays: 90, windowDays: 90, consistency: 0.8 };

const NUDGE_COOLDOWN_DAYS = 30;

export function getBucket(frequency: HabitFrequency): Bucket {
  switch (frequency.type) {
    case "daily":
    case "weekdays":
      return DAILY_BUCKET;
    case "times_per_week":
      return TIMES_PER_WEEK_BUCKET;
    case "weekly":
      return WEEKLY_BUCKET;
    case "custom": {
      const n = frequency.days.length;
      if (n >= 4) return DAILY_BUCKET;
      if (n >= 2) return TIMES_PER_WEEK_BUCKET;
      return WEEKLY_BUCKET;
    }
  }
}

function daysBetween(fromISO: string, toYMD: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(`${toYMD}T00:00:00Z`).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Count scheduled occurrences in [start, end] inclusive for a frequency. */
function countScheduled(
  frequency: HabitFrequency,
  startYMD: string,
  endYMD: string
): number {
  let count = 0;
  let cursor = startYMD;
  while (cursor <= endYMD) {
    const d = new Date(`${cursor}T00:00:00Z`);
    if (frequency.type === "times_per_week") {
      // Scheduled-count is target × weeks in window.
      // Handled separately below — short-circuit here.
      break;
    }
    if (shouldTrackOnDate(frequency, d)) count++;
    cursor = addDays(cursor, 1);
  }
  if (frequency.type === "times_per_week") {
    const days = daysBetween(`${startYMD}T00:00:00Z`, endYMD) + 1;
    const weeks = Math.max(days / 7, 1);
    count = Math.round(weeks * frequency.count);
  }
  return count;
}

export function isGraduationEligible(args: Args): boolean {
  const { createdAt, today, frequency, logs, status, nudgeDismissedAt } = args;

  if (status === "formed") return false;

  const bucket = getBucket(frequency);
  const ageDays = daysBetween(createdAt, today);
  if (ageDays < bucket.minAgeDays) return false;

  if (nudgeDismissedAt) {
    const since = daysBetween(nudgeDismissedAt, today);
    if (since < NUDGE_COOLDOWN_DAYS) return false;
  }

  const windowStart = addDays(today, -(bucket.windowDays - 1));
  const scheduled = countScheduled(frequency, windowStart, today);
  if (scheduled === 0) return false;

  const completedInWindow = logs.filter(
    (l) => l.completed && l.logged_date >= windowStart && l.logged_date <= today
  ).length;

  return completedInWindow / scheduled >= bucket.consistency;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm vitest run tests/lib/habits/graduation.test.ts
```

Expected: all pass. If any fail on edge-case arithmetic (weeks in `times_per_week`), adjust `countScheduled` rounding until the tests reflect intended thresholds.

- [ ] **Step 5: Commit**

```bash
git add lib/habits/graduation.ts tests/lib/habits/graduation.test.ts
git commit -m "feat(habits): add graduation eligibility logic"
```

---

## Task 5: Update validations schema

**Files:**
- Modify: `lib/validations/habit.ts`
- Modify: `tests/lib/validations/habit.test.ts`

- [ ] **Step 1: Adjust test expectations first**

Open `tests/lib/validations/habit.test.ts`, find assertions that allow `archived` in the status enum and update them to reject `archived` and accept `formed`. (Exact lines depend on file; use Grep to find `archived` references and replace with `formed` where they test enum membership. Remove any test asserting `archived` is valid; add test asserting `formed` is valid.)

Example additions:

```ts
it("accepts formed status", () => {
  expect(habitUpdateSchema.safeParse({ status: "formed" }).success).toBe(true);
});

it("rejects archived status", () => {
  expect(habitUpdateSchema.safeParse({ status: "archived" }).success).toBe(false);
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run tests/lib/validations/habit.test.ts
```

- [ ] **Step 3: Update schema**

In `lib/validations/habit.ts`:

```ts
export const habitUpdateSchema = habitFormSchema
  .partial()
  .extend({
    status: z.enum(["active", "paused", "formed"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm vitest run tests/lib/validations/habit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/validations/habit.ts tests/lib/validations/habit.test.ts
git commit -m "feat(habits): swap archived for formed in validation schema"
```

---

## Task 6: DB layer — graduate/reactivate/dismiss methods + habit_graduations

**Files:**
- Create: `lib/db/habit-graduations.ts`
- Modify: `lib/db/habits.ts`
- Modify: `lib/db/index.ts`
- Modify: `tests/lib/db/habits.test.ts`

- [ ] **Step 1: Write tests for new methods**

In `tests/lib/db/habits.test.ts`, add a `describe("graduation", ...)` block:

```ts
import { HabitsDB } from "@/lib/db/habits";
import { mockSupabaseClient } from "@/tests/setup";

describe("HabitsDB graduation", () => {
  const userId = "user-1";
  const habitId = "habit-1";

  it("graduateHabit sets status=formed and snapshots streak", async () => {
    mockSupabaseClient.setMockResponse([{
      id: habitId, user_id: userId, status: "active", current_streak: 42,
    }]);
    mockSupabaseClient.setMockResponse([{
      id: habitId, user_id: userId, status: "formed",
      current_streak: 42, graduated_streak: 42,
      graduated_at: expect.any(String),
    }]);
    mockSupabaseClient.setMockResponse([{ id: "grad-1" }]); // insert graduations row

    const db = new HabitsDB(mockSupabaseClient as never);
    const result = await db.graduateHabit(habitId, userId);

    expect(result.status).toBe("formed");
    expect(result.graduated_streak).toBe(42);
    expect(result.graduated_at).toBeTruthy();
  });

  it("reactivateHabit sets status=active, resets current_streak, preserves best_streak", async () => {
    mockSupabaseClient.setMockResponse([{
      id: habitId, user_id: userId, status: "formed",
      current_streak: 0, best_streak: 87, graduated_streak: 87,
    }]);
    mockSupabaseClient.setMockResponse([{
      id: habitId, status: "active", current_streak: 0,
      best_streak: 87, graduated_at: null, graduated_streak: null,
    }]);
    mockSupabaseClient.setMockResponse([{ id: "grad-1", reactivated_at: expect.any(String) }]);

    const db = new HabitsDB(mockSupabaseClient as never);
    const result = await db.reactivateHabit(habitId, userId);

    expect(result.status).toBe("active");
    expect(result.current_streak).toBe(0);
    expect(result.best_streak).toBe(87);
    expect(result.graduated_at).toBeNull();
  });

  it("dismissGraduationNudge stamps nudge_dismissed_at", async () => {
    mockSupabaseClient.setMockResponse([{
      id: habitId, nudge_dismissed_at: expect.any(String),
    }]);
    const db = new HabitsDB(mockSupabaseClient as never);
    const result = await db.dismissGraduationNudge(habitId, userId);
    expect(result.nudge_dismissed_at).toBeTruthy();
  });
});
```

Also **remove** any existing `describe("archiveHabit")` block.

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run tests/lib/db/habits.test.ts
```

- [ ] **Step 3: Create `lib/db/habit-graduations.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HabitGraduation, HabitGraduationInsert } from "./types";

export class HabitGraduationsDB {
  constructor(private supabase: SupabaseClient) {}

  async insertGraduation(row: HabitGraduationInsert): Promise<HabitGraduation> {
    const { data, error } = await this.supabase
      .from("habit_graduations")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markReactivated(habitId: string, userId: string): Promise<void> {
    // Update the most recent open graduation row for this habit
    const { data: latest, error: selErr } = await this.supabase
      .from("habit_graduations")
      .select("id")
      .eq("habit_id", habitId)
      .eq("user_id", userId)
      .is("reactivated_at", null)
      .order("graduated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!latest) return;

    const { error } = await this.supabase
      .from("habit_graduations")
      .update({ reactivated_at: new Date().toISOString() })
      .eq("id", latest.id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  async getForHabit(habitId: string, userId: string): Promise<HabitGraduation[]> {
    const { data, error } = await this.supabase
      .from("habit_graduations")
      .select("*")
      .eq("habit_id", habitId)
      .eq("user_id", userId)
      .order("graduated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
}
```

- [ ] **Step 4: Update `lib/db/habits.ts`**

Remove `archiveHabit` method entirely. Add:

```ts
import { HabitGraduationsDB } from "./habit-graduations";

// ...existing class...

  async graduateHabit(habitId: string, userId: string): Promise<Habit> {
    const habit = await this.getHabit(habitId, userId);
    if (!habit) throw new Error("Habit not found");

    const graduatedAt = new Date().toISOString();
    const graduatedStreak = habit.current_streak;

    const updated = await this.updateHabit(habitId, userId, {
      status: "formed",
      graduated_at: graduatedAt,
      graduated_streak: graduatedStreak,
      nudge_dismissed_at: null,
    });

    const graduations = new HabitGraduationsDB(this.supabase);
    await graduations.insertGraduation({
      habit_id: habitId,
      user_id: userId,
      graduated_at: graduatedAt,
      graduated_streak: graduatedStreak,
    });

    return updated;
  }

  async reactivateHabit(habitId: string, userId: string): Promise<Habit> {
    const habit = await this.getHabit(habitId, userId);
    if (!habit) throw new Error("Habit not found");
    if (habit.status !== "formed") {
      throw new Error("Habit is not formed; cannot reactivate");
    }

    const updated = await this.updateHabit(habitId, userId, {
      status: "active",
      current_streak: 0,
      graduated_at: null,
      graduated_streak: null,
      nudge_dismissed_at: null,
    });

    const graduations = new HabitGraduationsDB(this.supabase);
    await graduations.markReactivated(habitId, userId);

    return updated;
  }

  async dismissGraduationNudge(habitId: string, userId: string): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      nudge_dismissed_at: new Date().toISOString(),
    });
  }
```

- [ ] **Step 5: Export from `lib/db/index.ts`**

Add to existing exports:

```ts
export { HabitGraduationsDB } from "./habit-graduations";
```

- [ ] **Step 6: Run tests — expect pass**

```bash
pnpm vitest run tests/lib/db/habits.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/db/habits.ts lib/db/habit-graduations.ts lib/db/index.ts tests/lib/db/habits.test.ts
git commit -m "feat(habits): add graduate/reactivate/dismissNudge DB methods"
```

---

## Task 7: Extend `getHabitsWithTodayStatus` with `graduation_eligible`

**Files:**
- Modify: `lib/db/habits.ts`
- Modify: `tests/lib/db/habits.test.ts`

- [ ] **Step 1: Add test**

Append to `tests/lib/db/habits.test.ts`:

```ts
it("getHabitsWithTodayStatus returns graduation_eligible flag per habit", async () => {
  const habits = [
    { id: "h1", user_id: "u1", status: "active", frequency: { type: "daily" }, created_at: "2026-01-01T00:00:00Z", current_streak: 50, best_streak: 50, nudge_dismissed_at: null },
    { id: "h2", user_id: "u1", status: "formed",  frequency: { type: "daily" }, created_at: "2026-01-01T00:00:00Z", current_streak: 0, best_streak: 80, nudge_dismissed_at: null },
  ];
  mockSupabaseClient.setMockResponse(habits);
  mockSupabaseClient.setMockResponse([]); // today logs
  mockSupabaseClient.setMockResponse([]); // month logs

  const db = new HabitsDB(mockSupabaseClient as never);
  const result = await db.getHabitsWithTodayStatus("u1", "2026-04-12");

  const h1 = result.find(h => h.id === "h1")!;
  const h2 = result.find(h => h.id === "h2")!;
  expect(h1).toHaveProperty("graduation_eligible");
  expect(h2.graduation_eligible).toBe(false); // formed never eligible
});
```

- [ ] **Step 2: Implement**

In `lib/db/habits.ts`, inside `getHabitsWithTodayStatus`, after fetching logs:

```ts
// Load full log history needed for eligibility windows (up to 90 days).
const eligibilityWindowStart = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
})();

const { data: eligibilityLogs, error: eligErr } = await this.supabase
  .from("habit_logs")
  .select("habit_id, logged_date, completed")
  .eq("user_id", userId)
  .gte("logged_date", eligibilityWindowStart)
  .lte("logged_date", today)
  .eq("completed", true);
if (eligErr) throw eligErr;

const logsByHabit = new Map<string, { logged_date: string; completed: boolean }[]>();
(eligibilityLogs ?? []).forEach((row) => {
  const arr = logsByHabit.get(row.habit_id) ?? [];
  arr.push({ logged_date: row.logged_date, completed: row.completed });
  logsByHabit.set(row.habit_id, arr);
});
```

Then update the final `.map` to compute eligibility — import at top of file:

```ts
import { isGraduationEligible } from "@/lib/habits/graduation";
```

And in the map:

```ts
return habits.map((habit) => {
  const scheduled = getScheduledDays(habit.frequency);
  const completed = monthlyCompletions.get(habit.id) || 0;
  const eligible = isGraduationEligible({
    createdAt: habit.created_at,
    today,
    frequency: habit.frequency,
    logs: logsByHabit.get(habit.id) ?? [],
    status: habit.status,
    nudgeDismissedAt: habit.nudge_dismissed_at,
  });
  return {
    ...habit,
    completed_today: completedHabitIds.has(habit.id),
    monthly_completion_rate:
      scheduled > 0 ? Math.min(Math.round((completed / scheduled) * 100), 100) : 0,
    graduation_eligible: eligible,
  };
});
```

- [ ] **Step 3: Run tests — expect pass**

```bash
pnpm vitest run tests/lib/db/habits.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/habits.ts tests/lib/db/habits.test.ts
git commit -m "feat(habits): expose graduation_eligible on habits-with-today-status"
```

---

## Task 8: API endpoints — graduate / reactivate / dismiss-nudge

**Files:**
- Create: `app/api/habits/[id]/graduate/route.ts`
- Create: `app/api/habits/[id]/reactivate/route.ts`
- Create: `app/api/habits/[id]/dismiss-graduation-nudge/route.ts`
- Modify: `app/api/habits/[id]/route.ts` (remove archive branch from DELETE)
- Create: `tests/app/api/habits/graduate.test.ts`

- [ ] **Step 1: Write endpoint tests**

Create `tests/app/api/habits/graduate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { graduateMock, reactivateMock, dismissMock } = vi.hoisted(() => ({
  graduateMock: vi.fn(),
  reactivateMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    graduateHabit = graduateMock;
    reactivateHabit = reactivateMock;
    dismissGraduationNudge = dismissMock;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));

describe("POST /api/habits/[id]/graduate", () => {
  beforeEach(() => {
    graduateMock.mockReset();
  });

  it("returns the graduated habit", async () => {
    graduateMock.mockResolvedValue({ id: "h1", status: "formed" });
    const { POST } = await import("@/app/api/habits/[id]/graduate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/habits/h1/graduate", { method: "POST" }),
      { params: Promise.resolve({ id: "h1" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ habit: { id: "h1", status: "formed" } });
    expect(graduateMock).toHaveBeenCalledWith("h1", "user-1");
  });

  it("returns 404 when habit not found", async () => {
    graduateMock.mockRejectedValue(new Error("Habit not found"));
    const { POST } = await import("@/app/api/habits/[id]/graduate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/habits/h1/graduate", { method: "POST" }),
      { params: Promise.resolve({ id: "h1" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/habits/[id]/reactivate", () => {
  beforeEach(() => reactivateMock.mockReset());

  it("returns the reactivated habit", async () => {
    reactivateMock.mockResolvedValue({ id: "h1", status: "active", current_streak: 0 });
    const { POST } = await import("@/app/api/habits/[id]/reactivate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/habits/h1/reactivate", { method: "POST" }),
      { params: Promise.resolve({ id: "h1" }) }
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/habits/[id]/dismiss-graduation-nudge", () => {
  beforeEach(() => dismissMock.mockReset());

  it("stamps the dismissal", async () => {
    dismissMock.mockResolvedValue({ id: "h1", nudge_dismissed_at: "2026-04-12T00:00:00Z" });
    const { POST } = await import("@/app/api/habits/[id]/dismiss-graduation-nudge/route");
    const res = await POST(
      new NextRequest("http://localhost/api/habits/h1/dismiss-graduation-nudge", { method: "POST" }),
      { params: Promise.resolve({ id: "h1" }) }
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect all fail (routes don't exist)**

```bash
pnpm vitest run tests/app/api/habits/graduate.test.ts
```

- [ ] **Step 3: Implement `app/api/habits/[id]/graduate/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.graduateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error("[habits] POST graduate", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to graduate habit" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement `app/api/habits/[id]/reactivate/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.reactivateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error("[habits] POST reactivate", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    if (message.includes("not formed")) {
      return NextResponse.json({ error: "Habit is not formed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to reactivate habit" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implement `app/api/habits/[id]/dismiss-graduation-nudge/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.dismissGraduationNudge(id, user.id);
    return NextResponse.json({ habit });
  } catch (error) {
    log.error("[habits] POST dismiss-graduation-nudge", error);
    return NextResponse.json({ error: "Failed to dismiss nudge" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Update `app/api/habits/[id]/route.ts` — drop archive branch**

Change the DELETE handler to unconditionally hard-delete (remove the `archive` query-param branch and its `archiveHabit` call). The new body:

```ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const habitsDB = new HabitsDB(supabase);
    await habitsDB.deleteHabit(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("[habits] DELETE", error);
    return NextResponse.json({ error: "Failed to delete habit" }, { status: 500 });
  }
}
```

Also remove any reference to `updates.paused_at` setting when `status === 'archived'` — the PATCH handler already handles `paused`/`active`; add `formed` to the "clear paused_at" branch:

```ts
if (validation.data.status !== undefined) {
  updates.status = validation.data.status;
  if (validation.data.status === "paused") {
    updates.paused_at = new Date().toISOString();
  } else {
    updates.paused_at = null;
  }
}
```

- [ ] **Step 7: Run all habit API tests — expect pass**

```bash
pnpm vitest run tests/app/api/habits/
```

- [ ] **Step 8: Commit**

```bash
git add app/api/habits tests/app/api/habits/graduate.test.ts
git commit -m "feat(habits): add graduate/reactivate/dismiss-nudge API endpoints"
```

---

## Task 9: AI/MCP tools — add graduateHabit, reactivateHabit; drop archiveHabit

**Files:**
- Modify: `lib/ai/tools/habits.ts`
- Modify: `tests/lib/ai/tools/habits.test.ts`

- [ ] **Step 1: Inspect current tool shape**

Use Grep to locate the `archiveHabit` tool definition and mirror its structure for the new tools. Tool signatures follow Vercel AI SDK `tool({ description, parameters, execute })` pattern.

- [ ] **Step 2: Update tests**

Replace `archiveHabit` tool tests with:

```ts
describe("graduateHabit tool", () => {
  it("calls HabitsDB.graduateHabit with the habit id", async () => {
    // ...mirror existing mocking pattern (vi.hoisted + vi.mock("@/lib/db"))
  });
});

describe("reactivateHabit tool", () => {
  it("calls HabitsDB.reactivateHabit with the habit id", async () => {
    // ...
  });
});
```

Remove the `archiveHabit` describe block.

- [ ] **Step 3: Run tests — expect failures**

```bash
pnpm vitest run tests/lib/ai/tools/habits.test.ts
```

- [ ] **Step 4: Implement in `lib/ai/tools/habits.ts`**

Remove `archiveHabit` export. Add:

```ts
import { z } from "zod";
import { tool } from "ai";
import { HabitsDB } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const graduateHabit = tool({
  description: "Graduate a habit — mark it as formed. Moves it to the Formed gallery.",
  parameters: z.object({
    habitId: z.string().uuid().describe("The habit ID to graduate"),
  }),
  execute: async ({ habitId }) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const db = new HabitsDB(supabase);
    const habit = await db.graduateHabit(habitId, user.id);
    return { habit };
  },
});

export const reactivateHabit = tool({
  description: "Reactivate a previously graduated habit — moves it back to Active tracking.",
  parameters: z.object({
    habitId: z.string().uuid().describe("The habit ID to reactivate"),
  }),
  execute: async ({ habitId }) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const db = new HabitsDB(supabase);
    const habit = await db.reactivateHabit(habitId, user.id);
    return { habit };
  },
});
```

Ensure both are exported from the tool registry (same place `archiveHabit` was).

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm vitest run tests/lib/ai/tools/habits.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/habits.ts tests/lib/ai/tools/habits.test.ts
git commit -m "feat(habits): swap archiveHabit AI tool for graduate/reactivate"
```

---

## Task 10: UI — update habit list tabs (Active / Paused / Formed)

**Files:**
- Modify: `components/habits/habit-list.tsx`
- Modify: `components/habits/habit-empty-state.tsx`
- Modify: `tests/components/habits/habit-list.test.tsx`
- Modify: `tests/components/habits/habit-empty-state.test.tsx`

- [ ] **Step 1: Update tests for the new tab**

In `tests/components/habits/habit-list.test.tsx`, replace assertions about the "archived" tab with "formed". Add a test asserting Formed tab shows formed habits only and renders a gallery-style card (we'll verify by test ID or a class).

```ts
it("Formed tab renders only formed habits using gallery cards", () => {
  // render list with habits of statuses active/paused/formed
  // click the "Formed" tab trigger
  // assert exactly the formed habits are rendered, in formed-habit-card form
});
```

In `tests/components/habits/habit-empty-state.test.tsx`, update `no_archived` → `no_formed`.

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run tests/components/habits/habit-list.test.tsx tests/components/habits/habit-empty-state.test.tsx
```

- [ ] **Step 3: Update `habit-list.tsx`**

Change tab type and filter:

```ts
type StatusTab = "active" | "paused" | "formed";

const counts = {
  active: habits.filter((h) => h.status === "active").length,
  paused: habits.filter((h) => h.status === "paused").length,
  formed: habits.filter((h) => h.status === "formed").length,
};

// empty-state derivation
if (activeTab === "formed" && filteredHabits.length === 0) return "no_formed";

// Tab trigger JSX
<TabsTrigger value="formed">
  {t("tabs.formed")} ({counts.formed})
</TabsTrigger>
```

When `activeTab === "formed"`, render `FormedHabitCard` (created in Task 12) instead of the normal habit row.

- [ ] **Step 4: Update `habit-empty-state.tsx`**

Replace `"no_archived"` in the union and the config map:

```ts
| "no_formed";

// ...
no_formed: {
  icon: "🎓",
  titleKey: "empty.no_formed.title",
  descriptionKey: "empty.no_formed.description",
},
```

Remove the `no_archived` entry entirely.

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm vitest run tests/components/habits/
```

- [ ] **Step 6: Commit**

```bash
git add components/habits/habit-list.tsx components/habits/habit-empty-state.tsx tests/components/habits/
git commit -m "feat(habits): replace Archived tab with Formed in habit list"
```

---

## Task 11: Graduation nudge banner component

**Files:**
- Create: `components/habits/graduation-nudge-banner.tsx`
- Create: `tests/components/habits/graduation-nudge-banner.test.tsx`

- [ ] **Step 1: Write tests (TDD)**

```ts
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraduationNudgeBanner } from "@/components/habits/graduation-nudge-banner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("GraduationNudgeBanner", () => {
  it("renders when eligible", () => {
    render(
      <GraduationNudgeBanner
        habitId="h1"
        onGraduate={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/graduate.nudge_title/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /graduate.nudge_cta/ })).toBeInTheDocument();
  });

  it("calls onDismiss when 'Not yet' clicked", () => {
    const onDismiss = vi.fn();
    render(<GraduationNudgeBanner habitId="h1" onGraduate={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /graduate.nudge_dismiss/ }));
    expect(onDismiss).toHaveBeenCalledWith("h1");
  });

  it("calls onGraduate when CTA clicked", () => {
    const onGraduate = vi.fn();
    render(<GraduationNudgeBanner habitId="h1" onGraduate={onGraduate} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /graduate.nudge_cta/ }));
    expect(onGraduate).toHaveBeenCalledWith("h1");
  });
});
```

- [ ] **Step 2: Run — expect fail (component missing)**

- [ ] **Step 3: Implement `components/habits/graduation-nudge-banner.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface Props {
  habitId: string;
  onGraduate: (habitId: string) => void;
  onDismiss: (habitId: string) => void;
}

export function GraduationNudgeBanner({ habitId, onGraduate, onDismiss }: Props) {
  const t = useTranslations("habits");
  return (
    <div
      role="region"
      aria-label={t("graduate.nudge_title")}
      className="mb-2 flex items-start gap-3 rounded-md border bg-primary/5 p-3 text-sm"
    >
      <span className="text-lg" aria-hidden>🎓</span>
      <div className="flex-1">
        <div className="font-medium">{t("graduate.nudge_title")}</div>
        <p className="text-muted-foreground">{t("graduate.nudge_body")}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDismiss(habitId)}>
          {t("graduate.nudge_dismiss")}
        </Button>
        <Button size="sm" onClick={() => onGraduate(habitId)}>
          {t("graduate.nudge_cta")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add components/habits/graduation-nudge-banner.tsx tests/components/habits/graduation-nudge-banner.test.tsx
git commit -m "feat(habits): add graduation nudge banner component"
```

---

## Task 12: Formed habit card component

**Files:**
- Create: `components/habits/formed-habit-card.tsx`
- Create: `tests/components/habits/formed-habit-card.test.tsx`

- [ ] **Step 1: Write tests**

```ts
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FormedHabitCard } from "@/components/habits/formed-habit-card";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const habit = {
  id: "h1",
  name: "Morning meditation",
  graduated_at: "2026-04-01T00:00:00Z",
  graduated_streak: 87,
  best_streak: 120,
  created_at: "2026-01-01T00:00:00Z",
} as never;

describe("FormedHabitCard", () => {
  it("displays habit name, graduation date and streak", () => {
    render(<FormedHabitCard habit={habit} onReactivate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Morning meditation")).toBeInTheDocument();
    expect(screen.getByText(/87/)).toBeInTheDocument();
  });

  it("calls onReactivate when reactivate button clicked", async () => {
    const onReactivate = vi.fn();
    const { getByRole } = render(
      <FormedHabitCard habit={habit} onReactivate={onReactivate} onDelete={vi.fn()} />
    );
    getByRole("button", { name: /formed_gallery.reactivate/ }).click();
    expect(onReactivate).toHaveBeenCalledWith("h1");
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

- [ ] **Step 3: Implement `components/habits/formed-habit-card.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { Habit } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  habit: Habit;
  onReactivate: (habitId: string) => void;
  onDelete: (habitId: string) => void;
}

export function FormedHabitCard({ habit, onReactivate, onDelete }: Props) {
  const t = useTranslations("habits");
  const graduatedDate = habit.graduated_at
    ? new Date(habit.graduated_at).toLocaleDateString()
    : "";
  const totalDays = habit.graduated_at
    ? Math.floor(
        (new Date(habit.graduated_at).getTime() -
          new Date(habit.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden>🎓</span>
          {habit.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="text-muted-foreground">
          {t("formed_gallery.graduated_on")}: {graduatedDate}
        </div>
        <div>
          {t("formed_gallery.at_streak", { n: habit.graduated_streak ?? 0 })}
        </div>
        <div className="text-muted-foreground">
          {t("formed_gallery.total_days_active", { n: totalDays })}
        </div>
        <div className="text-muted-foreground">
          {t("formed_gallery.best_streak", { n: habit.best_streak })}
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={() => onReactivate(habit.id)}>
            {t("formed_gallery.reactivate")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(habit.id)}>
            {t("formed_gallery.delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add components/habits/formed-habit-card.tsx tests/components/habits/formed-habit-card.test.tsx
git commit -m "feat(habits): add FormedHabitCard for graduation gallery"
```

---

## Task 13: Graduate + Reactivate confirmation dialogs

**Files:**
- Create: `components/habits/graduate-dialog.tsx`
- Create: `components/habits/reactivate-dialog.tsx`
- Create: `tests/components/habits/graduate-dialog.test.tsx`
- Create: `tests/components/habits/reactivate-dialog.test.tsx`

- [ ] **Step 1: Write tests for both dialogs**

Pattern for each (example for graduate-dialog):

```ts
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraduateDialog } from "@/components/habits/graduate-dialog";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("GraduateDialog", () => {
  it("calls onConfirm when Graduate is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <GraduateDialog
        open
        onOpenChange={vi.fn()}
        habitName="Meditation"
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /graduate.confirm_cta/ }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

Replicate for ReactivateDialog.

- [ ] **Step 2: Implement `graduate-dialog.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitName: string;
  onConfirm: () => void | Promise<void>;
}

export function GraduateDialog({ open, onOpenChange, habitName, onConfirm }: Props) {
  const t = useTranslations("habits");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("graduate.confirm_title", { name: habitName })}</DialogTitle>
          <DialogDescription>{t("graduate.confirm_body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("graduate.confirm_cancel")}
          </Button>
          <Button onClick={async () => { await onConfirm(); onOpenChange(false); }}>
            🎓 {t("graduate.confirm_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Implement `reactivate-dialog.tsx`** (mirror above with reactivate strings + show best_streak)

```tsx
"use client";

import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitName: string;
  bestStreak: number;
  onConfirm: () => void | Promise<void>;
}

export function ReactivateDialog({ open, onOpenChange, habitName, bestStreak, onConfirm }: Props) {
  const t = useTranslations("habits");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reactivate.confirm_title", { name: habitName })}</DialogTitle>
          <DialogDescription>
            {t("reactivate.confirm_body", { n: bestStreak })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("reactivate.confirm_cancel")}
          </Button>
          <Button onClick={async () => { await onConfirm(); onOpenChange(false); }}>
            {t("reactivate.confirm_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add components/habits/graduate-dialog.tsx components/habits/reactivate-dialog.tsx tests/components/habits/graduate-dialog.test.tsx tests/components/habits/reactivate-dialog.test.tsx
git commit -m "feat(habits): add graduate + reactivate confirmation dialogs"
```

---

## Task 14: Wire nudge banner, Graduate action, and gallery into pages

**Files:**
- Modify: `components/habits/habit-list.tsx` (render nudge banner + FormedHabitCard)
- Modify: `components/habits/habit-detail-content.tsx` (Graduate action in menu)
- Modify: existing page-level tests as needed (`tests/app/habits/habit-detail-page.test.tsx`, etc.)

- [ ] **Step 1: habit-list.tsx — render nudge on Active tab**

For each habit in the Active tab where `habit.graduation_eligible === true`, render `<GraduationNudgeBanner />` above the card. Wire handlers:

```tsx
const handleGraduate = async (habitId: string) => {
  await fetch(`/api/habits/${habitId}/graduate`, { method: "POST" });
  await mutateHabits(); // SWR revalidate
  toast.success(t("graduate.success_toast"));
};

const handleDismissNudge = async (habitId: string) => {
  await fetch(`/api/habits/${habitId}/dismiss-graduation-nudge`, { method: "POST" });
  await mutateHabits();
};

const handleReactivate = async (habitId: string) => {
  await fetch(`/api/habits/${habitId}/reactivate`, { method: "POST" });
  await mutateHabits();
  toast.success(t("reactivate.success_toast"));
};
```

In Formed tab rendering, render `<FormedHabitCard habit={h} onReactivate={handleReactivate} onDelete={handleDelete} />` inside a responsive grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`).

Use `<GraduateDialog>` and `<ReactivateDialog>` state-managed via local state `{ open: boolean; habitId: string | null }`.

- [ ] **Step 2: habit-detail-content.tsx — add Graduate menu item**

In the habit detail action menu (DropdownMenu / similar), add:

```tsx
{habit.status === "active" && (
  <DropdownMenuItem onClick={() => setGraduateOpen(true)}>
    🎓 {t("graduate.action_label")}
  </DropdownMenuItem>
)}
{habit.status === "formed" && (
  <DropdownMenuItem onClick={() => setReactivateOpen(true)}>
    {t("reactivate.action_label")}
  </DropdownMenuItem>
)}
```

Remove any existing `habit.status === "archived"` special-casing in styling (e.g., the `bg-muted-foreground` branch at the line previously found) — replace with `habit.status === "formed"` for dimming or a new formed-specific style, per product's call.

- [ ] **Step 3: Update tests for habit-list / habit-detail page**

Search any test that hardcodes `"archived"` as a status value; update to `"formed"` where appropriate. Add new tests:

```ts
it("shows nudge banner on active habit with graduation_eligible=true", () => { /* ... */ });
it("shows Graduate menu item on active habit detail page", () => { /* ... */ });
it("hides Graduate menu item when habit is paused", () => { /* ... */ });
it("shows Reactivate menu item on formed habit detail page", () => { /* ... */ });
```

- [ ] **Step 4: Run all habit-related tests**

```bash
pnpm vitest run tests/components/habits/ tests/app/habits/
```

- [ ] **Step 5: Commit**

```bash
git add components/habits/habit-list.tsx components/habits/habit-detail-content.tsx tests/components/habits tests/app/habits
git commit -m "feat(habits): wire graduation banner, dialogs, and Formed gallery"
```

---

## Task 15: i18n strings (en, zh, zh-TW)

**Files:**
- Modify: `i18n/messages/en.json`, `i18n/messages/zh.json`, `i18n/messages/zh-TW.json`

- [ ] **Step 1: Add new strings under `habits` namespace (and remove archived strings)**

In `en.json`, locate the `habits` block and:
1. Rename `tabs.archived` → `tabs.formed` with value `"Formed"`.
2. Remove `empty.no_archived.*` entries; add:
```json
"empty": {
  "no_formed": {
    "title": "No formed habits yet",
    "description": "Once you graduate a habit, it'll live here as a badge of honor. 🎓"
  }
}
```
3. Add graduation strings:
```json
"graduate": {
  "nudge_title": "Ready to graduate?",
  "nudge_body": "You've built real consistency. Mark it as formed anytime.",
  "nudge_cta": "Graduate",
  "nudge_dismiss": "Not yet",
  "confirm_title": "Graduate \"{name}\"?",
  "confirm_body": "This habit will move to your Formed gallery. You can reactivate it anytime.",
  "confirm_cta": "Graduate",
  "confirm_cancel": "Cancel",
  "success_toast": "🎓 Graduated! Find it in your Formed gallery.",
  "action_label": "Graduate this habit"
},
"reactivate": {
  "confirm_title": "Reactivate \"{name}\"?",
  "confirm_body": "This will move it back to Active. Your streak starts fresh, but your best streak of {n} days is preserved.",
  "confirm_cta": "Reactivate",
  "confirm_cancel": "Cancel",
  "success_toast": "Reactivated. Let's build it again.",
  "action_label": "Reactivate"
},
"formed_gallery": {
  "graduated_on": "Graduated on",
  "at_streak": "At {n}-day streak",
  "total_days_active": "{n} days active before graduation",
  "best_streak": "Best streak: {n} days",
  "reactivate": "Reactivate",
  "delete": "Delete",
  "empty_state": "Graduate your first habit to see it here."
}
```

- [ ] **Step 2: Mirror into zh.json and zh-TW.json**

Use translations (sample zh):
```json
"graduate": {
  "nudge_title": "准备毕业？",
  "nudge_body": "你已经建立了真正的一致性。随时可以标记为已养成。",
  "nudge_cta": "毕业",
  "nudge_dismiss": "暂不",
  "confirm_title": "让「{name}」毕业？",
  "confirm_body": "这个习惯将进入你的已养成展示柜。你可以随时重新激活它。",
  "confirm_cta": "毕业",
  "confirm_cancel": "取消",
  "success_toast": "🎓 毕业啦！去已养成展示柜看看吧。",
  "action_label": "让这个习惯毕业"
}
```
(Populate all keys consistently for zh and zh-TW.)

Also change `tabs.archived` → `tabs.formed` ("已养成" / "已養成").

- [ ] **Step 3: Verify no stale keys**

```bash
pnpm grep -n "no_archived\|tabs.archived\|archiveHabit" i18n/messages/
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add i18n/messages/
git commit -m "i18n(habits): add graduation strings, remove archived strings"
```

---

## Task 16: Final cleanup — typecheck, lint, full test run

**Files:** all modified

- [ ] **Step 1: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: zero errors. If any remain referencing `archived` / `archiveHabit`, Grep for the symbol and fix in place.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: zero errors. Fix any issues (per project rule from `/home/xingdi/code/CLAUDE.md`).

- [ ] **Step 3: Full test suite**

```bash
pnpm test:run
```

Expected: all pass (except the 2 pre-existing failures in `habit-logs.test.ts` noted in project CLAUDE.md — issue #98).

- [ ] **Step 4: Build smoke check**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Manual UI smoke (dev server)**

```bash
pnpm dev
```

Navigate to `/habits`:
- Confirm tabs show Active / Paused / **Formed** (no Archived)
- Create a daily habit, log 21 consecutive days (can seed via DB or use `pnpm vitest` helpers — or just verify nudge logic passes tests)
- On habit detail page, confirm the "Graduate this habit" menu item appears on an active habit
- Graduate the habit → confirm the confirmation dialog, toast, and redirect to Formed tab
- In Formed tab, confirm the FormedHabitCard shows graduation date + streak
- Reactivate from the gallery → confirm it returns to Active with streak 0 and best_streak preserved

- [ ] **Step 6: Commit any final cleanup and push**

```bash
git status  # should be clean or only contain cleanup from steps 1-5
git push -u origin design/habit-graduation
```

Then open a PR via `/gsd:ship` or equivalent. The PR description should reference the spec doc and summarize behavior changes, especially the one-way archived deletion.

---

## Self-review summary

- **Spec coverage:** lifecycle (Task 1, 2, 5), eligibility (Task 4, 7), celebrations/day-21 (Task 3), nudge banner (Task 11, 14), formed gallery (Task 10, 12, 14), graduate dialog (Task 13, 14), reactivate (Task 13, 14), AI tools (Task 9), i18n (Task 15), archived removal (Task 1, 5, 9, 10, 15).
- **Open questions from spec:** resolved inline — nudge dismissal uses a column on `habits` (simplest), Formed gallery uses a distinct `FormedHabitCard` component, confetti reuses existing milestone celebration (no new component), day 21 shares milestone copy for v1 (special copy deferred).
- **Type consistency:** `graduated_at`, `graduated_streak`, `nudge_dismissed_at` are used identically in types, migration, DB layer, API, and UI. `HabitStatus = "active" | "paused" | "formed"` everywhere.
- **No placeholders detected.** All test code and production code blocks are complete.
