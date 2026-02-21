# Absence Card Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign AbsenceCard to be an informational reminder with dismiss (X) and "View habit" link, removing the redundant "Complete today" toggle.

**Architecture:** The AbsenceCard drops its `onToggle` prop and all completion logic. It gains an `onDismiss` callback and an `onNavigate`-based "View habit" link. Dismiss state is managed in `DashboardContent` via localStorage (date-scoped keys), mirroring the existing `WeeklyInsightCard` pattern.

**Tech Stack:** React, next-intl, localStorage, Vitest + Testing Library

---

### Task 1: Update i18n strings (all 3 locales)

**Files:**
- Modify: `i18n/messages/en.json:194-207`
- Modify: `i18n/messages/zh.json:194-207`
- Modify: `i18n/messages/zh-TW.json:194-207`

**Step 1: Update en.json absence block**

Replace the `absence` object contents with:
```json
"absence": {
  "recoveryTitle": "{name} — missed {days, plural, one {# day} other {# days}}",
  "lapseTitle": "{name} — {days, plural, one {# day} other {# days}} since last check-in",
  "hiatusTitle": "{name} — it's been {days, plural, one {# day} other {# days}}",
  "recoveryTitleWeeks": "{name} — missed {days, plural, one {# week} other {# weeks}}",
  "lapseTitleWeeks": "{name} — {days, plural, one {# week} other {# weeks}} since last check-in",
  "hiatusTitleWeeks": "{name} — it's been {days, plural, one {# week} other {# weeks}}",
  "previousStreak": "You had a {days}-day streak before",
  "previousStreakWeeks": "You had a {days}-week streak before",
  "viewHabit": "View habit",
  "changeFrequency": "Change frequency",
  "dismiss": "Dismiss"
}
```

Removed: `markComplete`, `completed`, `resume`.
Added: `viewHabit`, `dismiss`.

**Step 2: Update zh.json absence block**

```json
"absence": {
  "recoveryTitle": "{name} — 已中断 {days} 天",
  "lapseTitle": "{name} — 距上次打卡已 {days} 天",
  "hiatusTitle": "{name} — 已经 {days} 天没有记录了",
  "recoveryTitleWeeks": "{name} — 已中断 {days} 周",
  "lapseTitleWeeks": "{name} — 距上次打卡已 {days} 周",
  "hiatusTitleWeeks": "{name} — 已经 {days} 周没有记录了",
  "previousStreak": "之前你保持了 {days} 天的连续记录",
  "previousStreakWeeks": "之前你保持了 {days} 周的连续记录",
  "viewHabit": "查看习惯",
  "changeFrequency": "更改频率",
  "dismiss": "关闭"
}
```

**Step 3: Update zh-TW.json absence block**

```json
"absence": {
  "recoveryTitle": "{name} — 已中斷 {days} 天",
  "lapseTitle": "{name} — 距上次打卡已 {days} 天",
  "hiatusTitle": "{name} — 已經 {days} 天沒有紀錄了",
  "recoveryTitleWeeks": "{name} — 已中斷 {days} 週",
  "lapseTitleWeeks": "{name} — 距上次打卡已 {days} 週",
  "hiatusTitleWeeks": "{name} — 已經 {days} 週沒有紀錄了",
  "previousStreak": "之前你保持了 {days} 天的連續紀錄",
  "previousStreakWeeks": "之前你保持了 {days} 週的連續紀錄",
  "viewHabit": "查看習慣",
  "changeFrequency": "更改頻率",
  "dismiss": "關閉"
}
```

**Step 4: Commit**

```bash
git add i18n/messages/en.json i18n/messages/zh.json i18n/messages/zh-TW.json
git commit -m "i18n: update absence card strings — add viewHabit/dismiss, remove markComplete/resume/completed"
```

---

### Task 2: Rewrite AbsenceCard component

**Files:**
- Modify: `components/dashboard/absence-card.tsx`

**Step 1: Write the new AbsenceCard**

Replace the entire component with this implementation. Key changes:
- Remove: `onToggle` prop, `isCompleting`/`justCompleted` state, `handleComplete`, `Checkbox` import, completion UI
- Add: `onDismiss` callback prop, dismiss `X` button (top-right), "View habit" link via `onNavigate`
- Keep: variant logic, icon/color config, previous streak display for lapse

```tsx
"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Clock, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HabitWithAbsence } from "@/lib/db/types";

type AbsenceVariant = "recovery" | "lapse" | "hiatus";

function getVariant(missed: number, unit: 'days' | 'weeks'): AbsenceVariant {
  if (unit === 'weeks') {
    if (missed <= 1) return "recovery";
    if (missed <= 3) return "lapse";
    return "hiatus";
  }
  if (missed <= 2) return "recovery";
  if (missed <= 6) return "lapse";
  return "hiatus";
}

const variantConfig = {
  recovery: {
    icon: AlertCircle,
    border: "border-l-amber-500",
    bg: "bg-absence-warning-bg",
    iconColor: "text-absence-warning-icon",
    titleColor: "text-absence-warning-title",
  },
  lapse: {
    icon: Clock,
    border: "border-l-blue-500",
    bg: "bg-absence-info-bg",
    iconColor: "text-absence-info-icon",
    titleColor: "text-absence-info-title",
  },
  hiatus: {
    icon: Heart,
    border: "border-l-orange-500",
    bg: "bg-absence-caution-bg",
    iconColor: "text-absence-caution-icon",
    titleColor: "text-absence-caution-title",
  },
};

interface AbsenceCardProps {
  habit: HabitWithAbsence;
  onDismiss: (habitId: string) => void;
  onNavigate: (path: string) => void;
}

export function AbsenceCard({ habit, onDismiss, onNavigate }: AbsenceCardProps) {
  const t = useTranslations("dashboard.absence");

  const unit = habit.absence_unit ?? 'days';
  const variant = getVariant(habit.missed_scheduled_periods, unit);
  const config = variantConfig[variant];
  const Icon = config.icon;
  const titleSuffix = unit === 'weeks' ? 'Weeks' : '';

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border-l-4",
        config.border,
        config.bg,
      )}
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", config.titleColor)}>
          {t(`${variant}Title${titleSuffix}`, { name: habit.name, days: habit.missed_scheduled_periods })}
        </p>

        {variant === "lapse" && habit.previous_streak > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(unit === 'weeks' ? "previousStreakWeeks" : "previousStreak", { days: habit.previous_streak })}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => onNavigate(`/habits/${habit.id}`)}
          >
            {t("viewHabit")}
          </button>
          {variant === "hiatus" && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => onNavigate(`/habits/${habit.id}/edit`)}
              >
                {t("changeFrequency")}
              </button>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDismiss(habit.id)}
        className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        aria-label={t("dismiss")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
```

**Step 2: Run lint**

```bash
pnpm lint
```

**Step 3: Commit**

```bash
git add components/dashboard/absence-card.tsx
git commit -m "refactor: rewrite AbsenceCard as dismissable reminder with view-habit link"
```

---

### Task 3: Update DashboardContent to manage dismiss state

**Files:**
- Modify: `components/dashboard/dashboard-content.tsx`

**Step 1: Add dismiss state and filter dismissed habits**

In `DashboardContent`, add:
1. A `dismissedIds` state (initialized from localStorage for today)
2. A `handleDismissAbsence` callback that sets localStorage and updates state
3. Filter `absenceHabits` by `dismissedIds`
4. Replace `onToggle={handleToggleHabit}` with `onDismiss={handleDismissAbsence}` on `<AbsenceCard>`

Specific changes in `dashboard-content.tsx`:

a) Add import for `getLocalDateString` (already imported) — no change needed.

b) Inside `DashboardContent`, after `const today = ...`, add:

```tsx
const [dismissedAbsenceIds, setDismissedAbsenceIds] = useState<Set<string>>(() => {
  if (typeof window === "undefined") return new Set();
  const stored = localStorage.getItem(`absence-dismissed-${today}`);
  return stored ? new Set(JSON.parse(stored)) : new Set();
});

const handleDismissAbsence = useCallback((habitId: string) => {
  setDismissedAbsenceIds(prev => {
    const next = new Set(prev);
    next.add(habitId);
    localStorage.setItem(`absence-dismissed-${today}`, JSON.stringify([...next]));
    return next;
  });
}, [today]);
```

c) Update the `absenceHabits` filter (around line 338) to also exclude dismissed:

```tsx
const absenceHabits = data.habits
  .filter((h) => h.missed_scheduled_periods > 0 && !h.completed_today && !dismissedAbsenceIds.has(h.id))
  .sort((a, b) => normalizePeriods(b) - normalizePeriods(a))
  .slice(0, 3);
```

d) Update `<AbsenceCard>` props (around line 374):

```tsx
<AbsenceCard
  key={habit.id}
  habit={habit}
  onDismiss={handleDismissAbsence}
  onNavigate={router.push}
/>
```

e) Add `useCallback` to imports if not already there (it is already imported — no change).

**Step 2: Run lint**

```bash
pnpm lint
```

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-content.tsx
git commit -m "feat: add localStorage-based dismiss for absence cards"
```

---

### Task 4: Rewrite AbsenceCard tests

**Files:**
- Modify: `tests/components/dashboard/absence-card.test.tsx`

**Step 1: Rewrite the test file**

The test file needs significant changes because:
- `onToggle` prop → `onDismiss` prop
- No more checkbox, "Complete today", "Resume today", or welcome-back assertions
- New assertions: "View habit" link, dismiss button, "Change frequency" for hiatus

Replace the entire test file with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AbsenceCard } from "@/components/dashboard/absence-card";
import type { HabitWithAbsence } from "@/lib/db/types";

const messages = {
  dashboard: {
    absence: {
      recoveryTitle: "{name} — missed {days} day(s)",
      lapseTitle: "{name} — {days} days since last check-in",
      hiatusTitle: "{name} — it's been {days} days",
      recoveryTitleWeeks: "{name} — missed {days} week(s)",
      lapseTitleWeeks: "{name} — {days} weeks since last check-in",
      hiatusTitleWeeks: "{name} — it's been {days} weeks",
      previousStreak: "You had a {days}-day streak before",
      previousStreakWeeks: "You had a {days}-week streak before",
      viewHabit: "View habit",
      changeFrequency: "Change frequency",
      dismiss: "Dismiss",
    },
  },
};

function renderWithIntl(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

function makeHabit(overrides: Partial<HabitWithAbsence> = {}): HabitWithAbsence {
  return {
    id: "h1",
    user_id: "user-1",
    name: "Morning Run",
    description: null,
    category: "health",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 0,
    best_streak: 10,
    paused_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    completed_today: false,
    monthly_completion_rate: 50,
    missed_scheduled_periods: 1,
    previous_streak: 5,
    absence_unit: "days",
    ...overrides,
  };
}

describe("AbsenceCard", () => {
  it("renders recovery variant for 1-2 missed days with view-habit link", () => {
    const habit = makeHabit({ missed_scheduled_periods: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — missed 2 day/)).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
    expect(screen.queryByText("Change frequency")).not.toBeInTheDocument();
  });

  it("renders lapse variant for 3-6 missed days with previous streak", () => {
    const habit = makeHabit({ missed_scheduled_periods: 4, previous_streak: 7 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — 4 days since last check-in/)).toBeInTheDocument();
    expect(screen.getByText("You had a 7-day streak before")).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
  });

  it("renders hiatus variant for 7+ missed days with view-habit and change-frequency links", () => {
    const habit = makeHabit({ missed_scheduled_periods: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/Morning Run — it's been 10 days/)).toBeInTheDocument();
    expect(screen.getByText("View habit")).toBeInTheDocument();
    expect(screen.getByText("Change frequency")).toBeInTheDocument();
  });

  it("calls onDismiss with habit id when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 1 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={onDismiss} onNavigate={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("h1");
  });

  it("navigates to habit detail on 'View habit' click", () => {
    const onNavigate = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 2 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={onNavigate} />
    );

    fireEvent.click(screen.getByText("View habit"));
    expect(onNavigate).toHaveBeenCalledWith("/habits/h1");
  });

  it("navigates to edit page on 'Change frequency' click (hiatus)", () => {
    const onNavigate = vi.fn();
    const habit = makeHabit({ missed_scheduled_periods: 10 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={onNavigate} />
    );

    fireEvent.click(screen.getByText("Change frequency"));
    expect(onNavigate).toHaveBeenCalledWith("/habits/h1/edit");
  });

  it("does not show previous streak for recovery variant", () => {
    const habit = makeHabit({ missed_scheduled_periods: 1, previous_streak: 5 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("does not show previous streak text when previous_streak is 0", () => {
    const habit = makeHabit({ missed_scheduled_periods: 4, previous_streak: 0 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("does not show previous streak for hiatus variant even when previous_streak > 0", () => {
    const habit = makeHabit({ missed_scheduled_periods: 10, previous_streak: 15 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.queryByText(/streak before/)).not.toBeInTheDocument();
  });

  it("renders lapse variant at exactly 3 missed days (boundary)", () => {
    const habit = makeHabit({ missed_scheduled_periods: 3 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/3 days since last check-in/)).toBeInTheDocument();
  });

  it("renders hiatus variant at exactly 7 missed days (boundary)", () => {
    const habit = makeHabit({ missed_scheduled_periods: 7 });

    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText(/it's been 7 days/)).toBeInTheDocument();
  });

  // --- Week-based tests ---

  it("renders week-based text for weekly habits (recovery: 1 missed week)", () => {
    const habit = makeHabit({
      frequency: { type: "times_per_week", count: 3 },
      missed_scheduled_periods: 1,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/missed 1 week/)).toBeInTheDocument();
  });

  it("renders week-based lapse variant for 2-3 missed weeks", () => {
    const habit = makeHabit({
      frequency: { type: "weekly" },
      missed_scheduled_periods: 2,
      previous_streak: 4,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/2 weeks since last check-in/)).toBeInTheDocument();
    expect(screen.getByText("You had a 4-week streak before")).toBeInTheDocument();
  });

  it("renders week-based hiatus variant for 4+ missed weeks", () => {
    const habit = makeHabit({
      frequency: { type: "weekly" },
      missed_scheduled_periods: 5,
      absence_unit: "weeks",
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/it's been 5 weeks/)).toBeInTheDocument();
  });

  it("falls back to day-based rendering when absence_unit is undefined", () => {
    const habit = makeHabit({
      missed_scheduled_periods: 3,
      absence_unit: undefined as unknown as 'days',
    });
    renderWithIntl(
      <AbsenceCard habit={habit} onDismiss={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByText(/3 days since last check-in/)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests**

```bash
pnpm vitest run tests/components/dashboard/absence-card.test.tsx
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/components/dashboard/absence-card.test.tsx
git commit -m "test: rewrite absence card tests for dismiss + view-habit redesign"
```

---

### Task 5: Update DashboardContent tests

**Files:**
- Modify: `tests/app/dashboard/dashboard-content.test.tsx`

**Step 1: Update test messages and assertions**

In the test file:

a) Update the `absence` messages object to match new strings (remove `markComplete`, `completed`, `resume`; add `viewHabit`, `dismiss`).

b) Update the absence-card-related tests:
- The test "renders up to 3 absence cards sorted by missed_scheduled_periods descending" — keep assertions about text, remove any assertions about "Complete today" or "Resume today".
- The test "sorts absence cards by normalized severity" — same: text assertions only.
- The test "does not show absence cards when no habits have missed days" — no change needed.

The key change is in the messages mock — replace:
```ts
markComplete: "Complete today",
completed: "{name} — welcome back!",
resume: "Resume today",
```
with:
```ts
viewHabit: "View habit",
dismiss: "Dismiss",
```

**Step 2: Run tests**

```bash
pnpm vitest run tests/app/dashboard/dashboard-content.test.tsx
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/app/dashboard/dashboard-content.test.tsx
git commit -m "test: update dashboard content tests for absence card redesign"
```

---

### Task 6: Run full test suite and lint

**Step 1: Run lint**

```bash
pnpm lint
```

Expected: No errors.

**Step 2: Run full test suite**

```bash
pnpm test:run
```

Expected: All tests pass (except the 2 known pre-existing failures in `habit-logs.test.ts`).

**Step 3: Final commit (if any lint fixes needed)**

```bash
git add -A && git commit -m "fix: lint fixes for absence card redesign"
```
