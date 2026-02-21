# Phase 13: Data Foundation & Migration - Research

**Researched:** 2026-02-18
**Domain:** PostgreSQL schema migration, API-layer data sync, backward-compatible data model evolution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- is_completed=true -> status=done (locked by success criteria)
- is_completed=false -> Claude's discretion (backlog or todo -- pick most sensible default)
- New tasks default to status=todo
- Recurring task instances default to status=todo
- Reopened tasks (done -> incomplete) always reset to status=todo (no previous-status tracking)
- Status/section fields exist in DB but are NOT visible in any UI until Phase 14/15
- Existing "mark as complete" toggle continues working as-is; sync layer handles status=done behind the scenes
- API responses include new fields (status, section, sort_order) immediately -- frontend ignores them until Phase 14
- API accepts status in create/update requests for forward compatibility
- sort_order column added in Phase 13 (not deferred to Phase 15)
- Existing tasks seeded by creation date: oldest tasks get lowest sort_order (top of column)
- New tasks get sort_order that places them at the bottom of their column
- sort_order is scoped per-project (each project has independent ordering)
- Float-based values for single-row reorder updates
- Backup + forward-fix approach (no down-migration scripts)
- One-shot SQL migration: add columns, populate defaults, add constraints
- API-layer sync (not DB triggers) for is_completed/status bidirectionality

### Claude's Discretion
- Exact default status for is_completed=false migration (backlog vs todo -- pick based on UX analysis)
- Migration script structure and ordering
- Constraint and index design
- Error handling in sync layer
- Test strategy for backward compatibility verification

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | User's existing tasks receive `section=personal` and `status` derived from `is_completed` via migration | SQL migration pattern (Section: Migration SQL), default status recommendation (Section: Discretion Recommendations) |
| DATA-02 | Task `status` field supports backlog, todo, in_progress, and done values | CHECK constraint pattern (Section: Migration SQL), Zod enum validation (Section: Code Examples), TypeScript type additions (Section: Architecture Patterns) |
| DATA-03 | `is_completed` is derived from `status=done` -- setting status to done marks task complete (with `completed_at`), moving away from done clears completion | API-layer sync pattern (Section: Architecture Patterns - Sync Layer), affected code points inventory (Section: Codebase Inventory) |
| DATA-04 | Dashboard, recurring tasks, and all existing task features continue to work unchanged after migration | Backward compatibility analysis (Section: Common Pitfalls), test strategy (Section: Test Strategy) |
</phase_requirements>

## Summary

Phase 13 adds three new columns (`status`, `section`, `sort_order`) to the existing `tasks` table, migrates all existing data to the new model, and implements bidirectional sync between `is_completed` and `status` at the API layer. No new libraries are needed -- this phase uses only existing project dependencies (Supabase JS client, Zod, Vitest).

The core technical challenge is maintaining backward compatibility: the existing frontend reads `is_completed` everywhere and the toggle/PATCH endpoints manipulate it directly. The sync layer must intercept every code path that touches `is_completed` or `status` and keep both fields consistent, without changing any user-visible behavior.

Research reveals the codebase has exactly 7 code points that mutate task completion state (3 in API routes, 2 in the DB layer, 2 in the recurring-tasks instance generator). All 7 must be updated or wrapped by the sync layer. The migration SQL itself is straightforward -- a single ALTER TABLE with column additions, data population, and constraint/index creation.

**Primary recommendation:** Use `todo` (not `backlog`) as the default status for `is_completed=false` tasks. Implement sync as a thin utility function called in the existing API route handlers, not as middleware or a class wrapper. Float sort_order with initial spacing of 65536.0 for ample reorder headroom.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | Already installed | DB operations (insert/update/select) | Project's existing data layer |
| zod | Already installed | Validation schemas for new fields | Project's existing validation layer |
| vitest | Already installed | Unit + integration testing | Project's existing test framework |

### Supporting
No new libraries needed. Phase 13 is entirely about data model changes using existing tools.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| API-layer sync | DB triggers (PostgreSQL) | Triggers are harder to test, harder to debug, and invisible to the application layer. User locked API-layer sync. |
| Float sort_order | Integer sort_order | Integers require reindexing adjacent rows on reorder. Floats allow single-row updates. User locked float-based. |
| Forward-only migration | Up/down migrations | Down-migrations add complexity for a one-shot schema change. User locked forward-fix. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Codebase Inventory: Files That Must Change

Understanding the full surface area is critical for DATA-04 (backward compatibility).

#### Type Definitions
```
lib/db/types.ts
  - Task interface: add status, section, sort_order fields
  - TaskInsert type: add optional status, section, sort_order
  - TaskUpdate type: already Partial<...>, inherits new fields automatically
  - Add TaskStatus type alias: 'backlog' | 'todo' | 'in_progress' | 'done'
  - Add TaskSection type alias (initially just 'personal', extensible)
  - TaskFilters interface: optionally add status filter for forward compat
```

#### Validation Schemas
```
lib/validations/task.ts
  - taskFormSchema: add optional status field (z.enum)
  - taskUpdateSchema: add optional status field
  - New: taskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done'])
```

#### DB Layer
```
lib/db/tasks.ts
  - createTask(): sync layer sets default status/section/sort_order
  - updateTask(): sync layer handles status<->is_completed sync
  - toggleTaskCompletion(): sync layer sets status=done or status=todo
  - getUserTasks(): no change needed (select * includes new columns)
  - getTaskCount(): no change needed
  - getTodayTasks(): no change needed
  - getUpcomingTasks(): uses is_completed filter -- still works (sync keeps it consistent)
  - getOverdueTasks(): uses is_completed filter -- still works
```

#### Recurring Task Instance Generator
```
lib/recurring-tasks/instance-generator.ts
  - generateInstancesForTemplate(): TaskInsert objects must include status='todo', section='personal', sort_order
```

#### API Routes
```
app/api/tasks/route.ts
  - POST handler: pass status/section/sort_order to createTask
  - GET handler: no change needed (returns whatever DB returns)

app/api/tasks/[id]/route.ts
  - PATCH handler: sync layer intercepts is_completed and status updates
  - GET/DELETE: no change needed

app/api/tasks/[id]/toggle/route.ts
  - POST handler: toggleTaskCompletion already handled by DB layer sync
```

#### Dashboard
```
app/api/dashboard/route.ts
  - No change needed. Uses getTodayTasks, getTaskCount, getUserTasks -- all work unchanged.
  - Stats calculation uses todayTasks.filter(t => t.is_completed) -- still works because sync keeps is_completed accurate.
```

#### Frontend (NO changes in Phase 13)
```
components/tasks/task-list.tsx      -- reads is_completed, ignores new fields
components/tasks/task-card.tsx      -- reads is_completed, ignores new fields
components/tasks/task-detail-content.tsx -- reads is_completed
components/dashboard/tasks-today.tsx     -- reads is_completed
components/dashboard/dashboard-content.tsx -- reads is_completed, toggle calls API
```

### Pattern 1: Sync Utility Function

**What:** A pure function that takes incoming task mutations and returns the complete set of fields to write, ensuring is_completed and status are always consistent.

**When to use:** Every code path that creates or updates a task.

**Example:**
```typescript
// lib/tasks/sync.ts

import type { TaskUpdate, TaskInsert } from '@/lib/db/types';

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

/**
 * Synchronize status <-> is_completed for task creation.
 * Ensures both fields are consistent regardless of which was provided.
 */
export function syncTaskCreate(
  input: TaskInsert
): TaskInsert & { status: TaskStatus; section: string } {
  const status: TaskStatus = input.status ?? 'todo';
  const is_completed = status === 'done';
  const completed_at = is_completed ? new Date().toISOString() : null;

  return {
    ...input,
    status,
    section: input.section ?? 'personal',
    is_completed,
    completed_at,
  };
}

/**
 * Synchronize status <-> is_completed for task updates.
 * Handles three cases:
 * 1. Only status changed -> derive is_completed
 * 2. Only is_completed changed -> derive status
 * 3. Both changed -> status wins (explicit status is more specific)
 */
export function syncTaskUpdate(
  updates: TaskUpdate,
  currentStatus?: TaskStatus
): TaskUpdate {
  const result = { ...updates };

  if (result.status !== undefined && result.is_completed === undefined) {
    // Case 1: status changed, derive is_completed
    result.is_completed = result.status === 'done';
    result.completed_at = result.is_completed ? new Date().toISOString() : null;
  } else if (result.is_completed !== undefined && result.status === undefined) {
    // Case 2: is_completed changed, derive status
    if (result.is_completed) {
      result.status = 'done';
      result.completed_at = result.completed_at ?? new Date().toISOString();
    } else {
      // Reopened -> always todo (locked decision: no previous-status tracking)
      result.status = 'todo';
      result.completed_at = null;
    }
  } else if (result.status !== undefined && result.is_completed !== undefined) {
    // Case 3: both provided, status wins
    result.is_completed = result.status === 'done';
    result.completed_at = result.is_completed ? new Date().toISOString() : null;
  }

  return result;
}
```

### Pattern 2: Sort Order Assignment

**What:** Float-based sort_order with large initial spacing for headroom.

**When to use:** Creating new tasks, seeding existing tasks during migration.

**Example:**
```typescript
// lib/tasks/sort-order.ts

const SORT_ORDER_GAP = 65536.0; // 2^16, plenty of room for bisection

/**
 * Get the sort_order value for a new task at the bottom of its column.
 * Query: SELECT MAX(sort_order) FROM tasks WHERE user_id = ? AND section = ?
 */
export function getBottomSortOrder(currentMax: number | null): number {
  return (currentMax ?? 0) + SORT_ORDER_GAP;
}

/**
 * Get the sort_order value for inserting between two items.
 * Used for drag-and-drop reordering (Phase 15).
 */
export function getSortOrderBetween(above: number, below: number): number {
  return (above + below) / 2;
}
```

**Migration seeding SQL:**
```sql
-- Seed sort_order by creation date (oldest = lowest = top of column)
-- Uses ROW_NUMBER to assign sequential values with GAP spacing
UPDATE tasks SET sort_order = sub.new_order
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id ORDER BY created_at ASC
  ) * 65536.0 AS new_order
  FROM tasks
) sub
WHERE tasks.id = sub.id;
```

### Pattern 3: Forward-Compatible API Response

**What:** API responses include new fields immediately; frontend ignores them until Phase 14.

**Why safe:** Supabase `select('*')` already returns all columns. Adding columns to the DB automatically includes them in API responses. The frontend destructures only the fields it uses (`task.is_completed`, `task.title`, etc.) and silently ignores unknown fields.

**No code change needed for this pattern** -- it happens automatically via `select('*')`.

### Anti-Patterns to Avoid
- **DB triggers for sync:** Triggers are invisible to application code, impossible to unit test with mocked Supabase, and create hidden coupling between fields. Use explicit API-layer sync instead.
- **Removing is_completed prematurely:** The frontend depends on `is_completed` in 5 component files. It must remain the source of truth for the UI until Phase 14+ migrates components to use `status`.
- **Integer sort_order:** Would require updating N rows when inserting between two items. Float bisection updates exactly 1 row.
- **Separate sync middleware:** Adding Next.js middleware or a wrapper class introduces indirection. A simple utility function called at each mutation site is more explicit and testable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | Custom migration runner | Direct SQL via Supabase dashboard/CLI | Project already uses this pattern (15 existing migrations) |
| Enum validation | Manual string checks | `z.enum(['backlog','todo','in_progress','done'])` | Zod already used for all task validation |
| Sort order math | Complex rebalancing algorithms | Simple float midpoint (`(a + b) / 2`) | Float64 gives ~52 bisections before precision loss -- far more than needed |

**Key insight:** This phase adds no new dependencies. Every tool needed (Supabase SQL, Zod validation, TypeScript types) is already in the project. The complexity is in correctly identifying and updating all code paths, not in choosing tools.

## Common Pitfalls

### Pitfall 1: Incomplete Sync Coverage
**What goes wrong:** A code path updates `is_completed` without updating `status` (or vice versa), leaving the fields inconsistent.
**Why it happens:** There are 7 distinct code points that mutate task completion. Missing even one creates silent data inconsistency.
**How to avoid:** Exhaustive inventory of mutation points (documented above). The sync utility function must be called at every single one. Tests must verify both fields after every mutation.
**Warning signs:** Tasks where `is_completed=true` but `status != 'done'`, or `status='done'` but `is_completed=false`.

### Pitfall 2: Toggle Route Bypasses Sync
**What goes wrong:** `POST /api/tasks/[id]/toggle` calls `toggleTaskCompletion()` which directly sets `is_completed` without going through the sync layer.
**Why it happens:** `toggleTaskCompletion()` in `lib/db/tasks.ts` reads current state, flips `is_completed`, and writes back. It doesn't know about `status`.
**How to avoid:** Update `toggleTaskCompletion()` to call `syncTaskUpdate()` before passing updates to `updateTask()`. Or refactor toggle to go through the PATCH handler.
**Warning signs:** Toggling a task via the checkbox changes `is_completed` but `status` stays stale.

### Pitfall 3: Recurring Instance Creation Missing New Fields
**What goes wrong:** `instance-generator.ts` creates `TaskInsert` objects without `status`, `section`, or `sort_order`. If these columns have NOT NULL constraints, inserts fail. If they have defaults, the defaults may not match the desired behavior.
**Why it happens:** The instance generator was written before Phase 13 fields existed. It explicitly constructs `TaskInsert` objects with specific fields.
**How to avoid:** Update the `newInstances` map in `generateInstancesForTemplate()` to include `status: 'todo'`, `section: 'personal'`, and compute `sort_order`. Or rely on DB defaults AND verify those defaults match expectations.
**Warning signs:** Recurring task generation fails silently (existing error handling catches and logs).

### Pitfall 4: Migration Constraint Ordering
**What goes wrong:** Adding a NOT NULL constraint before populating data causes the ALTER TABLE to fail.
**Why it happens:** PostgreSQL enforces constraints immediately on ADD COLUMN ... NOT NULL unless a DEFAULT is provided.
**How to avoid:** Two-step approach: (1) ADD COLUMN with DEFAULT, (2) UPDATE existing rows, (3) add CHECK constraint. OR use ADD COLUMN ... DEFAULT 'value' NOT NULL which PostgreSQL handles in a single pass (sets default for existing rows automatically since PG 11).
**Warning signs:** Migration SQL errors about null constraint violations.

### Pitfall 5: Sort Order Not Scoped Per-Project
**What goes wrong:** sort_order collision across projects when Phase 14 introduces project assignment.
**Why it happens:** In Phase 13, all tasks belong to section='personal' (no projects yet). If sort_order is globally unique per user, it works. But Phase 14 will scope by project.
**How to avoid:** Design sort_order to be scoped per user+section from the start. The migration seeds all tasks (same section='personal') with sequential values per user. New task creation queries MAX(sort_order) filtered by user_id. Phase 14 will add project scoping.
**Warning signs:** None in Phase 13, but poor design shows up in Phase 14/15.

### Pitfall 6: TypeScript Type Mismatch After Migration
**What goes wrong:** Existing test mock objects lack the new fields (`status`, `section`, `sort_order`), causing type errors or test failures.
**Why it happens:** The `Task` interface gains new required fields, but mock task objects in tests were created with the old shape.
**How to avoid:** Update mock task objects in all test files. A helper factory function (e.g., `createMockTask()`) reduces duplication.
**Warning signs:** TypeScript compilation errors in test files after type changes.

## Discretion Recommendations

### Default Status for is_completed=false: Use `todo`

**Recommendation:** `todo` (not `backlog`)

**Rationale:**
1. **UX consistency:** In the current app, all incomplete tasks are visible and actionable. Users see them on their dashboard, in "today" view, and in the task list. This maps to `todo` (active, ready to work on), not `backlog` (parked, not yet committed to).
2. **Kanban convention:** In standard kanban boards (Trello, Linear, Jira), the default column for new items is "To Do" or equivalent. "Backlog" is an explicit deferral action.
3. **Least surprise:** After migration, if a user opens the future kanban view (Phase 15), they should see their existing tasks in "To Do", not hidden away in "Backlog". Putting everything in backlog would make the board look empty.
4. **New task default matches:** New tasks default to `todo` (locked decision). Migration should match this so old and new tasks start in the same state.

### Migration Script Structure

**Recommendation:** Single SQL file, ordered as:
1. Add columns with defaults (avoids NULL constraint issues)
2. Populate sort_order from creation date
3. Add indexes
4. Add comments

```sql
-- Phase 13: Data Foundation & Migration
-- Adds status, section, sort_order to tasks table

-- Step 1: Add columns with defaults (PG 11+ handles existing rows automatically)
ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'
  CHECK (status IN ('backlog', 'todo', 'in_progress', 'done'));
ALTER TABLE tasks ADD COLUMN section TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE tasks ADD COLUMN sort_order DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 2: Sync status from is_completed for existing completed tasks
UPDATE tasks SET status = 'done' WHERE is_completed = true;

-- Step 3: Seed sort_order by creation date (oldest = lowest = top)
UPDATE tasks SET sort_order = sub.new_order
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id ORDER BY created_at ASC
  ) * 65536.0 AS new_order
  FROM tasks
) sub
WHERE tasks.id = sub.id;

-- Step 4: Indexes for common queries
CREATE INDEX idx_tasks_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_section ON tasks(user_id, section);
CREATE INDEX idx_tasks_sort_order ON tasks(user_id, sort_order);

-- Step 5: Comments
COMMENT ON COLUMN tasks.status IS 'Task workflow status: backlog, todo, in_progress, done';
COMMENT ON COLUMN tasks.section IS 'Task section/project grouping (default: personal)';
COMMENT ON COLUMN tasks.sort_order IS 'Float-based ordering within section for drag-and-drop';
```

### Constraint and Index Design

**Recommendation:**
- `status`: CHECK constraint with enumerated values (not a foreign key to a lookup table). Simple, fast, matches existing pattern (see `category` column).
- `section`: TEXT NOT NULL DEFAULT 'personal'. No CHECK constraint yet -- Phase 14 will introduce project-based sections.
- `sort_order`: DOUBLE PRECISION NOT NULL DEFAULT 0. No uniqueness constraint (floats can collide after many bisections; application handles gracefully).
- Indexes: Composite indexes on `(user_id, status)`, `(user_id, section)`, `(user_id, sort_order)` for Phase 14/15 queries.

### Error Handling in Sync Layer

**Recommendation:** The sync functions are pure/deterministic -- they transform data, not call external services. Errors would only come from bugs (e.g., invalid status value). Handle via:
1. Zod validation at API boundary rejects invalid status values before sync runs
2. DB CHECK constraint is the final safety net
3. Sync functions themselves don't throw -- they return transformed objects
4. Log any unexpected state at the API route level (existing `log.error` pattern)

### Test Strategy for Backward Compatibility

**Recommendation:** Three-layer testing approach:

1. **Unit tests for sync functions** (`tests/lib/tasks/sync.test.ts`):
   - Every combination of status/is_completed input produces correct output
   - Toggle (complete -> incomplete, incomplete -> complete) produces correct sync
   - Edge cases: both fields provided, neither provided, null values

2. **DB layer tests** (`tests/lib/db/tasks.test.ts` -- extend existing):
   - createTask includes status/section/sort_order in insert
   - updateTask with is_completed=true produces status='done'
   - updateTask with status='done' produces is_completed=true
   - toggleTaskCompletion updates both fields
   - Existing tests still pass with updated mock task objects

3. **API route tests** (extend existing test files):
   - POST /api/tasks creates task with status='todo', section='personal'
   - PATCH /api/tasks/[id] with {is_completed: true} sets status='done'
   - PATCH /api/tasks/[id] with {status: 'done'} sets is_completed=true
   - POST /api/tasks/[id]/toggle updates both fields
   - GET /api/dashboard returns correct stats (unchanged behavior)
   - All existing tests pass without modification to assertions (only mock objects updated)

## Code Examples

### Example 1: Updated Task Type Definition
```typescript
// lib/db/types.ts additions
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TaskSection = string; // 'personal' for Phase 13, extensible in Phase 14

export interface Task {
  // ... existing fields ...
  status: TaskStatus;
  section: TaskSection;
  sort_order: number;
}
```

### Example 2: Updated Zod Validation Schema
```typescript
// lib/validations/task.ts additions
export const taskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done']);

export const taskFormSchema = z.object({
  // ... existing fields ...
  status: taskStatusSchema.optional(),  // Forward compat: accept but don't require
});

export const taskUpdateSchema = taskFormSchema
  .partial()
  .extend({
    is_completed: z.boolean().optional(),
    completed_at: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    section: z.string().optional(),
    sort_order: z.number().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

### Example 3: Updated Instance Generator
```typescript
// lib/recurring-tasks/instance-generator.ts -- updated newInstances map
const newInstances: TaskInsert[] = allowedOccurrences
  .filter(date => !existingDates.has(date))
  .map(date => ({
    user_id: userId,
    title: template.title,
    description: template.description,
    intention: template.intention,
    priority: template.priority,
    category: template.category,
    due_date: date,
    due_time: template.due_time,
    is_completed: false,
    status: 'todo' as const,       // NEW: recurring instances start as todo
    section: 'personal',            // NEW: default section
    // sort_order: computed or use DB default
    recurring_task_id: template.id,
    is_exception: false,
    original_date: date,
  }));
```

### Example 4: Updated PATCH Route with Sync
```typescript
// app/api/tasks/[id]/route.ts -- PATCH handler excerpt
import { syncTaskUpdate } from '@/lib/tasks/sync';

// After validation, before DB write:
if (validation.data.status !== undefined) {
  updates.status = validation.data.status;
}

// Apply sync to ensure consistency
const syncedUpdates = syncTaskUpdate(updates);
const task = await tasksDB.updateTask(id, user.id, syncedUpdates);
```

### Example 5: Updated toggleTaskCompletion
```typescript
// lib/db/tasks.ts -- updated toggle method
async toggleTaskCompletion(taskId: string, userId: string): Promise<Task> {
  const task = await this.getTask(taskId, userId);
  if (!task) throw new Error('Task not found');

  const updates: TaskUpdate = {
    is_completed: !task.is_completed,
    completed_at: !task.is_completed ? new Date().toISOString() : null,
    status: !task.is_completed ? 'done' : 'todo',  // NEW: sync status
  };

  return this.updateTask(taskId, userId, updates);
}
```

### Example 6: Sort Order for New Task Creation
```typescript
// In POST /api/tasks handler or in createTask DB method
// Query max sort_order for user, then add gap
const { data: maxRow } = await this.supabase
  .from('tasks')
  .select('sort_order')
  .eq('user_id', userId)
  .order('sort_order', { ascending: false })
  .limit(1)
  .single();

const sortOrder = (maxRow?.sort_order ?? 0) + 65536.0;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Boolean is_completed | Enum status + derived is_completed | Phase 13 (this migration) | Enables kanban workflow in Phase 15 |
| No ordering field | Float sort_order | Phase 13 (this migration) | Enables drag-and-drop in Phase 15 |
| ALTER TABLE + separate UPDATE | ADD COLUMN ... DEFAULT (PG 11+) | PostgreSQL 11 (2018) | Single-pass column addition, no table rewrite needed |

**Deprecated/outdated:**
- PostgreSQL < 11 required a table rewrite for ADD COLUMN ... DEFAULT NOT NULL. PostgreSQL 11+ handles this as a metadata-only operation (fast, no lock escalation).

## Open Questions

1. **Sort order for recurring task instances**
   - What we know: Each new recurring instance needs a sort_order. Instances are created in bulk by the instance generator.
   - What's unclear: Should they get sequential sort_orders based on their due_date? Or all get the same "bottom of list" value?
   - Recommendation: Assign sequential sort_orders based on due_date ordering within each batch. Use the same GAP spacing (65536.0) so they interleave cleanly with manually created tasks. Query current MAX before batch insert.

2. **Float precision exhaustion**
   - What we know: IEEE 754 double-precision floats have ~15-17 significant decimal digits. After ~52 bisections between two values, precision is exhausted.
   - What's unclear: Will real users hit this limit?
   - Recommendation: Extremely unlikely in practice (would require 52 consecutive insertions between the same two adjacent items without ever creating a new item). If it occurs, a rebalancing query (`UPDATE ... SET sort_order = ROW_NUMBER() * 65536.0`) fixes it. No need to build this into Phase 13 -- address reactively if ever needed.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct reading of all 15+ files in the task data flow (types, DB layer, API routes, validations, tests, migrations, instance generator, dashboard)
- **Context7: /supabase/supabase-js** - Verified insert/update/select API patterns
- **Context7: /colinhacks/zod** - Verified z.enum() for status validation
- **PostgreSQL 11 release notes** - ADD COLUMN ... DEFAULT NOT NULL is metadata-only (no table rewrite)

### Secondary (MEDIUM confidence)
- **Float-based sort ordering** - Well-documented pattern used by Figma, Linear, Notion. Bisection approach is standard for collaborative reordering.

### Tertiary (LOW confidence)
- None. All findings are verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all verified in existing codebase
- Architecture (sync layer): HIGH - All 7 mutation points identified via exhaustive codebase grep, pattern is straightforward pure function
- Architecture (migration SQL): HIGH - Follows existing 15-migration pattern, PostgreSQL 11+ behavior well-documented
- Pitfalls: HIGH - All identified from direct code analysis, not theoretical
- Sort order design: MEDIUM - Pattern is well-established but exact GAP value and scoping strategy need validation in Phase 14

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable -- no external dependency changes expected)
