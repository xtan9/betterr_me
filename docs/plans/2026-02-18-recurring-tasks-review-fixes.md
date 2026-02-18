# Recurring Tasks PR Review Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, high, and important issues identified in the 4-agent review of PR #268.

**Architecture:** Fixes span 3 layers: DB class error handling hardening, API route input validation, and frontend SWR error propagation. Also narrows types and adds Zod cross-field validation.

**Tech Stack:** TypeScript, Supabase, Zod, Next.js API routes, SWR, next-intl

---

## Batch 1: Critical Bug Fixes & Security (Tasks 1-4)

### Task 1: Fix null pointer crash in `deleteInstanceWithScope('following')`

**Files:**
- Modify: `lib/db/recurring-tasks.ts:256-279`

**Step 1: Add null guard for `original_date` before `.split()`**

In `lib/db/recurring-tasks.ts`, the `'following'` case of `deleteInstanceWithScope` calls `task.original_date.split('-')` on line 268 outside the `if (task.original_date)` guard. Move all the logic inside the guard and add an early throw if null.

Replace lines 256-279:
```typescript
      case 'following': {
        if (!task.original_date) {
          throw new Error('Cannot delete following instances: task has no original_date');
        }
        // Delete this and all future incomplete instances
        const { error: delErr } = await this.supabase
          .from('tasks')
          .delete()
          .eq('recurring_task_id', task.recurring_task_id)
          .eq('user_id', userId)
          .eq('is_completed', false)
          .gte('original_date', task.original_date);
        if (delErr) throw delErr;

        // Set template end_date to the day before this instance
        const [y, m, d] = task.original_date.split('-').map(Number);
        const prevDay = new Date(y, m - 1, d - 1);
        const endDate = [
          prevDay.getFullYear(),
          String(prevDay.getMonth() + 1).padStart(2, '0'),
          String(prevDay.getDate()).padStart(2, '0'),
        ].join('-');
        await this.updateRecurringTask(task.recurring_task_id, userId, {
          end_type: 'on_date',
          end_date: endDate,
        });
        break;
      }
```

**Step 2: Run tests**

Run: `pnpm test:run`
Expected: All 1128 tests pass

**Step 3: Commit**

```bash
git add lib/db/recurring-tasks.ts
git commit -m "fix: guard null original_date in deleteInstanceWithScope"
```

---

### Task 2: Validate request body for scope-based PATCH

**Files:**
- Modify: `app/api/tasks/[id]/route.ts:69-82`
- Modify: `lib/db/recurring-tasks.ts:149-153`

**Step 1: Add Zod validation before passing body to DB layer**

In `app/api/tasks/[id]/route.ts`, validate `body` with `taskUpdateSchema` when `scopeParam` is present. Change the PATCH scope block (lines 69-82):

```typescript
    // Handle recurring task scope-based updates
    if (scopeParam) {
      const scopeResult = editScopeSchema.safeParse(scopeParam);
      if (!scopeResult.success) {
        return NextResponse.json(
          { error: 'Invalid scope. Must be: this, following, or all' },
          { status: 400 }
        );
      }

      // Validate body with taskUpdateSchema (same as non-scope path)
      const validation = validateRequestBody(body, taskUpdateSchema);
      if (!validation.success) return validation.response;

      const recurringTasksDB = new RecurringTasksDB(supabase);
      await recurringTasksDB.updateInstanceWithScope(id, user.id, scopeResult.data, validation.data);
      return NextResponse.json({ success: true });
    }
```

**Step 2: Type the `updates` parameter properly**

In `lib/db/recurring-tasks.ts`, change `updateInstanceWithScope` signature from `Record<string, unknown>` to the proper type:

```typescript
  async updateInstanceWithScope(
    taskId: string,
    userId: string,
    scope: 'this' | 'following' | 'all',
    updates: Record<string, unknown>
  ): Promise<void> {
```

Change to:

```typescript
  async updateInstanceWithScope(
    taskId: string,
    userId: string,
    scope: 'this' | 'following' | 'all',
    updates: TaskUpdate
  ): Promise<void> {
```

Add the import at the top of the file:
```typescript
import type { RecurringTask, RecurringTaskInsert, RecurringTaskUpdate, TaskUpdate } from './types';
```

Then remove the `as` casts in the template update blocks (lines 179-184, 206-211) since the type is now known. Replace each block with:
```typescript
        const templateUpdates: RecurringTaskUpdate = {};
        if (updates.title !== undefined) templateUpdates.title = updates.title;
        if (updates.description !== undefined) templateUpdates.description = updates.description;
        if (updates.intention !== undefined) templateUpdates.intention = updates.intention;
        if (updates.priority !== undefined) templateUpdates.priority = updates.priority;
        if (updates.category !== undefined) templateUpdates.category = updates.category as RecurringTask['category'];
        if (updates.due_time !== undefined) templateUpdates.due_time = updates.due_time;
```

Note: keep the `as RecurringTask['category']` cast only for `category` since `TaskUpdate` uses `string | null` while `RecurringTask` uses the enum type.

**Step 3: Run tests and lint**

Run: `pnpm test:run && pnpm lint`
Expected: All tests pass, 0 lint errors

**Step 4: Commit**

```bash
git add app/api/tasks/[id]/route.ts lib/db/recurring-tasks.ts
git commit -m "fix: validate body with Zod for scope-based PATCH, type updates param"
```

---

### Task 3: Fix timezone violation in resume action

**Files:**
- Modify: `app/api/recurring-tasks/[id]/route.ts:72-77`

**Step 1: Accept client `date` query param for resume**

Replace lines 72-77:
```typescript
    if (action === 'resume') {
      const today = searchParams.get('date') || getLocalDateString();
      const [y, m, d] = today.split('-').map(Number);
      const throughDate = getLocalDateString(new Date(y, m - 1, d + 7));
      const template = await recurringTasksDB.resumeRecurringTask(id, user.id, today, throughDate);
      return NextResponse.json({ recurring_task: template });
    }
```

**Step 2: Also validate `action` param — reject unknown values**

After the resume block, add:
```typescript
    if (action) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause or resume' },
        { status: 400 }
      );
    }
```

**Step 3: Run tests**

Run: `pnpm test:run`
Expected: All pass

**Step 4: Commit**

```bash
git add app/api/recurring-tasks/[id]/route.ts
git commit -m "fix: accept client date param for resume, reject invalid actions"
```

---

### Task 4: Validate `status` query param in GET /api/recurring-tasks

**Files:**
- Modify: `app/api/recurring-tasks/route.ts:24-25`

**Step 1: Replace `as` cast with runtime validation**

Replace line 25:
```typescript
    const status = searchParams.get('status') as 'active' | 'paused' | 'archived' | null;
```

With:
```typescript
    const validStatuses = ['active', 'paused', 'archived'] as const;
    const statusParam = searchParams.get('status');
    const status = statusParam && (validStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as RecurringTask['status'])
      : null;
```

Add the import at top:
```typescript
import type { RecurringTask } from '@/lib/db/types';
```

**Step 2: Run tests and lint**

Run: `pnpm test:run && pnpm lint`
Expected: All pass

**Step 3: Commit**

```bash
git add app/api/recurring-tasks/route.ts
git commit -m "fix: validate status query param at runtime instead of using as cast"
```

---

## Batch 2: Error Handling Hardening (Tasks 5-8)

### Task 5: Check all Supabase mutation errors in `RecurringTasksDB`

**Files:**
- Modify: `lib/db/recurring-tasks.ts`

**Step 1: Add error checks to every unchecked Supabase mutation**

In `deleteRecurringTask` (line 97-102), capture error from child instance deletion:
```typescript
  async deleteRecurringTask(id: string, userId: string): Promise<void> {
    // Delete all future incomplete instances first
    const { error: instancesErr } = await this.supabase
      .from('tasks')
      .delete()
      .eq('recurring_task_id', id)
      .eq('user_id', userId)
      .eq('is_completed', false);

    if (instancesErr) throw instancesErr;

    // Delete the template
    const { error } = await this.supabase
      .from('recurring_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
```

In `updateInstanceWithScope`, add error checks to all 3 scope cases. For each `.update()` or `.delete()` call, capture `{ error }` and throw if non-null. The pattern for each is:
```typescript
        const { error: updateErr } = await this.supabase
          .from('tasks')
          .update({ ...updates, is_exception: true })
          .eq('id', taskId)
          .eq('user_id', userId);
        if (updateErr) throw updateErr;
```

Apply to:
- `case 'this'` — the `.update()` on line 169-173
- `case 'following'` — the `.update()` on line 192-199
- `case 'all'` — the `.update()` on line 218-224

In `deleteInstanceWithScope`, add error checks to:
- `case 'this'` — the `.delete()` on line 249-253
- `case 'following'` — already fixed in Task 1
- `case 'all'` — the `.delete()` on line 283-288

Also fix the fetch error in both `updateInstanceWithScope` (line 155) and `deleteInstanceWithScope` (line 235):
```typescript
    const { data: task, error: fetchErr } = await this.supabase
      .from('tasks')
      .select('*, recurring_tasks(*)')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    if (!task || !task.recurring_task_id) {
      throw new Error('Task not found or not part of a recurring series');
    }
```

**Step 2: Run tests**

Run: `pnpm test:run`
Expected: All pass

**Step 3: Commit**

```bash
git add lib/db/recurring-tasks.ts
git commit -m "fix: check all Supabase mutation errors in RecurringTasksDB"
```

---

### Task 6: Fix `ensureRecurringInstances` error handling

**Files:**
- Modify: `lib/recurring-tasks/instance-generator.ts:29-31`

**Step 1: Throw on template fetch failure**

Replace lines 29-32:
```typescript
  if (fetchErr) {
    throw new Error(`ensureRecurringInstances: failed to fetch templates: ${fetchErr.message}`);
  }
```

This way the caller decides how to handle it (the per-template loop still has its own try/catch for graceful degradation per template).

**Step 2: Add error check for existing instances query**

Replace lines 92-96:
```typescript
  const { data: existingInstances, error: existingErr } = await supabase
    .from('tasks')
    .select('original_date')
    .eq('recurring_task_id', template.id)
    .in('original_date', allowedOccurrences);

  if (existingErr) {
    throw new Error(`Failed to check existing instances: ${existingErr.message}`);
  }
```

**Step 3: Add error check for archive-on-limit**

Replace lines 80-86:
```typescript
    if (remaining <= 0) {
      const { error: archiveErr } = await supabase
        .from('recurring_tasks')
        .update({ status: 'archived' })
        .eq('id', template.id);
      if (archiveErr) {
        log.error('Failed to archive template at count limit', archiveErr, { templateId: template.id });
      }
      return;
    }
```

**Step 4: Run tests**

Run: `pnpm test:run`
Expected: All pass

**Step 5: Commit**

```bash
git add lib/recurring-tasks/instance-generator.ts
git commit -m "fix: throw on template fetch failure, check existing-instances query error"
```

---

### Task 7: Surface `ensureRecurringInstances` warnings to user

**Files:**
- Modify: `app/api/dashboard/route.ts:54-56`
- Modify: `app/api/tasks/route.ts:52-54`

**Step 1: Dashboard — add warning to existing `_warnings` array**

Replace lines 54-56 in `app/api/dashboard/route.ts`:
```typescript
    let recurringGenFailed = false;
    await ensureRecurringInstances(supabase, user.id, throughDate).catch((err) => {
      log.error('ensureRecurringInstances failed on dashboard', err, { userId: user.id });
      recurringGenFailed = true;
    });
```

Then add after line 111 (the `logsFetchFailed` warning):
```typescript
    if (recurringGenFailed) {
      warnings.push('Some recurring tasks may not appear — generation failed temporarily');
    }
```

**Step 2: Tasks route — add `_warnings` to response when generation fails**

Replace lines 49-55 in `app/api/tasks/route.ts`:
```typescript
    // Generate recurring instances when loading today/upcoming views
    let recurringGenFailed = false;
    if (view === 'today' || view === 'upcoming') {
      const [dy, dm, dd] = date.split('-').map(Number);
      const throughDate = getLocalDateString(new Date(dy, dm - 1, dd + 7));
      await ensureRecurringInstances(supabase, user.id, throughDate).catch((err) => {
        log.error('ensureRecurringInstances failed on tasks', err, { userId: user.id });
        recurringGenFailed = true;
      });
    }
```

Then modify the response for `view === 'today'` and `view === 'upcoming'` to include warnings:
```typescript
    if (view === 'today') {
      const tasks = await tasksDB.getTodayTasks(user.id, date);
      return NextResponse.json({
        tasks,
        ...(recurringGenFailed && { _warnings: ['Some recurring tasks may not appear'] }),
      });
    }

    if (view === 'upcoming') {
      const days = parseInt(searchParams.get('days') || '7');
      if (isNaN(days) || days < 1) {
        return NextResponse.json(
          { error: 'Days must be a positive number' },
          { status: 400 }
        );
      }
      const tasks = await tasksDB.getUpcomingTasks(user.id, date, days);
      return NextResponse.json({
        tasks,
        ...(recurringGenFailed && { _warnings: ['Some recurring tasks may not appear'] }),
      });
    }
```

**Step 3: Run tests**

Run: `pnpm test:run`
Expected: All pass

**Step 4: Commit**

```bash
git add app/api/dashboard/route.ts app/api/tasks/route.ts
git commit -m "fix: surface ensureRecurringInstances warnings instead of silent swallow"
```

---

### Task 8: Fix SWR fetcher error handling for recurring template

**Files:**
- Modify: `components/tasks/task-detail-content.tsx:123-128`

**Step 1: Throw on error instead of returning null**

Replace lines 123-128:
```typescript
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch recurring template: ${res.status}`);
      const data = await res.json();
      return data.recurring_task;
    }
```

**Step 2: Run tests and lint**

Run: `pnpm test:run && pnpm lint`
Expected: All pass

**Step 3: Commit**

```bash
git add components/tasks/task-detail-content.tsx
git commit -m "fix: SWR fetcher throws on error instead of returning null"
```

---

## Batch 3: Type & Validation Improvements (Tasks 9-11)

### Task 9: Add Zod cross-field refinements

**Files:**
- Modify: `lib/validations/recurring-task.ts`

**Step 1: Add `.superRefine()` to `recurrenceRuleSchema`**

Replace the schema:
```typescript
export const recurrenceRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
  days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  week_position: z.enum(['first', 'second', 'third', 'fourth', 'last']).optional(),
  day_of_week_monthly: z.number().int().min(0).max(6).optional(),
  month_of_year: z.number().int().min(1).max(12).optional(),
}).superRefine((data, ctx) => {
  // week_position and day_of_week_monthly must appear together
  if (data.week_position && data.day_of_week_monthly === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'day_of_week_monthly is required when week_position is set',
      path: ['day_of_week_monthly'],
    });
  }
  if (data.day_of_week_monthly !== undefined && !data.week_position) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'week_position is required when day_of_week_monthly is set',
      path: ['week_position'],
    });
  }
});
```

**Step 2: Add `.refine()` for `end_type`/`end_date`/`end_count` on the create schema**

Add after `.end_count` line in `recurringTaskCreateSchema`:
```typescript
}).refine((data) => {
  if (data.end_type === 'on_date' && !data.end_date) return false;
  if (data.end_type === 'after_count' && !data.end_count) return false;
  return true;
}, {
  message: 'end_date required for on_date, end_count required for after_count',
});
```

Note: since adding `.refine()` changes the output type to `ZodEffects`, we need to adjust the `recurringTaskUpdateSchema` which extends from it. Change it to:
```typescript
export const recurringTaskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  intention: z.string().max(200).optional().nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  category: z.enum(['work', 'personal', 'shopping', 'other']).nullable().optional(),
  due_time: z.string().nullable().optional(),
  recurrence_rule: recurrenceRuleSchema.optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  end_type: z.enum(['never', 'after_count', 'on_date']).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_count: z.number().int().min(1).nullable().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});
```

**Step 3: Run tests**

Run: `pnpm test:run`
Expected: May need to update some validation tests. Fix any failures.

**Step 4: Commit**

```bash
git add lib/validations/recurring-task.ts
git commit -m "fix: add Zod cross-field refinements for recurrence rule and end conditions"
```

---

### Task 10: Narrow `RecurringTaskUpdate` type

**Files:**
- Modify: `lib/db/types.ts:113`

**Step 1: Exclude bookkeeping fields from `RecurringTaskUpdate`**

Replace line 113:
```typescript
export type RecurringTaskUpdate = Partial<Omit<RecurringTask, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
```

With:
```typescript
export type RecurringTaskUpdate = Partial<Omit<RecurringTask, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'instances_generated' | 'next_generate_date'>>;
```

**Step 2: Check usages — internal code that sets these fields**

The `resumeRecurringTask` method sets `next_generate_date`. Since this is an internal operation, use `updateRecurringTaskInternal` or directly call supabase. The simplest fix: in `resumeRecurringTask` (line 134-137), call supabase directly instead of `updateRecurringTask`:

```typescript
    const { data: updated, error } = await this.supabase
      .from('recurring_tasks')
      .update({
        status: 'active',
        next_generate_date: nextOccurrence ?? todayDate,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
```

Also, `instance-generator.ts:updateTemplateAfterGeneration` already calls supabase directly, so that's fine.

**Step 3: Run build and tests**

Run: `pnpm build 2>&1 | tail -5 && pnpm test:run`
Expected: Build and all tests pass

**Step 4: Commit**

```bash
git add lib/db/types.ts lib/db/recurring-tasks.ts
git commit -m "fix: narrow RecurringTaskUpdate to exclude bookkeeping fields"
```

---

### Task 11: Run full verification

**Step 1: Run all tests**

Run: `pnpm test:run`
Expected: All 1128+ tests pass

**Step 2: Run lint**

Run: `pnpm lint`
Expected: 0 errors

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Commit any remaining fixes if needed**

---

## Summary of Issues Addressed

| Issue | Fix | Task |
|-------|-----|------|
| Null crash in `deleteInstanceWithScope('following')` | Null guard + early throw | 1 |
| Unvalidated body in scope PATCH | Zod validation + proper typing | 2 |
| Server timezone in resume action | Accept client `date` param | 3 |
| `status` query param `as` cast | Runtime validation | 4 |
| Unchecked Supabase mutations (8 locations) | Add `{ error }` checks + throw | 5 |
| Template fetch failure silently returns | Throw instead of return | 6 |
| `.catch()` swallows generation errors | Surface via `_warnings` | 7 |
| SWR fetcher returns null on error | Throw so SWR enters error state | 8 |
| No cross-field Zod refinements | `superRefine` + `refine` | 9 |
| `RecurringTaskUpdate` too permissive | Exclude bookkeeping fields | 10 |

### Issues intentionally deferred (lower priority, separate PR):
- `describeRecurrence()` hardcoded English — requires i18n refactor, not a bug
- `RecurrenceRule` discriminated union — large refactor, correctness is fine at runtime
- Test coverage gaps (DB class tests, API route tests, component tests) — separate testing PR
