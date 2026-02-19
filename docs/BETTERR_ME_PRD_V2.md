# BetterR.Me - Product Requirements Document (PRD)
## V2.0 - Current State & Next Horizons

**Date:** February 18, 2026
**Status:** Living Document
**Version:** 2.0
**Previous:** `BETTERR_ME_PRD_V1.2.md` (V1 era), `FEATURE_VERTICAL_DEPTH_STRATEGY.md`, `FEATURE_RECURRING_TASKS.md`

---

## REVISION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2, 2026 | Initial PRD — lean V1 scope |
| 1.2 | Feb 3, 2026 | Added Mood Check-ins spec (V1.5), user personas, accessibility |
| 2.0 | Feb 18, 2026 | Reflects shipped reality: V1.0-V2.1 milestones, vertical depth features, recurring tasks, UI redesign |

### What Changed Since V1.2
- **Shipped 4 milestones** (v1.0 Codebase Hardening, v1.1 Dashboard Task Fixes, v2.0 UI Style Redesign, v2.1 UI Polish & Refinement)
- **Shipped all 6 Vertical Depth features** (intention field, task horizon, absence-aware recovery, streak milestones, completion reflection, weekly insights)
- **Shipped Recurring Tasks** (hybrid template + on-demand instance model)
- **UI redesign** — sidebar navigation, design tokens, card-on-gray layouts
- **Tech stack** — upgraded to Next.js 16
- **Test suite** — grown to 1084+ tests (86 Vitest files + 11 Playwright specs)
- **Feature PRDs** renamed: `PRD_V2_*` → `FEATURE_*` to distinguish from master PRD

---

## 1. EXECUTIVE SUMMARY

BetterR.Me is a **daily operating system for self-improvement and productivity** that helps anyone become a better version of themselves through consistent habit building, task execution, and behavioral self-coaching.

**Core Thesis:** Users return daily when the app creates an addictive daily ritual around tracking habits, seeing streaks, receiving behavioral insights, and feeling emotionally guided — not just checked off.

**Current State:** BetterR.Me is a fully functional, shipped product with:
- Habit tracking with 5 frequency types, streaks, milestones, heatmaps
- Task management with priorities, categories, intentions, recurring tasks
- Self-coaching: absence-aware recovery, completion reflections, weekly insights
- Sidebar navigation, dark mode, 56 semantic design tokens
- Three locales (en, zh, zh-TW)
- 1084+ automated tests

---

## 2. MARKET CONTEXT

*(Unchanged from V1.2 — see Section 2 in `BETTERR_ME_PRD_V1.2.md` for competitive landscape and market opportunity.)*

**Updated Competitive Edge:**
- Self-coaching features (absence recovery, insights, reflections) — no competitor does this
- Recurring tasks with full scope editing (this/following/all) — Google Calendar-level control
- Multilingual from day one (EN, 中文, 繁體中文)
- Retention-first design with behavioral psychology principles

---

## 3. PRODUCT VISION & VALUES

### Vision
"BetterR.Me is where users go every day to become the best version of themselves — through building consistent habits, executing on daily priorities, receiving behavioral insights, and feeling guided through the ups and downs of self-improvement."

### User Personas

**Persona 1: The Consistency Builder**
- Goal: Build sustainable habits (meditation, exercise, reading)
- Motivation: Streaks, seeing long-term patterns
- Frequency: Daily, 2-3 minutes
- Served by: Habit system, streak milestones, heatmaps, absence recovery

**Persona 2: The Productivity Warrior**
- Goal: Execute priorities and get work done
- Motivation: Completing tasks, clearing backlog
- Frequency: 2-3x daily
- Served by: Task system, recurring tasks, intentions, completion reflections

**Persona 3: The Data Junkie**
- Goal: Track everything and understand patterns
- Motivation: Dashboard metrics, trends, insights
- Frequency: Daily + weekly reviews
- Served by: Weekly insights, habit stats, task horizon

**Persona 4: The Self-Awareness Seeker** *(Future — V2.5+)*
- Goal: Understand emotional patterns and triggers
- Motivation: Mental health improvement, therapy support
- Served by: Mood Check-ins *(not yet built — see Section 18)*

### Core Values
1. **Simplicity First** - No friction between intention and action
2. **Progress Visible** - Make it impossible to ignore your improvement
3. **Compassionate** - Streaks break; we don't shame users
4. **Multi-lingual** - Support EN, 中文, 繁體中文 equally

---

## 4. SHIPPED FEATURES

### 4.1 HABIT SYSTEM

**Create Habit:**
- Name (required, max 100 chars), description (optional, max 500 chars)
- Category: Health, Wellness, Learning, Productivity, Other
- Frequency: Daily, Weekdays (Mon-Fri), Weekly (any day counts), Times per week (2x or 3x), Custom days
- Status: Active, Paused, Archived
- 20-habit limit per user

**Habit Tracking:**
- 1-click toggle from dashboard to log completion for today
- Edit past logs (add missed days, undo mistakes) — limited to 7 days back
- Habit detail page with:
  - Current streak + personal best streak
  - Completion percentage (this week, this month, all-time)
  - 30-day calendar heatmap (green = done, gray = missed)
  - Next milestone indicator ("X days to your Y-day milestone!")

**Streak Calculation:**
- Frequency-aware: streaks count scheduled days only, not calendar days
- Adaptive lookback: 30→60→120→240→365 days based on streak length
- Paused habits freeze streak (days while paused don't count as missed)
- Single `shouldTrackOnDate()` source of truth in `lib/habits/format.ts`

**Streak Milestones & Celebrations:**
- Milestone thresholds: 7, 14, 30, 50, 100, 200, 365 days
- Celebration card on dashboard when a habit hits a milestone
- Next milestone indicator on habit detail page
- Milestone history stored in `habit_milestones` table

**Absence-Aware Recovery (3-Tier):**
- Recovery (1 missed day): Amber card — "Never miss twice"
- Lapse (2-6 missed days): Blue card — "No judgment — restart today"
- Hiatus (7+ missed days): Warm card — "Welcome back! Resume, pause, or change frequency?"
- Max 3 cards on dashboard, prioritized by severity
- Frequency-aware calculation (uses `shouldTrackOnDate()`)

### 4.2 TASK SYSTEM

**Create Task:**
- Title (required), description (optional)
- Priority: None (0), Low (1), Medium (2), High (3)
- Due date (required), due time (optional)
- Category: Work, Personal, Shopping, Other (optional)
- Intention field: "Why does this matter to you?" (optional, max 200 chars)
- Status: Not started, In progress, Completed

**Task Management:**
- View all tasks with filter/sort by priority, due date, status
- Mark complete with optional reflection (for P3 or tasks with intention)
- Quick stats: X/Y tasks completed today

**Completion Reflection:**
- Triggered for Priority 3 tasks or tasks with an intention
- Inline emoji strip: Easy / Good / Hard
- 3-second auto-dismiss if user doesn't engage
- Saved as `completion_difficulty` (1-3) on the task

**Task Horizon (Dashboard):**
- "Coming Up (Tomorrow)" section shows up to 3 upcoming tasks
- Auto-expands when all today's tasks are complete: "Get a head start on tomorrow"
- "View all tasks" link at bottom

**Recurring Tasks:**
- Hybrid template + on-demand instance model
- Supported frequencies: Daily, Every N days, Weekly on specific days, Biweekly, Monthly by date, Monthly by weekday, Yearly
- End conditions: Never, After N times, On specific date
- Edit/delete scope: This instance only, This and following, All instances (Google Calendar style)
- 7-day rolling window generation, no cron jobs
- Instances are real task rows — all features (reflection, intention) work on recurring instances
- See `FEATURE_RECURRING_TASKS.md` for full spec

### 4.3 DAILY DASHBOARD

**Layout:**
- Sidebar navigation (collapsible, 224px expanded / 60px collapsed)
- Card-on-gray layout with semantic design tokens
- Greeting with time-based message
- Motivational message (priority-based, styled with colored background)

**Sections:**
- Daily snapshot: habits completed, tasks completed, best streak
- Absence cards (up to 3, for missed habits)
- Milestone celebration cards (when a habit hits a milestone)
- Weekly insight card (on configured week start day)
- Habit checklist: all active habits with 1-click toggle
- Tasks today: today's tasks + "Coming Up" tomorrow preview

**Weekly Insight Card:**
- Surfaces one behavioral insight per week on the configured week start day
- Insight types: streak proximity, best week, best habit, worst day, improvement, decline
- Priority-ranked: urgent (streak proximity) > celebration > correction > generic
- Dismissible, stores dismissal in localStorage

### 4.4 SETTINGS & PREFERENCES
- Week start day (Monday vs Sunday)
- Theme (Light/Dark/System)
- Language (English, 中文, 繁體中文)
- Data export (ZIP of habits + tasks)

### 4.5 NAVIGATION & UI

**Sidebar Navigation:**
- Flat navigation: Dashboard, Habits, Tasks
- Icon containers with teal hover/active states
- Collapse/expand with state persistence
- User footer with profile avatar and logout
- Badge counts for habits and tasks

**Design System:**
- 56 semantic CSS design tokens (categories, priorities, status indicators)
- Full light/dark mode support
- Card grid spacing with `gap-card-gap` semantic token
- Consistent spacing and padding throughout

### 4.6 INTERNATIONALIZATION
- English (en), Simplified Chinese (zh), Traditional Chinese (zh-TW)
- All UI strings translated across 7 namespaces: common, home, dashboard, habits, auth, tasks, settings
- Known limitation: `describeRecurrence()` returns English-only descriptions

---

## 5. TECHNOLOGY STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, React 19) |
| Auth & DB | Supabase SSR (`@supabase/ssr`) |
| UI | shadcn/ui + Radix UI (unified `radix-ui` package) + Tailwind CSS 3 |
| Forms | react-hook-form + zod |
| Data fetching | SWR (client), fetch (server) |
| i18n | next-intl |
| Theming | next-themes (class-based dark mode) |
| Testing | Vitest + Testing Library + vitest-axe + Playwright |
| Package manager | pnpm 10.11 |
| Deployment | Vercel (frontend) + Supabase (backend/DB) |

---

## 6. DATABASE SCHEMA

### 6.1 Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User identity & preferences | `id`, `email`, `name`, `avatar_url`, `week_start_day`, `locale` |
| `habits` | Habit definitions | `id`, `user_id`, `name`, `description`, `category`, `frequency` (JSONB), `status`, `best_streak`, `paused_at` |
| `habit_logs` | Daily completion records | `id`, `habit_id`, `user_id`, `logged_date`, `completed` |
| `habit_milestones` | Streak milestone achievements | `id`, `habit_id`, `user_id`, `milestone`, `achieved_at` |
| `tasks` | One-off and recurring task instances | `id`, `user_id`, `title`, `description`, `intention`, `priority`, `category`, `due_date`, `due_time`, `is_completed`, `completion_difficulty`, `recurring_task_id`, `is_exception`, `original_date` |
| `recurring_tasks` | Recurring task templates | `id`, `user_id`, `title`, `recurrence_rule` (JSONB), `start_date`, `end_type`, `status`, `next_generate_date`, `instances_generated` |

All tables have RLS policies scoping data to `auth.uid()`.

### 6.2 Frequency JSONB Schema

```typescript
type HabitFrequency =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly' }
  | { type: 'times_per_week'; count: 2 | 3 }
  | { type: 'custom'; days: DayOfWeek[] };
```

### 6.3 Recurrence Rule JSONB Schema

```typescript
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  days_of_week?: number[];
  day_of_month?: number;
  week_position?: 'first' | 'second' | 'third' | 'fourth' | 'last';
  day_of_week_monthly?: number;
  month_of_year?: number;
}
```

---

## 7. API ROUTES

### 7.1 Habits

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/habits` | List habits (filter by status) |
| POST | `/api/habits` | Create habit (20 max limit) |
| GET | `/api/habits/[id]` | Get habit detail |
| PUT | `/api/habits/[id]` | Update habit |
| DELETE | `/api/habits/[id]` | Delete habit |
| POST | `/api/habits/[id]/toggle` | Toggle completion for a date |
| GET | `/api/habits/[id]/stats` | Streak, completion rates |
| GET | `/api/habits/[id]/logs` | Completion log history |

### 7.2 Tasks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tasks` | List tasks (filter/sort) |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/[id]` | Get task detail |
| PUT | `/api/tasks/[id]` | Update task (supports `?scope=` for recurring) |
| DELETE | `/api/tasks/[id]` | Delete task (supports `?scope=` for recurring) |
| POST | `/api/tasks/[id]/toggle` | Toggle completion |

### 7.3 Recurring Tasks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/recurring-tasks` | List templates |
| POST | `/api/recurring-tasks` | Create template + generate instances |
| GET | `/api/recurring-tasks/[id]` | Get template |
| PUT | `/api/recurring-tasks/[id]` | Update template (supports `?action=pause\|resume`) |
| DELETE | `/api/recurring-tasks/[id]` | Delete template + future instances |

### 7.4 Dashboard & Insights

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dashboard` | Full dashboard data (habits, tasks, absence, milestones) |
| GET | `/api/insights/weekly` | Weekly behavioral insights |
| GET | `/api/sidebar/counts` | Badge counts for nav |

### 7.5 Profile & Settings

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/PUT | `/api/profile` | User profile |
| GET/PUT | `/api/profile/preferences` | Theme, locale, week start day |
| GET | `/api/export` | Data export (ZIP) |

All endpoints require authentication. All data scoped via middleware + RLS.
All POST/PATCH routes validate with Zod `.safeParse()`.

---

## 8. FRONTEND ARCHITECTURE

### 8.1 Pages

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Server | Landing page (hero, features) |
| `/dashboard` | Server + Client | Daily dashboard (hero feature) |
| `/habits` | Client | Habit list with filters |
| `/habits/new` | Client | Create habit |
| `/habits/[id]` | Client | Habit detail (streaks, heatmap, milestones) |
| `/habits/[id]/edit` | Client | Edit habit |
| `/tasks` | Client | Task list with filters |
| `/tasks/new` | Client | Create task (with recurrence picker) |
| `/tasks/[id]` | Client | Task detail |
| `/tasks/[id]/edit` | Client | Edit task |
| `/dashboard/settings` | Client | User preferences |
| `/auth/*` | Client | Login, signup, password reset, etc. |

### 8.2 Key Components

**Dashboard:** `dashboard-content`, `daily-snapshot`, `habit-checklist`, `tasks-today`, `motivation-message`, `absence-card`, `weekly-insight-card`

**Habits:** `habit-form`, `frequency-selector`, `habit-list`, `habit-card`, `habit-row`, `habit-detail-content`, `heatmap`, `streak-counter`, `milestone-card`, `next-milestone`

**Tasks:** `task-form`, `recurrence-picker`, `task-list`, `task-card`, `task-detail-content`, `edit-scope-dialog`

**Layout:** `sidebar-shell`, `app-sidebar`, `sidebar-layout`, `sidebar-user-footer`, `page-header`, `page-breadcrumbs`

---

## 9. TESTING

- **Vitest:** 86 test files, 1084+ tests, 50% coverage threshold
- **Playwright:** 11 E2E spec files
- **Accessibility:** vitest-axe for component-level a11y testing
- **Known pre-existing:** 2 failures in `habit-logs.test.ts` (issue #98)

---

## 10. RETENTION MECHANICS (Shipped)

| Hook | Feature | Status |
|------|---------|--------|
| Daily Ritual | Time-based greeting, progress comparison | Shipped |
| Quick Wins | 1-click habit completion, instant visual feedback | Shipped |
| Streak Loss Aversion | Large streak counter, 30-day heatmap | Shipped |
| Milestone Celebrations | Celebration cards at 7/14/30/50/100/200/365 days | Shipped |
| Absence Recovery | 3-tier recovery cards (never miss twice) | Shipped |
| Completion Reflection | Post-task reflection for meaningful tasks | Shipped |
| Weekly Insights | Behavioral pattern recognition, one insight per week | Shipped |
| Task Horizon | Tomorrow preview, anxiety reduction | Shipped |
| Intention Setting | "Why This Matters" for tasks | Shipped |

---

## 11. MILESTONES SHIPPED

| Milestone | Date | Key Stats |
|-----------|------|-----------|
| v1.0 Codebase Hardening | 2026-02-16 | 5 phases, 11 plans, 116 files, +13K lines |
| v1.1 Dashboard Task Fixes | 2026-02-17 | 1 phase, timezone/duplication fixes |
| v2.0 UI Style Redesign | 2026-02-17 | 9 phases, sidebar nav, design tokens, card layouts |
| v2.1 UI Polish & Refinement | 2026-02-18 | 3 phases, 56 tokens, spacing standardization |
| Vertical Depth Features | 2026-02-18 | All 6 features (T1, T4, H1, H2, T3, H3) |
| Recurring Tasks | 2026-02-18 | Template + on-demand model, scope editing |

---

## 12. KEY DECISIONS

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lean V1, iterate fast | Retention > features. Ship and measure. | Good |
| Retention-first design | Competitors fail on feature count, not engagement | Good |
| Raw HSL for CSS tokens | Matches shadcn/ui pattern, enables opacity modifiers | Good |
| Flat sidebar nav | Cleaner UX with few items, Chameleon-matched | Good |
| Adaptive streak lookback | Short streaks need ~30 days, long streaks need more | Good |
| Hybrid recurring model | No cron, works with existing infra, individual editing | Good |
| Frequency-aware absence | Only count scheduled days as missed | Good |
| Selective reflection | Only P3 or intention tasks — avoid nag fatigue | Good |
| Client-sent dates | Server-local time wrong on Vercel (UTC != user TZ) | Good |
| 1-query absence calc | Bulk fetch + in-memory filter, no N+1 | Good |

---

## 13. EXPLICITLY OUT OF SCOPE

These are consciously excluded from the current product:

| Feature | Reason |
|---------|--------|
| Mobile app | Web-only, works on mobile browsers |
| Offline support | Requires significant client-side storage work |
| OAuth/social login | Email/password sufficient for now |
| Health data integrations | Requires mobile apps (Apple Health, Google Fit) |
| Leaderboards/comparison | Social comparison can be toxic; individual first |
| AI suggestions | Need more data before personalization is valuable |
| Native notifications | Not yet designed; revisit based on user feedback |
| Real-time chat | Not core to habit tracking |
| Video posts | Storage/bandwidth costs, not relevant |
| Habit-task linking | Deferred — complexity without clear V1 value |
| `describeRecurrence()` i18n | English-only acceptable for now; refactor deferred |

---

## 14. ACCESSIBILITY

**Target:** WCAG 2.1 Level AA

| Requirement | Status |
|-------------|--------|
| Keyboard navigation | All interactive elements focusable |
| Screen reader support | Semantic HTML, ARIA labels |
| Color contrast | 4.5:1 text, 3:1 UI components |
| Focus indicators | Visible focus rings |
| Motion preferences | Respects `prefers-reduced-motion` |
| Automated testing | vitest-axe in component tests |

---

## 15. ERROR HANDLING

- Consistent API error response format (`{ error: { code, message, details? } }`)
- Zod `.safeParse()` at all API boundaries
- Logger module (replaces `console.error/warn` in server code, Sentry-ready signature)
- Dashboard `_warnings` array for non-critical issues
- SWR error states propagated to UI
- Graceful degradation for recurring task generation failures

---

## 16. KNOWN ISSUES & TECH DEBT

| Issue | Impact | Priority |
|-------|--------|----------|
| Vitest picks up `.worktrees/` test files | Spurious failures in dev | Low |
| 2 pre-existing failures in `habit-logs.test.ts` | `times_per_week getDetailedHabitStats` | Low (issue #98) |
| `describeRecurrence()` English-only | Non-English users see English recurrence descriptions | Medium |
| `window.confirm()` used for destructive actions | Should use AlertDialog component | Low |
| Dark mode card-on-gray depth | Needs design decision on dark surface hierarchy | Low |

---

## 17. FUTURE ROADMAP

### V2.5 — Next Milestone Candidates

These features have the strongest case for building next:

**Mood Check-ins** *(Full spec in Section 18)*
- Quick emotional logging (<30 seconds)
- Stress level (1-5) + body sensation tags + optional notes
- Trends visualization, therapist PDF/CSV export
- Crisis resources when stress = 5
- No gamification (no streaks for mental health)

**Habit Templates Library**
- 50+ pre-built habits by category
- "Start tracking" one-click setup
- Community-submitted templates (V3+)

**Notifications / Reminders**
- In-app notification center
- Habit reminders (configurable per habit)
- Streak at-risk warnings
- Needs design work — no spec exists yet

**`describeRecurrence()` i18n**
- Refactor to accept translation function
- Support all 3 locales for recurrence descriptions

### V3.0+ — Long-term Vision

- Habit-Mood correlation ("On days you meditated, stress was 2.1 vs 3.8")
- AI-powered habit suggestions
- Habit-task linking
- Daily score / Consistency index
- Health data integrations (requires mobile)
- Journal/reflection entries
- Coaching integration

---

## 18. MOOD CHECK-INS (Future Feature Specification)

*(Carried forward from V1.2 Section 27 — full spec preserved below for when this feature is built.)*

### 18.1 Overview

**Purpose:** Quick capture of emotional states and physical sensations, creating a log that can be reviewed personally or shared with mental health professionals.

**Design Principles:**
- <30 second capture — stress level required, everything else optional
- Pre-built body tags — faster than typing, consistent for analysis
- No streaks — mental health should not be gamified
- Compassionate tone — "It's okay to not be okay"
- Private by default — data never leaves without explicit export

### 18.2 Database Schema

```sql
CREATE TABLE mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stress_level INTEGER NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  note TEXT,
  body_sensations TEXT[],
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE body_sensations (
  id TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  label_zh_tw TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER DEFAULT 0
);
```

### 18.3 API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/mood-checkins` | Create check-in |
| GET | `/api/mood-checkins` | List check-ins (date range, pagination) |
| GET | `/api/mood-checkins/[id]` | Single check-in |
| PATCH | `/api/mood-checkins/[id]` | Update check-in |
| DELETE | `/api/mood-checkins/[id]` | Delete check-in |
| GET | `/api/mood-checkins/stats` | Aggregate stats (stress distribution, patterns) |
| POST | `/api/mood-checkins/export` | PDF/CSV therapist export |

### 18.4 Frontend

**Pages:** `/check-in` (quick form), `/check-ins` (list), `/check-ins/insights` (trends)

**Components:** `MoodCheckinForm`, `StressLevelSelector`, `BodySensationTags`, `MoodCheckinCard`, `MoodCheckinList`, `MoodTrendsChart`, `TherapistExportDialog`

**Dashboard:** Optional "Quick Check-in" button (not prominently featured)

### 18.5 Safety

- Crisis resources displayed when stress = 5 (988 Suicide Prevention, Crisis Text Line)
- No gamification, no "you haven't checked in" prompts
- Clear disclaimer: "Not a substitute for professional care"
- Data encrypted at rest, strict RLS policies

### 18.6 Success Metrics

| Metric | Target |
|--------|--------|
| Check-ins per user per week | 2-5 |
| Export usage | 10% of check-in users |
| Feature retention after 2 weeks | 40% |

---

## 19. RELATED DOCUMENTS

| Document | Purpose |
|----------|---------|
| `BETTERR_ME_PRD_V1.md` | Original V1 PRD (historical) |
| `BETTERR_ME_PRD_V1.2.md` | V1 era master PRD with mood check-ins spec (historical) |
| `FEATURE_VERTICAL_DEPTH_STRATEGY.md` | Feature PRD: 6 vertical depth features (all shipped) |
| `FEATURE_RECURRING_TASKS.md` | Feature PRD: recurring tasks (shipped) |
| `ENGINEERING_PLAN_V1.md` | V1 engineering plan (historical) |
| `ENGINEERING_PLAN_V2.md` | UI design engineering plan (historical) |
| `ENGINEERING_PLAN_V3.md` | Vertical depth engineering plan |
| `UI_DESIGN_V1.md` | UI design spec V1 (historical) |
| `UI_DESIGN_V2.md` | UI design spec V2 (historical) |

---

**Document Version:** 2.0
**Last Updated:** February 18, 2026
**Status:** Living Document — updated as features ship
