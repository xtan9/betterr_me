# PRD V3: Recurring Tasks — Eliminate Daily Task Recreation

**Date:** February 18, 2026
**Status:** Implemented (PR #268)
**Version:** 3.0
**Prepared by:** Product + Engineering (Claude)

---

## 1. EXECUTIVE SUMMARY

Recurring tasks eliminates the #1 friction point in the BetterR.Me task system: manually recreating the same tasks every day or week. Users who have daily standups, weekly reports, or monthly reviews currently must create a new task each time. This feature brings the task system to parity with the habit system's scheduling capabilities while keeping the existing task infrastructure unchanged.

**Core Thesis:** If habits can repeat on a schedule, tasks should too. The difference: tasks are completable work items with deadlines and priorities; habits are ongoing behavioral patterns. Recurring tasks bridges this gap.

---

## 2. PROBLEM STATEMENT

### User Pain Points

| Pain Point | Evidence | Impact |
|-----------|----------|--------|
| Manual recreation of repetitive tasks | Users must create "Daily standup" every morning | High friction, reduces daily engagement |
| No scheduling for work-like repeating items | Habits lack priority, due time, categories | Users misuse habits for tasks or skip tracking |
| Task list cluttered with future copies | Workaround: create all copies upfront | Overwhelming, defeats "focus on today" design |

### User Stories

1. **As a professional**, I want to create a task that automatically appears every weekday at 9 AM so I don't have to manually add "Daily standup" each morning.
2. **As a student**, I want weekly recurring tasks for assignments due every Friday so I never miss a deadline.
3. **As anyone**, I want to edit just one instance of a recurring task (e.g., reschedule today's standup) without affecting the rest of the series.
4. **As anyone**, I want to pause or stop a recurring task when my schedule changes, without losing completed history.

---

## 3. SOLUTION: HYBRID TEMPLATE + INSTANCE MODEL

### Architecture Decision

**Chosen approach:** Hybrid model with a separate `recurring_tasks` template table and on-demand instance generation into the existing `tasks` table.

**Why this approach:**
- All existing task queries, dashboard, filters, and sorting work unchanged
- No cron jobs or background workers needed
- Instances are real task rows — completion, reflection, and all V2 features work out of the box
- Template stores the "recipe"; instances are the "servings"
- 7-day rolling window generation keeps the task list manageable

**Alternatives considered:**
| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Virtual instances (computed at read time) | No storage overhead | Every query must compute; can't individually edit instances | Rejected |
| Cron-based generation | Simple mental model | Requires infrastructure; missed crons = missed tasks | Rejected |
| **Hybrid template + on-demand** | Works with existing infra; individual instance editing; no cron | Slightly more complex schema | **Chosen** |

### Edit/Delete Scope (Google Calendar Style)

When a user edits or deletes a recurring task instance, they choose scope:

| Scope | Edit Behavior | Delete Behavior |
|-------|--------------|-----------------|
| **This instance only** | Updates this task, marks as exception | Deletes this task only |
| **This and following** | Updates template + all future incomplete instances from this date | Deletes future incomplete instances, sets template end_date |
| **All instances** | Updates template + all future incomplete non-exception instances | Deletes all incomplete instances, archives template |

---

## 4. RECURRENCE PATTERNS

### Supported Frequencies

| Pattern | Example | `recurrence_rule` JSONB |
|---------|---------|------------------------|
| Daily | Every day | `{ frequency: "daily", interval: 1 }` |
| Every N days | Every 3 days | `{ frequency: "daily", interval: 3 }` |
| Weekly on specific days | Mon, Wed, Fri | `{ frequency: "weekly", interval: 1, days_of_week: [1, 3, 5] }` |
| Biweekly | Every 2 weeks on Tuesday | `{ frequency: "weekly", interval: 2, days_of_week: [2] }` |
| Monthly by date | 1st of every month | `{ frequency: "monthly", interval: 1, day_of_month: 1 }` |
| Monthly by weekday | First Monday of every month | `{ frequency: "monthly", interval: 1, week_position: "first", day_of_week_monthly: 1 }` |
| Yearly | Every March 15 | `{ frequency: "yearly", interval: 1, month_of_year: 3, day_of_month: 15 }` |

### End Conditions

| End Type | Description | Fields |
|----------|-------------|--------|
| `never` | Runs indefinitely | (none) |
| `after_count` | Stops after N instances | `end_count: number` |
| `on_date` | Stops on a specific date | `end_date: YYYY-MM-DD` |

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Monthly on 31st (in Feb) | Skips months without that date |
| Leap year (Feb 29) | Generates only in leap years |
| Template paused | No new instances generated; existing instances remain |
| Template archived | No new instances; triggered when `after_count` limit reached |
| Instance individually completed | No effect on template or other instances |
| Instance marked as exception | Excluded from bulk "following"/"all" updates |

---

## 5. DATABASE SCHEMA

### New Table: `recurring_tasks`

```sql
CREATE TABLE recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  intention TEXT,
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 3),
  category TEXT CHECK (category IN ('work', 'personal', 'shopping', 'other')),
  due_time TIME,
  recurrence_rule JSONB NOT NULL,
  start_date DATE NOT NULL,
  end_type TEXT NOT NULL CHECK (end_type IN ('never', 'after_count', 'on_date')) DEFAULT 'never',
  end_date DATE,
  end_count INTEGER,
  instances_generated INTEGER DEFAULT 0,
  next_generate_date DATE,
  status TEXT CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_recurring_tasks_user` — user lookup
- `idx_recurring_tasks_user_status` — filtered user lookup
- `idx_recurring_tasks_next_gen` — partial index on active templates for generation queries

### Altered Table: `tasks`

```sql
ALTER TABLE tasks ADD COLUMN recurring_task_id UUID REFERENCES recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN is_exception BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN original_date DATE;
```

**Indexes:**
- `idx_tasks_recurring` — partial index for recurring task queries
- `idx_tasks_recurring_date` — unique index preventing duplicate instances per date

### RLS Policies

Same pattern as existing tables: SELECT/INSERT/UPDATE/DELETE policies using `user_id = auth.uid()`.

---

## 6. INSTANCE GENERATION ENGINE

### On-Demand Generation

Instances are generated lazily — not by cron, but when the user loads their dashboard or task list.

**Trigger points:**
1. `GET /api/dashboard` — generates through today + 7 days
2. `GET /api/tasks?view=today` — generates through today + 7 days
3. `GET /api/tasks?view=upcoming` — generates through today + 7 days
4. `POST /api/recurring-tasks` — generates initial instances on template creation

**Algorithm: `ensureRecurringInstances(supabase, userId, throughDate)`**

```
1. Query active templates where next_generate_date <= throughDate
2. For each template:
   a. Compute occurrence dates from next_generate_date through throughDate
   b. Apply end_date constraint (cap range)
   c. Apply end_count constraint (limit occurrences, archive if exhausted)
   d. Check for existing instances (dedup via recurring_task_id + original_date)
   e. Insert missing instances as real task rows
   f. Update template's next_generate_date and instances_generated
3. Per-template errors are caught and logged (graceful degradation)
4. Template fetch failure throws (caller decides handling)
```

### Instance Properties

Each generated instance copies from the template:
- `title`, `description`, `intention`, `priority`, `category`, `due_time`
- `due_date` = occurrence date
- `recurring_task_id` = template ID
- `original_date` = occurrence date (for scope operations)
- `is_exception` = false (until individually modified)
- `is_completed` = false

---

## 7. API DESIGN

### Recurring Task Template CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/recurring-tasks` | List templates (filter by `?status=`) |
| POST | `/api/recurring-tasks` | Create template + generate initial instances |
| GET | `/api/recurring-tasks/[id]` | Get single template |
| PATCH | `/api/recurring-tasks/[id]` | Update template fields |
| PATCH | `/api/recurring-tasks/[id]?action=pause` | Pause generation |
| PATCH | `/api/recurring-tasks/[id]?action=resume&date=YYYY-MM-DD` | Resume generation |
| DELETE | `/api/recurring-tasks/[id]` | Delete template + future incomplete instances |

### Task Instance Scope Operations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| PATCH | `/api/tasks/[id]?scope=this` | Edit this instance only (marks as exception) |
| PATCH | `/api/tasks/[id]?scope=following` | Edit template + future instances from this date |
| PATCH | `/api/tasks/[id]?scope=all` | Edit template + all future non-exception instances |
| DELETE | `/api/tasks/[id]?scope=this` | Delete this instance only |
| DELETE | `/api/tasks/[id]?scope=following` | Delete future instances + set template end_date |
| DELETE | `/api/tasks/[id]?scope=all` | Delete all incomplete + archive template |

### Validation

**Zod schemas enforce:**
- Recurrence rule cross-field constraints (`week_position` requires `day_of_week_monthly` and vice versa)
- End condition consistency (`on_date` requires `end_date`, `after_count` requires `end_count`)
- Runtime validation of query params (no `as` casts)
- Request body validation for all mutations

---

## 8. FRONTEND UX

### Task Form: Recurrence Picker

When `due_date` is set, a "Repeat" section appears:

```
Repeat: [Does not repeat ▾]

Options:
- Does not repeat
- Every day
- Every weekday (Mon-Fri)
- Every week
- Every 2 weeks
- Every month
- Every year
- Custom...
```

**Weekly day selector:** Toggle buttons for Mon-Sun (shown for weekly frequency).

**Custom picker:** Interval input + frequency dropdown + context-dependent sub-controls.

**Monthly sub-selector:** "On day [N]" vs "On the [first] [Monday]".

**End condition:** Radio group — "Never" / "After [N] times" / "On [date]".

### Dashboard Integration

- Recurring task instances appear as normal tasks (no changes to existing queries)
- Small `Repeat` icon (muted, from lucide-react) shown next to title for recurring instances
- Tooltip shows recurrence description

### Task Detail Page

- If `recurring_task_id` exists, shows recurrence info line:
  "Repeats every week on Mon, Wed, Fri"
- Edit/delete buttons trigger scope dialog for recurring instances

### Edit Scope Dialog

```
┌─────────────────────────────────────┐
│  Edit recurring task                │
│                                      │
│  ○ This task only                    │
│  ○ This and following tasks          │
│  ○ All tasks in this series          │
│                                      │
│  [Cancel]            [Continue]      │
└─────────────────────────────────────┘
```

### Recurring Tasks Management Page

`/tasks/recurring` — List of all templates with:
- Title, frequency description, status badge
- Next occurrence date
- Quick actions: Pause/Resume, Edit, Delete

---

## 9. i18n

All UI strings translated across 3 locales (en, zh, zh-TW):
- Recurrence picker labels and frequency options
- Day names for weekly selector
- End condition labels
- Recurrence descriptions ("Every day", "Every week on Mon, Wed, Fri", etc.)
- Edit/delete scope dialog text
- Management page text
- Dashboard repeat indicator tooltip

**Known limitation:** `describeRecurrence()` currently returns hardcoded English descriptions. i18n refactor deferred to a follow-up PR.

---

## 10. ERROR HANDLING

### Graceful Degradation

Instance generation errors are handled per-template — one failing template doesn't block others. If the entire generation call fails, the dashboard/tasks API:
- Catches the error and logs it
- Sets `recurringGenFailed = true`
- Includes `_warnings: ['Some recurring tasks may not appear']` in the response
- Still returns existing tasks (degraded but functional)

### Supabase Mutation Safety

Every Supabase mutation in `RecurringTasksDB` captures `{ error }` and throws on failure. No silent data loss.

### SWR Error Propagation

Frontend SWR fetchers throw on non-OK responses so SWR enters its error state properly, showing retry UI instead of silently showing stale data.

---

## 11. TYPESCRIPT TYPES

### Key Types

```typescript
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  days_of_week?: number[];       // 0-6 (Sun=0)
  day_of_month?: number;         // 1-31
  week_position?: 'first' | 'second' | 'third' | 'fourth' | 'last';
  day_of_week_monthly?: number;  // 0-6
  month_of_year?: number;        // 1-12
}

interface RecurringTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  intention: string | null;
  priority: 0 | 1 | 2 | 3;
  category: TaskCategory | null;
  due_time: string | null;
  recurrence_rule: RecurrenceRule;
  start_date: string;
  end_type: 'never' | 'after_count' | 'on_date';
  end_date: string | null;
  end_count: number | null;
  instances_generated: number;
  next_generate_date: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

// RecurringTaskUpdate excludes bookkeeping fields
type RecurringTaskUpdate = Partial<Omit<RecurringTask,
  'id' | 'user_id' | 'created_at' | 'updated_at' |
  'instances_generated' | 'next_generate_date'
>>;

// Task extended with recurring fields
interface Task {
  // ... existing fields ...
  recurring_task_id: string | null;
  is_exception: boolean;
  original_date: string | null;
}
```

---

## 12. TESTING

### Unit Tests
- `lib/recurring-tasks/recurrence.test.ts` — All recurrence patterns, month-end edge cases, leap years, intervals > 1
- `lib/recurring-tasks/instance-generator.test.ts` — Generation logic, deduplication, end conditions
- `lib/validations/recurring-task.test.ts` — Zod schema validation including cross-field refinements

### Component Tests
- `components/tasks/recurrence-picker.test.tsx` — Form interactions, output values
- `components/tasks/edit-scope-dialog.test.tsx` — Selection behavior

### E2E Tests (Playwright)
- Create daily recurring task, verify it appears on dashboard
- Complete today's instance, verify tomorrow's exists
- Edit "all instances", verify template and future instances updated
- Delete "this only", verify other instances unaffected
- Pause/resume recurrence

---

## 13. FILES INVENTORY

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/*_create_recurring_tasks.sql` | Template table |
| `supabase/migrations/*_add_recurring_fields_to_tasks.sql` | Task table alterations |
| `lib/recurring-tasks/recurrence.ts` | Recurrence computation engine |
| `lib/recurring-tasks/instance-generator.ts` | On-demand instance generation |
| `lib/db/recurring-tasks.ts` | RecurringTasksDB class |
| `lib/validations/recurring-task.ts` | Zod schemas |
| `app/api/recurring-tasks/route.ts` | List + Create API |
| `app/api/recurring-tasks/[id]/route.ts` | Get + Update + Delete API |
| `components/tasks/recurrence-picker.tsx` | Recurrence UI controls |
| `components/tasks/edit-scope-dialog.tsx` | Edit/delete scope dialog |
| `app/(protected)/tasks/recurring/page.tsx` | Management page |

### Modified Files
| File | Change |
|------|--------|
| `lib/db/types.ts` | Added RecurringTask types; extended Task with recurring fields |
| `app/api/dashboard/route.ts` | Calls `ensureRecurringInstances`; surfaces warnings |
| `app/api/tasks/route.ts` | Calls `ensureRecurringInstances`; surfaces warnings |
| `app/api/tasks/[id]/route.ts` | Scope param handling for PATCH/DELETE |
| `components/tasks/task-form.tsx` | Recurrence section; recurring task creation |
| `components/dashboard/tasks-today.tsx` | Repeat icon for recurring instances |
| `components/tasks/task-detail-content.tsx` | Recurrence info line |

---

## 14. SUCCESS METRICS

| Metric | Target | Measurement |
|--------|--------|-------------|
| Recurring task adoption | 30%+ of active users create at least 1 recurring task within 2 weeks | PostHog event tracking |
| Task creation friction reduction | 20% fewer manual task creations per user/day | Compare pre/post task creation rates |
| Daily engagement | Maintained or improved DAU | Dashboard load metrics |
| Completion rate on recurring instances | 70%+ (same as regular tasks) | Query completed vs total recurring instances |

---

## 15. FUTURE ENHANCEMENTS (Deferred)

| Enhancement | Rationale for Deferral |
|-------------|----------------------|
| `describeRecurrence()` i18n | Requires refactor to accept translation function; English-only is acceptable for launch |
| `RecurrenceRule` discriminated union | Large type refactor; runtime validation is correct, TypeScript narrowing is a DX improvement |
| Notification/reminder integration | Notifications not yet in the app (deferred from V1.5) |
| Recurring task templates library | "Create from template" shortcut for common patterns (daily standup, weekly review) |
| Habit-to-recurring-task conversion | Allow converting a habit to a recurring task or vice versa |

---

## 16. RELATIONSHIP TO EXISTING PRDs

| PRD | Relationship |
|-----|-------------|
| V1.0 (BETTERR_ME_PRD_V1) | Recurring tasks was listed as "deferred to V1.5" in section 4.2 |
| V1.2 (BETTERR_ME_PRD_V1.2) | Confirmed deferral in section 5 ("V1.0 Explicitly Out of Scope") |
| Vertical Depth (FEATURE_VERTICAL_DEPTH_STRATEGY) | Recurring tasks builds on Task Deep Features (intention, reflection, horizon) — all V2 features work on recurring instances automatically |

---

**Document Version:** 3.0
**Last Updated:** February 18, 2026
**Status:** Implemented
