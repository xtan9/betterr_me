# PRD V2: Vertical Depth Strategy: From Tracker to Self-Coaching Tool

## Context

BetterR.Me currently functions as a **data recorder** — it captures habits and tasks efficiently but provides almost no coaching, guidance, or emotional engagement. The app demands daily input but gives back only checkboxes and static numbers. This creates a "cold tool" experience that fails to motivate sustained use.

This document proposes **Vertical Depth** features — not more modules, but deeper intelligence within the existing Task and Habit modules — to transform BetterR.Me from a tracker into a compelling self-coaching companion.

---

## Part 1: The Audit — Current User Journeys

### Task Journey (What Exists)
1. User opens `/tasks/new` → sees a bare form: title, description, category (4 toggles), priority (dropdown), date, time
2. Clicks "Create Task" → toast "Task created successfully" → redirected to `/tasks`
3. On dashboard, tasks appear as checkbox rows with priority dots
4. User checks a task → checkbox turns green, title gets strikethrough
5. When all tasks complete → "All tasks done! 🎉" text line
6. **That's it.** No reflection, no context, no "why did this matter?"

### Habit Journey (What Exists)
1. User opens `/habits/new` → form: name, description, category (5 toggles), frequency selector
2. Dashboard shows habit checklist with checkboxes
3. User checks a habit → checkbox turns green, streak counter updates
4. Habit detail page shows: streak counter, 3 progress bars (week/month/all-time), 30-day heatmap
5. Motivation messages exist but are static text with a lightbulb icon (e.g., "Almost done!", "Keep it going!")
6. **That's it.** No "why am I doing this?", no recovery from missed days, no celebration beyond text

---

## Part 2: The Critique — Motivation Gaps

### Gap 1: "Input Without Purpose" — Tasks Lack Intention

**Problem:** The task creation form asks "what" but never "why". There's no field for motivation, no prompt for intention-setting. A task like "Go to gym" sits alongside "Buy milk" with no differentiation in emotional weight. The user never connects the task to their larger goals.

**Evidence:** `task-form.tsx` — fields are: title, description, category, priority, due_date, due_time. Zero fields related to purpose, outcome, or personal meaning. The `description` field is labeled "Optional notes about this task" — purely logistical.

### Gap 2: "Flat Completion" — Finishing Feels Like Nothing

**Problem:** Completing a task produces: a green checkbox + strikethrough text + SWR refetch. Completing ALL tasks for the day produces a single text line: "All tasks done! 🎉". There is no moment of satisfaction, no reflection prompt, no acknowledgment of effort. The completion event — the most motivating moment in any productivity tool — is anti-climactic.

**Evidence:** `tasks-today.tsx:152-159` — the "all complete" state is a `<span>` with emerald text. `motivation-message.tsx` — a static `<p>` tag inside a light background div. No animation, no celebration card, no confetti, no sound.

### Gap 3: "Silent Failure" — Missed Days Are Invisible

**Problem:** When a user misses a habit day, the only signal is a light gray cell on the 30-day heatmap (visible only on the habit detail page). The dashboard shows no indication of broken streaks or missed days. The user returns after a missed day to see the same screen, slightly less green. There's no recovery protocol, no "that's okay, here's how to get back on track."

**Evidence:** `heatmap.tsx` — missed days render as `bg-slate-100 dark:bg-slate-800`. `streak-counter.tsx:13` — streak 0 message is just "Start today!" No distinction between "never started" and "just broke a 30-day streak."

### Gap 4: "No Coaching Voice" — The App Doesn't Guide

**Problem:** The motivation message component has 7 priority levels but they're all generic one-liners ("Getting started", "Halfway", "Almost done"). The app never says anything specific to the user's behavior patterns. It doesn't notice that you always skip Mondays, or that your streak is about to hit a milestone, or that you've been crushing it this week.

**Evidence:** `motivation-message.tsx:29-77` — pure if/else on completion percentage. No personalization, no behavioral insight, no time-awareness beyond morning/afternoon/evening greeting.

### Gap 5: "No Emotional Arc" — Days Feel Identical

**Problem:** Monday feels like Friday. Day 1 of a streak feels like Day 50. The dashboard layout never changes. There's no sense of progression, no "level up" moment, no visual evolution as the user builds consistency. Every day the user opens the app to the exact same static layout.

**Evidence:** `dashboard-content.tsx` — the layout is fixed: greeting → motivation text → stat cards → 2-column grid (habits + tasks). No conditional rendering based on streak milestones, no progressive UI elements, no time-of-day adaptations beyond the greeting word.

---

## Part 3: The Strategy — Deep Features

### A. Task Deep Features (Intention & Clarity)

#### Feature T1: "Why This Matters" — Intention Field

**Concept:** Add an optional `intention` text field to tasks. When creating a task, a subtle prompt asks: "Why does this matter to you?" or "What will completing this make possible?"

**Behavioral Principle:** Implementation intention (Gollwitzer, 1999). People who articulate "why" they're doing something are 2-3x more likely to follow through.

**Implementation:**
- Add `intention` column to `tasks` table (TEXT, nullable)
- Add field to `TaskForm` below description — styled differently (italic, lighter) as a reflection prompt
- Display intention on task detail page in a distinct "Your Why" card
- On dashboard, show intention as subtitle text below task title for high-priority (3) tasks
- When completing a task that has an intention, show a brief "You did this because: {intention}" acknowledgment

**Files to modify:**
- `lib/db/tasks.ts` — add field to schema
- `lib/db/types.ts` — update Task interface
- `lib/validations/task.ts` — add to Zod schema
- `components/tasks/task-form.tsx` — add intention field
- `components/tasks/task-detail-content.tsx` — display intention card
- `components/dashboard/tasks-today.tsx` — show intention for P3 tasks
- `i18n/messages/{en,zh,zh-TW}.json` — add translations
- Migration SQL file

#### Feature T4: "Task Horizon" — Reduce Anxiety, Increase Control

**Concept:** Extend the dashboard's "Today's Tasks" section with a subtle "Coming Up" preview showing tomorrow's tasks. Gives the user forward visibility without overwhelming today's focus. When today is all done, tomorrow auto-expands so the user can get a head start.

**Behavioral Principle:** Zeigarnik effect + anxiety reduction. Knowing what's coming next reduces cognitive load and the "what am I forgetting?" feeling. The auto-expand on completion turns a dead-end into a doorway — momentum, not a wall.

**UX Design:**

```
┌─────────────────────────────────────┐
│  Today's Tasks                [+ Add]│
│                                      │
│  ☐ Prepare presentation       🔴 P3  │
│  ☐ Review PR #226             🟡 P2  │
│  ✅ Buy groceries (strikethrough)    │
│                                      │
│  ── Coming Up (Tomorrow) ──────────  │
│                                      │
│  ☐ Team standup              (dim)   │
│  ☐ Submit report             (dim)   │
│  ☐ Call dentist              (dim)   │
│  +2 more tomorrow →                  │
│                                      │
│  ─────────────────────────────────── │
│  View all tasks →                    │
└─────────────────────────────────────┘
```

**Display hierarchy:** Overdue (red accent) → Today → Coming Up (dimmed)

**Behavior:**
- **Default state**: Show max 3 tomorrow tasks at reduced opacity (`opacity-50`), with `+N more tomorrow` link if more exist
- **All today complete**: Auto-expand tomorrow section to full opacity, show all tasks (not just 3), header changes to "Get a head start on tomorrow"
- **No tomorrow tasks**: Section hidden entirely (no empty state noise)
- **"View all tasks"**: Link at bottom of card, navigates to `/tasks`

**Implementation:**
- Backend: Extend `GET /api/dashboard` response to include `tasks_tomorrow` array — reuses existing `TasksDB.getUpcomingTasks(userId, 1)` method filtered to tomorrow only
- Frontend: Extend `TasksToday` component with a "Coming Up" section below the existing task list
- Tomorrow tasks use the same `TaskRow` component but with `opacity-50` wrapper class
- Auto-expand logic: when `tasks_today` are all completed, toggle `opacity-50` off and show full list
- Add "View all tasks" link at component bottom

**Files to modify:**
- `app/api/dashboard/route.ts` — add `tasks_tomorrow` to response (using existing `getUpcomingTasks`)
- `components/dashboard/tasks-today.tsx` — add "Coming Up" section, auto-expand logic, "View all tasks" link
- `components/dashboard/dashboard-content.tsx` — pass `tasks_tomorrow` prop
- `i18n/messages/{en,zh,zh-TW}.json` — translations for "Coming Up", "Get a head start", "+N more tomorrow", "View all tasks"

#### Feature T3: "Completion Reflection" — The App That Listens

**Concept:** For meaningful tasks only, offer a passive inline reflection moment at completion. No popups, no modals — the completed task lingers for 3 seconds with an inline emoji strip, then fades away whether the user engages or not.

**Trigger Filter:** Only activates for **Priority 3 (High)** tasks OR tasks with an **Intention** field set. Low-priority busywork checks off silently as before.

**Behavioral Principle:** Selective metacognitive reflection. Prompting reflection only on tasks the user already signaled as important avoids "nag fatigue" while still building self-awareness and planning calibration over time.

**UX Flow:**
1. User checks a qualifying task (P3 or has intention)
2. Task stays visible for ~3 seconds instead of immediately moving to completed
3. A small inline emoji row appears where the description was:
   `How was it?  ⚡ Easy  👌 Good  💪 Hard`
4. **If user taps an option:** saves the reflection, task animates away immediately
5. **If user does nothing:** task fades away automatically after 3 seconds
6. Non-qualifying tasks (P0-P2 without intention) toggle instantly with no reflection — zero change to current behavior

**Implementation:**
- Add `completion_difficulty` column to `tasks` table (INTEGER 1-3, nullable)
- Reflection UI is inline inside the task card/row — no popover, no overlay, no z-index
- 3-second CSS transition with opacity fade (`transition-opacity duration-300`)
- Save via `PATCH /api/tasks/[id]` with `completion_difficulty` field
- On task detail page, show the saved reflection if present
- Weekly insight (H3) can aggregate difficulty distribution over time

**Files to modify:**
- `lib/db/tasks.ts`, `lib/db/types.ts`
- `components/tasks/task-card.tsx` — inline reflection row with 3s linger + fade
- `components/dashboard/tasks-today.tsx` — inline reflection row with 3s linger + fade
- `components/tasks/task-detail-content.tsx` — display saved reflection
- `i18n/messages/{en,zh,zh-TW}.json`
- Migration SQL file

---

### B. Habit Deep Features (Retention & Streaks)

#### Feature H1: "Absence-Aware Recovery" — Never Miss Twice + Lapse + Hiatus

**Concept:** When a user returns after missing habit days, show a context-appropriate card on the dashboard. The tone and actions adapt based on how long they've been away — because "you missed yesterday" feels wrong on day 4 of a lapse.

**Behavioral Principle:** James Clear's "Never Miss Twice" rule for short absences. For longer lapses, the priority shifts from streak preservation to preventing the "what-the-hell effect" (abandonment spiral). For extended hiatuses, the goal is a warm re-engagement that respects the user's changed circumstances.

**3-Tier Logic Tree:**

```
For each active habit scheduled today:
  missedDays = count of scheduled days (per frequency) with no completed log,
               walking backwards from yesterday until the last completed day

  Case A — Recovery (missedDays == 1):
    Amber card, light tone
    "You missed [habit] yesterday. The rule: never miss twice."
    CTA: inline checkbox to complete today
    On completion: "Back on track!"

  Case B — Lapse (missedDays 2-6):
    Blue/neutral card, honest acknowledgment
    "It's been [X] days since [habit]. No judgment — today is a good day to restart."
    Shows previous streak: "Your streak was [N] days. Let's build a new one."
    CTA: inline checkbox to complete today
    On completion: "Day 1. Let's go."

  Case C — Hiatus (missedDays >= 7):
    Warm/welcoming card — a homecoming, not a guilt trip
    "Welcome back! It's been a while. Want to continue [habit], or adjust your routine?"
    CTAs: "Resume" (complete today) | "Pause this habit" | "Change frequency"
    On resume: "Fresh start! Day 1."
```

**Important nuances:**
- **Frequency-aware calculation**: "missed days" counts scheduled days only. A weekly habit with no log for 3 calendar days is NOT a miss — they only need to complete it once per week. Uses existing `shouldTrackOnDate()` logic from `lib/db/habit-logs.ts`.
- **Dashboard real estate cap**: Show max **3 cards**. Priority order: Hiatus > Lapse > Recovery. Within same tier, prioritize by longest-streak-before-lapse (most to lose = most urgent to recover).
- **No card shown if**: habit was completed today, habit is paused/archived, or habit is not scheduled today.
- **Success state transformation**: When user completes a habit from any card, the card transforms to a brief success message before fading away.

**Implementation:**
- Backend: Extend `GET /api/dashboard` to include `missed_scheduled_periods` per habit (computed from logs using `shouldTrackOnDate()` + last completed log date)
- New component: `AbsenceCard` — single component with 3 visual variants (recovery/lapse/hiatus) driven by `missedDays` prop
- Hiatus variant includes action buttons for pause/frequency change (reuses existing PATCH `/api/habits/[id]` endpoint)
- Dashboard renders up to 3 `AbsenceCard` components between motivation message and stat cards

**Files to modify:**
- `lib/db/habit-logs.ts` — add `getMissedScheduledDays(habitId, frequency)` method
- `app/api/dashboard/route.ts` — include missed days data per habit
- New: `components/dashboard/absence-card.tsx` — 3-variant component
- `components/dashboard/dashboard-content.tsx` — render AbsenceCards between motivation and stats, capped at 3
- `i18n/messages/{en,zh,zh-TW}.json` — translations for all 3 tiers + success states

#### Feature H2: "Streak Milestones & Celebrations"

**Concept:** At specific streak thresholds (7, 14, 30, 50, 100, 365 days), show a celebration moment: a milestone card with the achievement, a congratulatory message, and the option to share/screenshot. Also show a "next milestone" indicator on the habit detail page.

**Behavioral Principle:** Variable reward scheduling + loss aversion. Knowing you're 2 days from a milestone creates powerful motivation to not break the streak. The celebration moment creates a dopamine spike that reinforces the habit loop.

**Implementation:**
- New component: `MilestoneCard` — shown on dashboard when a habit hits a milestone today
- New component: `NextMilestone` — shown on habit detail page: "3 more days to your 30-day milestone!"
- Milestone thresholds: [7, 14, 30, 50, 100, 200, 365]
- Visual: gradient card (similar to the "all complete" celebration card from UI Design V2), with a trophy/star icon and the milestone number prominently displayed
- Optional: confetti animation using a lightweight library (canvas-confetti, ~3KB)
- Store milestones achieved in a new `habit_milestones` table for history

**Files to modify:**
- New: `components/habits/milestone-card.tsx`
- New: `components/habits/next-milestone.tsx`
- `components/dashboard/dashboard-content.tsx` — render milestone cards
- `components/habits/habit-detail-content.tsx` — render next milestone
- `lib/db/types.ts` — milestone types
- `i18n/messages/{en,zh,zh-TW}.json`
- Optional: migration for `habit_milestones` table

#### Feature H3: "Weekly Insight Card" — Behavioral Pattern Recognition

**Concept:** Every Monday (or user's configured week start), show a "Your Week in Review" card on the dashboard that surfaces one behavioral insight. Examples: "You completed 85% of habits this week — your best week yet!" or "You tend to skip habits on Wednesdays. Consider adjusting your Wednesday routine." or "Your morning habits have 90% completion vs 60% for evening. You're a morning person!"

**Behavioral Principle:** Self-awareness drives self-improvement. Reflecting on patterns (not just data) helps users understand their own behavior and make intentional adjustments. This is the "coaching" in self-coaching.

**Implementation:**
- New component: `WeeklyInsightCard` — shown on dashboard on the configured `week_start_day`
- Backend: New API endpoint `GET /api/insights/weekly` that computes insights from habit logs:
  - Week-over-week completion rate comparison
  - Day-of-week completion patterns
  - Best/worst performing habits
  - Streak milestone proximity
- Insight selection algorithm: pick the most relevant/actionable insight from computed data
- Card is dismissible and shows only once per week (store dismissal in localStorage)
- Visual: blue/indigo card with a brain/lightbulb icon

**Files to modify:**
- New: `app/api/insights/weekly/route.ts`
- New: `lib/db/insights.ts` — insight computation logic
- New: `components/dashboard/weekly-insight-card.tsx`
- `components/dashboard/dashboard-content.tsx` — render insight card
- `i18n/messages/{en,zh,zh-TW}.json`

---

## Part 4: Implementation Priority & Phasing

### Phase 1 — Quick Wins (1-2 days each)
1. **H1: Absence-Aware Recovery** — Highest impact-to-effort ratio. Addresses the #1 habit killer (the day after a miss). 3-tier logic with frequency-aware calculation.
2. **T1: Intention Field** — Simple schema + form change with outsized motivational impact.
3. **T4: Task Horizon** — Extends existing dashboard component with "Coming Up" section. Reuses existing `getUpcomingTasks()` API. Low risk, immediate anxiety reduction.

### Phase 2 — Medium Effort (2-3 days each)
4. **H2: Streak Milestones** — Adds the celebration and anticipation that the app completely lacks. New components but straightforward logic.
5. **T3: Completion Reflection** — Passive inline reflection for meaningful tasks. Lightweight CSS transition + conditional trigger.

### Phase 3 — Deeper Investment (3-5 days)
6. **H3: Weekly Insight Card** — Requires the most backend work (pattern computation), but delivers the most "coaching" value. Can eventually infer energy patterns from completion timestamps.

---

## Part 5: Verification Plan

For each feature:
1. **Unit tests**: New DB methods, insight computation, validation schemas
2. **Component tests**: New UI components render correctly with various states
3. **i18n**: All 3 locales (en, zh, zh-TW) have translations
4. **E2E**: Critical paths — task creation with intention, habit recovery card appearance, milestone celebration display
5. **Accessibility**: New components pass axe checks, keyboard navigable, screen reader compatible
6. **Manual smoke test**: Walk through each journey end-to-end on desktop and mobile

---

## Summary

| # | Feature | Module | Gap Addressed | Effort | Impact |
|---|---------|--------|---------------|--------|--------|
| H1 | Absence-Aware Recovery | Habits | Silent Failure | Low | High |
| T1 | Intention Field | Tasks | Input Without Purpose | Low | High |
| T4 | Task Horizon | Tasks | No Forward Visibility | Low | High |
| H2 | Streak Milestones | Habits | Flat Completion / No Arc | Medium | High |
| T3 | Completion Reflection | Tasks | Flat Completion | Medium | Medium |
| H3 | Weekly Insight Card | Habits | No Coaching Voice | High | High |

**6 features, 3 phases.** The goal is not more features — it's deeper features. Each one transforms a moment that currently feels empty into a moment that feels meaningful.
