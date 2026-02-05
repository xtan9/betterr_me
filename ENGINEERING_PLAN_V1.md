# BetterR.Me V1.0 - Engineering Implementation Plan

**Author:** Staff Engineer / Tech Lead
**Date:** February 3, 2026
**PRD Reference:** BETTERR_ME_PRD_V1.2.md
**Status:** Ready for Implementation

---

## 1. EXECUTIVE SUMMARY

### 1.1 Project Scope

Implement the V1.0 Habits feature on top of the existing BetterR.Me infrastructure, which already includes authentication, user profiles, task management, and internationalization.

### 1.2 What Already Exists (Leverage)

| Component | Status | Notes |
|-----------|--------|-------|
| Authentication | Complete | Supabase auth with email/OAuth |
| User Profiles | Complete | Preferences, timezone, theme |
| Task System | Complete | CRUD, filtering, toggle |
| UI Components | Complete | 46 shadcn/ui components |
| i18n | Complete | EN, ZH, ZH-TW |
| Testing | Complete | Vitest + RTL setup |
| Database Layer | Complete | Class-based pattern established |

### 1.3 What We're Building

| Feature | Priority | Complexity |
|---------|----------|------------|
| Habits CRUD | P0 | Medium |
| Habit Logging (toggle) | P0 | Medium |
| Streak Calculation | P0 | High |
| Daily Dashboard | P0 | Medium |
| 30-Day Heatmap | P1 | Medium |
| Habit Stats | P1 | Low |
| Settings Updates | P2 | Low |

### 1.4 Timeline Overview

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Database & Core APIs | 3 days | Backend ready |
| Phase 2: Frontend Components | 4 days | UI complete |
| Phase 3: Dashboard Integration | 2 days | Feature complete |
| Phase 4: Testing & Polish | 2 days | Production ready |
| **Total** | **~11 days** | **V1.0 Launch** |

### 1.5 Team Assumptions

- **Primary:** 1 full-stack engineer (can parallelize with 2)
- **Support:** Designer for visual polish (async)
- **Review:** Code review on all PRs

---

## 2. TECHNICAL ARCHITECTURE

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Dashboard   │  │ Habits Page │  │ Habit Detail Page       │  │
│  │ (RSC)       │  │ (Client)    │  │ (Client)                │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│                   ┌──────▼──────┐                                │
│                   │ React Query │  (Client-side caching)         │
│                   │ / SWR       │                                │
│                   └──────┬──────┘                                │
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────┼───────────────────────────────────────┐
│                    NEXT.JS SERVER                                 │
│  ┌───────────────────────▼───────────────────────────────────┐   │
│  │                    API Routes                              │   │
│  │  /api/habits/*  /api/habits/[id]/toggle  /api/dashboard   │   │
│  └───────────────────────┬───────────────────────────────────┘   │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐   │
│  │                  Database Layer                            │   │
│  │  HabitsDB  │  HabitLogsDB  │  DashboardDB                 │   │
│  └───────────────────────┬───────────────────────────────────┘   │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐   │
│  │                  Supabase Client (SSR)                     │   │
│  └───────────────────────┬───────────────────────────────────┘   │
└──────────────────────────┼───────────────────────────────────────┘
                           │ PostgreSQL Protocol
┌──────────────────────────┼───────────────────────────────────────┐
│                     SUPABASE                                      │
│  ┌───────────────────────▼───────────────────────────────────┐   │
│  │                    PostgreSQL                              │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌─────────┐  ┌──────────┐  │   │
│  │  │ habits  │  │ habit_logs  │  │profiles │  │  tasks   │  │   │
│  │  └─────────┘  └─────────────┘  └─────────┘  └──────────┘  │   │
│  │                                                            │   │
│  │  Row Level Security (RLS) - User data isolation           │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow: Toggle Habit

```
User clicks checkbox
        │
        ▼
┌─────────────────┐
│ Optimistic UI   │ ← Immediate feedback
│ Update          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ POST /api/      │────▶│ HabitLogsDB     │
│ habits/[id]/    │     │ .toggleLog()    │
│ toggle          │     └────────┬────────┘
└─────────────────┘              │
                                 ▼
                    ┌─────────────────────┐
                    │ Upsert habit_log    │
                    │ Calculate streak    │
                    │ Update best_streak  │
                    └────────┬────────────┘
                             │
                             ▼
                    ┌─────────────────────┐
                    │ Return: {           │
                    │   completed: true,  │
                    │   streak: 24,       │
                    │   best_streak: 45   │
                    │ }                   │
                    └─────────────────────┘
```

### 2.3 Tech Stack Additions

| Layer | Existing | Adding |
|-------|----------|--------|
| State Management | None (server components) | Consider SWR for client-side caching |
| Date Handling | Native | `date-fns` for timezone-aware calculations |
| Charts | None | `recharts` (already in shadcn/ui charts) |

---

## 3. TECHNICAL DECISIONS (ADRs)

### ADR-001: Streak Calculation Location

**Decision:** Calculate streaks on the server during toggle, not on read.

**Rationale:**
- Avoids expensive calculation on every dashboard load
- `current_streak` stored on habits table (denormalized)
- Recalculated only when logs change
- Trade-off: Slightly more complex toggle logic

**Implementation:**
```typescript
// On toggle, recalculate and update
const streak = await calculateStreak(habitId, userId);
await updateHabitStreak(habitId, streak);
```

### ADR-002: Habit Frequency Storage

**Decision:** Store frequency as JSONB with discriminated union types.

**Rationale:**
- Flexible for future frequency types
- Single column vs. complex relationship tables
- Zod validation ensures type safety

**Schema:**
```typescript
type Frequency =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly' }
  | { type: 'times_per_week', count: 2 | 3 }
  | { type: 'custom', days: number[] }
```

### ADR-003: Dashboard Data Fetching

**Decision:** Single aggregated endpoint `/api/dashboard/today` with server-side rendering.

**Rationale:**
- Reduces client round-trips (1 request vs. 4-5)
- Server can cache expensive calculations
- RSC renders with data, no loading states

**Trade-off:** Larger response payload, but simpler client code.

### ADR-004: Optimistic Updates for Toggle

**Decision:** Use optimistic UI updates with rollback on error.

**Rationale:**
- Instant feedback for habit completion (critical UX)
- Server confirms in background
- Revert with toast on failure

**Implementation:** SWR's `mutate` with `optimisticData` option.

### ADR-005: Past Log Editing Window

**Decision:** 7-day edit window enforced at API level, not database.

**Rationale:**
- Easier to adjust without migration
- API returns clear error message
- Database stays simple

**Implementation:**
```typescript
if (dayjs(logged_date).isBefore(dayjs().subtract(7, 'days'))) {
  return Response.json({ error: 'EDIT_WINDOW_EXCEEDED' }, { status: 403 });
}
```

### ADR-006: Client-Side Caching Strategy

**Decision:** Use SWR for habits list and dashboard data.

**Rationale:**
- Stale-while-revalidate pattern fits habit tracking
- Automatic revalidation on focus
- Built-in optimistic updates
- Lighter than React Query for our needs

---

## 4. IMPLEMENTATION PHASES

### Phase Overview

```
Phase 1 (Days 1-3)          Phase 2 (Days 4-7)          Phase 3 (Days 8-9)       Phase 4 (Days 10-11)
┌─────────────────┐         ┌─────────────────┐         ┌──────────────────┐     ┌──────────────────┐
│ Database        │         │ Frontend        │         │ Dashboard        │     │ Testing &        │
│ & Core APIs     │────────▶│ Components      │────────▶│ Integration      │────▶│ Polish           │
│                 │         │                 │         │                  │     │                  │
│ - Migrations    │         │ - HabitForm     │         │ - Real data      │     │ - E2E tests      │
│ - HabitsDB      │         │ - HabitCard     │         │ - Habit checklist│     │ - Bug fixes      │
│ - HabitLogsDB   │         │ - HabitList     │         │ - Task list      │     │ - Performance    │
│ - API routes    │         │ - Heatmap       │         │ - Motivation msg │     │ - Accessibility  │
│ - Streak calc   │         │ - StreakCounter │         │ - Stats          │     │ - i18n review    │
└─────────────────┘         └─────────────────┘         └──────────────────┘     └──────────────────┘
        │                           │                           │                        │
        ▼                           ▼                           ▼                        ▼
   Backend Ready              UI Complete               Feature Complete          Production Ready
```

### Critical Path

```
Migrations ──▶ HabitsDB ──▶ API Routes ──▶ HabitForm ──▶ Dashboard ──▶ Launch
    │              │            │              │             │
    │              │            │              │             └── Blocked by API
    │              │            │              └── Blocked by API
    │              │            └── Blocked by HabitsDB
    │              └── Blocked by Migrations
    └── START HERE (Day 1)
```

---

## 5. EPIC & TASK BREAKDOWN

### Epic 1: Database Foundation (Day 1)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| DB-001 | Create habits table migration | M | None | Table created with all columns, indexes, RLS |
| DB-002 | Create habit_logs table migration | M | DB-001 | Table created, unique constraint on (habit_id, logged_date) |
| DB-003 | Add updated_at triggers | S | DB-001, DB-002 | Triggers fire on UPDATE |
| DB-004 | Update tasks table (add category) | S | None | Category column added |
| DB-005 | Add TypeScript types for habits | S | DB-001, DB-002 | Types match schema exactly |
| DB-006 | Seed data for development | S | DB-001, DB-002 | 5 sample habits with logs |

**Estimated: 1 day**

### Epic 2: Database Layer (Day 2)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| DAL-001 | Implement HabitsDB class | M | DB-001 | CRUD operations, filtering |
| DAL-002 | Implement HabitLogsDB class | M | DB-002 | Create/update logs, get logs by date range |
| DAL-003 | Implement streak calculation | L | DAL-002 | Handles all frequency types, edge cases |
| DAL-004 | Unit tests for HabitsDB | M | DAL-001 | 80%+ coverage |
| DAL-005 | Unit tests for streak calculation | L | DAL-003 | All edge cases covered |
| DAL-006 | Implement DashboardDB class | M | DAL-001, DAL-002 | Aggregated dashboard data |

**Estimated: 1.5 days**

### Epic 3: API Routes (Days 2-3)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| API-001 | GET /api/habits | S | DAL-001 | Returns user's habits with filters |
| API-002 | POST /api/habits | S | DAL-001 | Creates habit, validates frequency |
| API-003 | GET /api/habits/[id] | S | DAL-001 | Returns single habit |
| API-004 | PATCH /api/habits/[id] | S | DAL-001 | Updates habit fields |
| API-005 | DELETE /api/habits/[id] | S | DAL-001 | Soft delete (archive) or hard delete |
| API-006 | POST /api/habits/[id]/toggle | M | DAL-002, DAL-003 | Toggles log, returns streak |
| API-007 | GET /api/habits/[id]/logs | S | DAL-002 | Returns logs for date range |
| API-008 | GET /api/habits/[id]/stats | M | DAL-001, DAL-002 | Returns completion stats |
| API-009 | GET /api/dashboard/today | M | DAL-006 | Aggregated dashboard data |
| API-010 | Integration tests for all routes | L | API-001 to API-009 | All routes tested |

**Estimated: 1.5 days**

### Epic 4: Core UI Components (Days 4-5)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| UI-001 | HabitForm component | M | API-002 | Create/edit habit form |
| UI-002 | FrequencySelector component | M | None | All frequency types selectable |
| UI-003 | HabitCard component | M | API-006 | Display habit with toggle |
| UI-004 | HabitList component | S | UI-003 | Filterable list of habits |
| UI-005 | StreakCounter component | S | None | Display current/best streak |
| UI-006 | Heatmap30Day component | L | API-007 | 30-day calendar visualization |
| UI-007 | HabitEmptyState component | S | None | Encouraging CTA |
| UI-008 | Component tests | M | UI-001 to UI-007 | All components tested |

**Estimated: 2 days**

### Epic 5: Pages (Days 5-6)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| PG-001 | /habits page | M | UI-004 | List all habits with filters |
| PG-002 | /habits/new page | S | UI-001 | Create new habit form |
| PG-003 | /habits/[id] page | M | UI-003, UI-005, UI-006 | Habit detail with stats |
| PG-004 | /habits/[id]/edit page | S | UI-001 | Edit existing habit |
| PG-005 | Add habits to navbar | S | None | Navigation link added |
| PG-006 | i18n for all habit strings | M | PG-001 to PG-004 | EN, ZH, ZH-TW translations |

**Estimated: 1.5 days**

### Epic 6: Dashboard Integration (Days 7-8)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| DASH-001 | DailySnapshot component | M | API-009 | Shows today's stats |
| DASH-002 | HabitChecklist component | M | UI-003, API-009 | All habits with toggle |
| DASH-003 | TasksToday component | M | Existing task API | Today's tasks |
| DASH-004 | MotivationMessage component | S | API-009 | Dynamic encouragement |
| DASH-005 | Refactor dashboard page | L | DASH-001 to DASH-004 | Real data, remove placeholders |
| DASH-006 | Empty states for dashboard | S | None | New user experience |
| DASH-007 | Dashboard loading states | S | DASH-005 | Skeleton loaders |

**Estimated: 2 days**

### Epic 7: Settings & Polish (Day 9)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| SET-001 | Add timezone to settings UI | S | Existing settings | Timezone selector works |
| SET-002 | Add week start day setting | S | Existing settings | Monday/Sunday toggle |
| SET-003 | Data export (CSV) | M | DAL-001, DAL-002 | Download habits + logs |
| SET-004 | Settings i18n updates | S | SET-001 to SET-003 | All new strings translated |

**Estimated: 0.5 days**

### Epic 8: Testing & Quality (Days 10-11)

| Task ID | Task | Size | Dependencies | Acceptance Criteria |
|---------|------|------|--------------|---------------------|
| QA-001 | E2E test: Create habit flow | M | All | Playwright test passing |
| QA-002 | E2E test: Complete habit flow | M | All | Playwright test passing |
| QA-003 | E2E test: Dashboard load | M | All | Playwright test passing |
| QA-004 | Accessibility audit | M | All | No critical issues |
| QA-005 | Performance audit | M | All | Lighthouse >90 |
| QA-006 | Cross-browser testing | M | All | Chrome, Firefox, Safari |
| QA-007 | Mobile responsive testing | M | All | Works on 375px+ |
| QA-008 | Bug fixes from testing | L | QA-001 to QA-007 | All P0 bugs fixed |

**Estimated: 2 days**

---

## 6. DATABASE MIGRATION PLAN

### 6.1 Migration Files

Create in order in `supabase/migrations/`:

```
20260203_001_create_habits_table.sql
20260203_002_create_habit_logs_table.sql
20260203_003_add_rls_policies.sql
20260203_004_add_triggers.sql
20260203_005_alter_tasks_add_category.sql
20260203_006_seed_development_data.sql (dev only)
```

### 6.2 Migration: Create Habits Table

```sql
-- 20260203_001_create_habits_table.sql

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('health', 'wellness', 'learning', 'productivity', 'other')),
  frequency JSONB NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_status ON habits(user_id, status);
CREATE INDEX idx_habits_user_active ON habits(user_id) WHERE status = 'active';

COMMENT ON TABLE habits IS 'User habits with frequency settings and streak tracking';
COMMENT ON COLUMN habits.frequency IS 'JSONB: {type: "daily"} | {type: "weekdays"} | {type: "custom", days: [1,3,5]}';
```

### 6.3 Migration: Create Habit Logs Table

```sql
-- 20260203_002_create_habit_logs_table.sql

CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one log per habit per day
  UNIQUE (habit_id, logged_date)
);

-- Indexes for common queries
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, logged_date DESC);
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, logged_date DESC);

COMMENT ON TABLE habit_logs IS 'Daily completion records for habits';
```

### 6.4 Migration: RLS Policies

```sql
-- 20260203_003_add_rls_policies.sql

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

### 6.5 Migration: Triggers

```sql
-- 20260203_004_add_triggers.sql

-- Reuse existing trigger function if it exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to habits
CREATE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to habit_logs
CREATE TRIGGER update_habit_logs_updated_at
  BEFORE UPDATE ON habit_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 6.6 Rollback Strategy

Each migration should have a corresponding down migration:

```sql
-- down/20260203_001_create_habits_table.sql
DROP TABLE IF EXISTS habits CASCADE;

-- down/20260203_002_create_habit_logs_table.sql
DROP TABLE IF EXISTS habit_logs CASCADE;
```

### 6.7 Running Migrations

```bash
# Local development
supabase db reset  # Resets and runs all migrations

# Production (via Supabase dashboard or CLI)
supabase db push
```

---

## 7. API IMPLEMENTATION PLAN

### 7.1 File Structure

```
app/api/
├── habits/
│   ├── route.ts              # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts          # GET, PATCH, DELETE
│       ├── toggle/
│       │   └── route.ts      # POST (toggle completion)
│       ├── logs/
│       │   └── route.ts      # GET (logs for heatmap)
│       └── stats/
│           └── route.ts      # GET (completion stats)
└── dashboard/
    └── today/
        └── route.ts          # GET (aggregated dashboard)
```

### 7.2 Shared Utilities First

Create before routes:

```typescript
// lib/db/habits.ts
export class HabitsDB {
  constructor(private supabase: SupabaseClient) {}

  async getAll(userId: string, filters?: HabitFilters) {}
  async getById(id: string, userId: string) {}
  async create(habit: CreateHabitInput) {}
  async update(id: string, userId: string, data: UpdateHabitInput) {}
  async delete(id: string, userId: string) {}
  async updateStreak(id: string, streak: number, bestStreak: number) {}
}

// lib/db/habit-logs.ts
export class HabitLogsDB {
  constructor(private supabase: SupabaseClient) {}

  async toggle(habitId: string, userId: string, date: string) {}
  async getByDateRange(habitId: string, startDate: string, endDate: string) {}
  async getByDate(userId: string, date: string) {}
}

// lib/habits/streak.ts
export function calculateStreak(
  logs: HabitLog[],
  frequency: HabitFrequency,
  createdAt: Date
): { current: number; best: number } {}
```

### 7.3 Route Implementation Order

1. **POST /api/habits** - Create (needed for testing other routes)
2. **GET /api/habits** - List (dashboard needs this)
3. **POST /api/habits/[id]/toggle** - Core interaction
4. **GET /api/habits/[id]/logs** - For heatmap
5. **GET /api/dashboard/today** - Dashboard aggregation
6. **GET /api/habits/[id]/stats** - Detail page stats
7. **PATCH /api/habits/[id]** - Edit
8. **DELETE /api/habits/[id]** - Delete

### 7.4 Example Route Implementation

```typescript
// app/api/habits/route.ts
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db/habits';
import { habitCreateSchema } from '@/lib/validations/habit';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active';

  const habitsDB = new HabitsDB(supabase);
  const habits = await habitsDB.getAll(user.id, { status });

  return Response.json(habits);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = habitCreateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({
      error: 'Validation failed',
      details: parsed.error.flatten()
    }, { status: 400 });
  }

  const habitsDB = new HabitsDB(supabase);
  const habit = await habitsDB.create({ ...parsed.data, user_id: user.id });

  return Response.json(habit, { status: 201 });
}
```

---

## 8. FRONTEND IMPLEMENTATION PLAN

### 8.1 Component Hierarchy

```
Dashboard Page (RSC)
├── WelcomeMessage
├── DailySnapshot
│   ├── StatCard (habits completed)
│   ├── StatCard (tasks completed)
│   └── StatCard (best streak)
├── HabitChecklist
│   ├── HabitCard (repeated)
│   │   ├── Checkbox
│   │   ├── HabitName
│   │   └── StreakBadge
│   └── HabitEmptyState (if no habits)
├── TasksToday
│   ├── TaskCard (repeated)
│   └── TaskEmptyState (if no tasks)
└── MotivationMessage

Habits Page (Client)
├── HabitListHeader
│   ├── Title
│   ├── FilterDropdown
│   └── CreateButton
├── HabitList
│   ├── HabitCard (repeated)
│   └── HabitEmptyState
└── CreateHabitDialog (modal)

Habit Detail Page (Client)
├── HabitHeader
│   ├── Name
│   ├── StatusBadge
│   └── EditButton
├── StreakCounter
│   ├── CurrentStreak
│   └── BestStreak
├── CompletionStats
│   ├── ThisWeek
│   ├── ThisMonth
│   └── AllTime
├── Heatmap30Day
│   └── DayCell (repeated)
└── HabitActions
    ├── PauseButton
    └── ArchiveButton
```

### 8.2 State Management

Using SWR for client-side data fetching:

```typescript
// hooks/use-habits.ts
import useSWR from 'swr';

export function useHabits(status = 'active') {
  return useSWR(`/api/habits?status=${status}`, fetcher);
}

export function useHabitToggle() {
  const { mutate } = useSWRConfig();

  return async (habitId: string, date: string) => {
    // Optimistic update
    mutate('/api/dashboard/today', optimisticData, false);

    // Actual request
    await fetch(`/api/habits/${habitId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ logged_date: date }),
    });

    // Revalidate
    mutate('/api/dashboard/today');
  };
}
```

### 8.3 Component Priority Order

1. **HabitCard** - Core component, used everywhere
2. **HabitForm** - Needed for create/edit flows
3. **HabitList** - Habits page main content
4. **StreakCounter** - Visual feedback
5. **Heatmap30Day** - Detail page visualization
6. **Dashboard components** - Final integration

---

## 9. TESTING STRATEGY

### 9.1 Test Coverage Targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| Streak Calculation | 100% | Business-critical logic |
| Database Layer | 80% | All CRUD operations |
| API Routes | 80% | All endpoints |
| UI Components | 70% | Key interactions |
| E2E | Critical paths | Happy paths |

### 9.2 Test Files Structure

```
tests/
├── lib/
│   └── db/
│       ├── habits.test.ts
│       ├── habit-logs.test.ts
│       └── streak.test.ts
├── app/
│   └── api/
│       ├── habits/
│       │   ├── route.test.ts
│       │   └── toggle.test.ts
│       └── dashboard/
│           └── today.test.ts
├── components/
│   ├── habit-card.test.tsx
│   ├── habit-form.test.tsx
│   └── heatmap.test.tsx
└── e2e/
    ├── create-habit.spec.ts
    ├── complete-habit.spec.ts
    └── dashboard.spec.ts
```

### 9.3 Streak Calculation Test Cases

```typescript
describe('calculateStreak', () => {
  describe('daily habits', () => {
    it('returns 0 for no logs', () => {});
    it('counts consecutive days from today', () => {});
    it('breaks on missed day', () => {});
    it('skips today if not completed', () => {});
  });

  describe('weekday habits', () => {
    it('ignores weekends', () => {});
    it('breaks on missed weekday', () => {});
  });

  describe('custom days habits', () => {
    it('only counts scheduled days', () => {});
    it('handles Mon/Wed/Fri pattern', () => {});
  });

  describe('edge cases', () => {
    it('handles habit created today', () => {});
    it('handles paused habit', () => {});
    it('handles timezone boundary', () => {});
    it('handles future date rejection', () => {});
  });
});
```

### 9.4 E2E Test: Create Habit Flow

```typescript
// e2e/create-habit.spec.ts
import { test, expect } from '@playwright/test';

test('user can create a new habit', async ({ page }) => {
  // Login
  await page.goto('/auth/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Navigate to habits
  await page.click('text=Habits');
  await expect(page).toHaveURL('/habits');

  // Create habit
  await page.click('text=New Habit');
  await page.fill('[name="name"]', 'Morning Meditation');
  await page.selectOption('[name="category"]', 'wellness');
  await page.click('[data-frequency="daily"]');
  await page.click('button[type="submit"]');

  // Verify created
  await expect(page.locator('text=Morning Meditation')).toBeVisible();
  await expect(page.locator('text=Streak: 0')).toBeVisible();
});
```

---

## 10. RISK ASSESSMENT

### 10.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Streak calculation bugs | High | Medium | 100% test coverage, edge case review |
| Timezone handling errors | High | Medium | Use date-fns-tz, test across timezones |
| N+1 queries on dashboard | Medium | High | Batch queries, add indexes |
| Optimistic update conflicts | Medium | Low | Revalidation after mutation |
| Migration rollback needed | High | Low | Test migrations in staging first |

### 10.2 Scope Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Feature creep (notifications) | Medium | Medium | Strict adherence to V1 scope |
| UI polish delays | Low | High | Ship functional first, polish later |
| i18n string coverage | Low | Medium | Add strings as components built |

### 10.3 Performance Concerns

| Concern | Threshold | Monitoring |
|---------|-----------|------------|
| Dashboard load time | <500ms | Measure Time to First Byte |
| Toggle response time | <200ms | Measure API latency |
| Heatmap render | <100ms | React DevTools profiler |
| Database query time | <50ms | Supabase query logs |

---

## 11. DEVOPS & DEPLOYMENT

### 11.1 Environment Setup

| Environment | Purpose | Database |
|-------------|---------|----------|
| Local | Development | Supabase local |
| Preview | PR previews | Supabase staging |
| Production | Live users | Supabase production |

### 11.2 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test:run
      - run: pnpm test:coverage

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4

      - run: pnpm install
      - run: pnpm build
```

### 11.3 Deployment Checklist

- [ ] All tests passing
- [ ] Migrations run successfully in staging
- [ ] Manual smoke test of critical flows
- [ ] Performance audit >90 Lighthouse
- [ ] Accessibility audit passing
- [ ] i18n strings complete
- [ ] Error tracking (Sentry) configured
- [ ] Analytics events firing

---

## 12. TIMELINE & MILESTONES

### 12.1 Daily Milestones

| Day | Milestone | Deliverable | Demo |
|-----|-----------|-------------|------|
| 1 | Database Ready | Migrations applied, types generated | Show schema in Supabase |
| 2 | Core APIs Done | Habits CRUD + toggle working | Postman/curl demo |
| 3 | Dashboard API | /api/dashboard/today returns data | JSON response |
| 4 | HabitCard Done | Component renders with toggle | Storybook/browser |
| 5 | Habits Page Done | CRUD flows working | Create a habit |
| 6 | Habit Detail Done | Stats + heatmap showing | View habit details |
| 7 | Dashboard Integrated | Real data on dashboard | Full dashboard |
| 8 | Polish Pass | Loading states, empty states | Edge cases |
| 9 | Settings Done | Timezone, export working | Export CSV |
| 10 | E2E Tests Pass | All critical paths | CI green |
| 11 | Launch Ready | All bugs fixed, deployed | Production URL |

### 12.2 Weekly Checkpoints

**End of Week 1 (Day 5):**
- Backend 100% complete
- Habits page functional
- Can create and toggle habits

**End of Week 2 (Day 10):**
- All features complete
- Dashboard integrated
- Tests passing
- Ready for launch

### 12.3 Buffer

2 days buffer built into 11-day estimate for:
- Unexpected bugs
- Design feedback iterations
- Performance optimization
- Additional testing

---

## 13. OPEN QUESTIONS

### 13.1 Needs Product Decision

| Question | Options | Recommendation | Decision |
|----------|---------|----------------|----------|
| Hard delete vs soft delete for habits? | Hard delete / Archive only | Archive only (user might regret) | TBD |
| Max habits per user? | Unlimited / 20 / 50 | 20 for V1 (performance) | TBD |
| Show "vs yesterday" on first day? | Hide / Show "First day!" | Hide and show encouragement | TBD |

### 13.2 Technical Debt & Future Improvements

The following improvements were identified during implementation and should be addressed in future iterations:

| Item | Priority | Description | Issue |
|------|----------|-------------|-------|
| Locale-aware week start | P2 | Week stats use Sunday as start (US convention). Add user preference for Monday start. | #95 |
| Stats API caching | P2 | Cache stats responses for 5 minutes to reduce database load. | #96 |
| Database optimization for stats | P3 | For habits with years of data, use SQL aggregation instead of fetching all logs. | #97 |
| "times_per_week" frequency | P2 | Currently treated as daily. Implement proper weekly goal evaluation. | #98 |

### 13.3 Technical Spikes Needed

| Spike | Time | Purpose |
|-------|------|---------|
| Timezone handling with date-fns | 2 hours | Verify streak calc across timezones |
| SWR optimistic updates | 1 hour | Confirm pattern for toggle |
| Supabase RLS testing | 1 hour | Verify policies work as expected |

### 13.4 Dependencies on External

| Dependency | Owner | Status |
|------------|-------|--------|
| Supabase project access | DevOps | Ready |
| Vercel deployment | DevOps | Ready |
| Design mockups (optional) | Designer | Not started |

---

## 14. APPENDIX

### A. Useful Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm test                   # Run tests in watch mode
pnpm test:coverage          # Coverage report

# Database
supabase start              # Start local Supabase
supabase db reset           # Reset and run migrations
supabase gen types typescript --local > lib/types/database.ts

# Deployment
pnpm build                  # Production build
pnpm lint                   # Lint check
```

### B. Key File Locations

```
# Database
supabase/migrations/        # SQL migrations
lib/db/                     # Database layer classes
lib/types/database.ts       # Generated types

# API
app/api/habits/             # Habit endpoints
app/api/dashboard/          # Dashboard endpoint

# Frontend
components/habits/          # Habit components
app/habits/                 # Habit pages
app/dashboard/              # Dashboard page

# Tests
tests/                      # All test files
```

### C. Definition of Done

A task is "done" when:
- [ ] Code complete and working
- [ ] Unit tests written and passing
- [ ] i18n strings added (if UI)
- [ ] Accessibility checked (if UI)
- [ ] Code reviewed
- [ ] Merged to main

---

**Document Version:** 1.1
**Last Updated:** February 5, 2026
**Next Review:** After Phase 1 completion

---

## 15. IMPLEMENTATION NOTES

### Stats API (API-008) - Implemented 2026-02-05

The `/api/habits/[id]/stats` endpoint was updated to return detailed stats:

```json
{
  "habitId": "...",
  "currentStreak": 5,
  "bestStreak": 12,
  "thisWeek": { "completed": 3, "total": 5, "percent": 60 },
  "thisMonth": { "completed": 10, "total": 15, "percent": 67 },
  "allTime": { "completed": 25, "total": 35, "percent": 71 }
}
```

**Key implementation details:**
- Uses `getDetailedHabitStats()` in `lib/db/habit-logs.ts`
- Frequency-aware: respects weekdays, custom days, etc.
- Respects habit creation date boundary
- Week starts on Sunday (US convention)

See PR #94 for implementation.
