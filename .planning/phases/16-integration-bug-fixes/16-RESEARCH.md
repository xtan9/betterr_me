# Phase 16: Integration Bug Fixes - Research

**Researched:** 2026-02-20
**Domain:** API route wiring, SWR cache consistency, TypeScript type safety, UI navigation
**Confidence:** HIGH

## Summary

Phase 16 is a gap-closure phase that addresses 4 distinct integration bugs discovered by the v3.0 milestone audit. All bugs are cross-phase wiring issues where features built in Phases 14-15 depend on API routes from Phase 13-14 that don't forward newly-added fields. The bugs are well-isolated, well-understood, and have clear surgical fixes. No new libraries or architectural changes are needed.

The 4 bugs are: (1) POST /api/tasks drops `section` and `project_id` fields, (2) PATCH /api/tasks/[id] drops `project_id` field, (3) SWR mutate in kanban drag-drop returns wrong data shape causing cache corruption, and (4) ProjectInsert type requires `status` but POST handler doesn't supply it, blocking `pnpm build`. A 5th item (archived projects navigation link) is a missing UI element, not a bug per se.

**Primary recommendation:** Fix all 4 API/cache bugs with precise line-level changes and add unit tests that verify the exact fields flow through to the DB layer. Fix the ProjectInsert type at the type level (make `status` optional with DB default) rather than at the handler level, to prevent the same issue in future callers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FORM-01 | User can select section (Work/Personal) when creating/editing task | Bug #1: POST /api/tasks drops `section` from taskData. Fix: add `section: validation.data.section` to taskData object (line 157-169 of route.ts). syncTaskCreate already defaults to 'personal' when undefined, so the fallback is safe. |
| FORM-02 | User can assign task to a project (dropdown filtered by section) | Bug #1 + #2: POST drops `project_id`, PATCH drops `project_id`. Fix POST: add `project_id: validation.data.project_id ?? null`. Fix PATCH: add `if (validation.data.project_id !== undefined) updates.project_id = validation.data.project_id;` after the sort_order block. |
| PROJ-01 | User can create project with name, section, and color | Bug #4: ProjectInsert type requires `status` field but POST handler doesn't provide it. Fix: make `status` optional in ProjectInsert type (add to Omit list + re-add as optional). The DB has a DEFAULT 'active' constraint. |
| PROJ-03 | User can archive a project (hidden by default, available via filter) | Archive API works. Navigation gap: no UI link to `/projects/archived`. Fix: add link in tasks page header area near "Create Project" button. Requires new i18n key `viewArchived` in all 3 locales. |
| PAGE-01 | Tasks page shows Work/Personal sections | Blocked by FORM-01 bug. Once section is forwarded in POST, new tasks will correctly appear in Work section when user selects it. No additional UI changes needed. |
| PAGE-02 | Each section displays project cards and standalone tasks area | Blocked by FORM-02 bug. Once project_id is forwarded in POST/PATCH, tasks will correctly appear under project cards. No additional UI changes needed. |
| KANB-02 | User can drag and drop tasks between columns to change status | Bug #3: SWR mutate async function returns `{task: Task}` (PATCH response shape) but cache expects `{tasks: Task[]}` (GET response shape). Fix: return the mapped task list from the mutate function instead of res.json(). |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Relevance to Phase |
|---------|---------|---------|-------------------|
| Next.js | 16 (App Router) | Framework | API route handlers being fixed |
| SWR | Latest | Client data fetching | Kanban cache bug fix |
| Zod | Latest | Validation | Schemas already include section/project_id |
| TypeScript | Strict mode | Type safety | ProjectInsert type fix |
| next-intl | Latest | i18n | New key for archived projects link |

### Supporting

No new libraries needed. All fixes use existing code patterns.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fix ProjectInsert type | Add `status: 'active' as const` in handler | Type fix is better: prevents same bug in future callers; handler fix is fragile |
| Return mapped list from mutate | Set `revalidate: true` | Mapped list is better: avoids extra network request; revalidate:true causes flash as optimistic UI reverts then re-renders |

**Installation:** No new packages needed.

## Architecture Patterns

### Pattern 1: API Route Field Forwarding

**What:** When a Zod schema validates a field, the API handler must explicitly map it into the DB insert/update object. Fields not listed in the taskData/updates object are silently dropped.

**When to use:** Every time a new field is added to a Zod schema.

**Current bug (POST /api/tasks):**
```typescript
// BEFORE (buggy): section and project_id validated but NOT forwarded
const taskData: TaskInsert = {
  user_id: user.id,
  title: validation.data.title.trim(),
  description: validation.data.description?.trim() || null,
  intention: validation.data.intention?.trim() || null,
  is_completed: false,
  priority: validation.data.priority ?? 0,
  category: validation.data.category || null,
  due_date: validation.data.due_date || null,
  due_time: validation.data.due_time || null,
  status: validation.data.status,
  sort_order: getBottomSortOrder(maxRow?.sort_order ?? null),
  // MISSING: section, project_id
};

// AFTER (fixed):
const taskData: TaskInsert = {
  user_id: user.id,
  title: validation.data.title.trim(),
  description: validation.data.description?.trim() || null,
  intention: validation.data.intention?.trim() || null,
  is_completed: false,
  priority: validation.data.priority ?? 0,
  category: validation.data.category || null,
  due_date: validation.data.due_date || null,
  due_time: validation.data.due_time || null,
  status: validation.data.status,
  section: validation.data.section,        // ADD
  project_id: validation.data.project_id ?? null, // ADD
  sort_order: getBottomSortOrder(maxRow?.sort_order ?? null),
};
```

**Current bug (PATCH /api/tasks/[id]):**
```typescript
// AFTER line 136 (sort_order block), ADD:
if (validation.data.project_id !== undefined) {
  updates.project_id = validation.data.project_id;
}
```

### Pattern 2: SWR Optimistic Mutation with Correct Return Shape

**What:** When using `mutate(asyncFn, { optimisticData, revalidate: false })`, the async function's return value replaces the SWR cache. It MUST match the GET response shape.

**When to use:** Any SWR optimistic mutation where revalidate is false.

**Current bug:**
```typescript
// BEFORE (buggy): returns PATCH response shape {task: Task}
mutate(
  async () => {
    const res = await fetch(`/api/tasks/${taskId}`, { ... });
    if (!res.ok) throw new Error("Failed to update task status");
    return res.json(); // {task: Task} -- WRONG SHAPE
  },
  { optimisticData: ..., revalidate: false }
);

// AFTER (fixed): returns the mapped list matching GET shape {tasks: Task[]}
mutate(
  async (current: { tasks: Task[] } | undefined) => {
    const res = await fetch(`/api/tasks/${taskId}`, { ... });
    if (!res.ok) throw new Error("Failed to update task status");
    const { task: updatedTask } = await res.json();
    return {
      tasks: (current?.tasks ?? []).map((t) =>
        t.id === taskId ? updatedTask : t
      ),
    };
  },
  { optimisticData: ..., revalidate: false }
);
```

**Note on SWR mutate signature:** The async function passed to `mutate()` receives the current cached data as its first argument when using SWR v2+. This lets us build the correct list shape without a separate state variable.

### Pattern 3: TypeScript Type Fix for Optional DB-Defaulted Fields

**What:** When a DB column has a DEFAULT constraint, the corresponding TypeScript insert type should make that field optional.

**Current bug:**
```typescript
// BEFORE (buggy): status and sort_order are required via Omit
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  sort_order?: number;  // This intersection doesn't make it truly optional
};

// AFTER (fixed): Omit status too, re-add as optional
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'status'> & {
  id?: string;
  status?: ProjectStatus;
  sort_order?: number;
};
```

**Important TypeScript note:** In an intersection type `{ x: number } & { x?: number }`, the result is `{ x: number }` (required wins). To make a field truly optional in an intersection, the required version must be removed first via `Omit`. The same applies to `sort_order` -- it's currently NOT truly optional despite the `& { sort_order?: number }`. However, the `sort_order` issue doesn't trigger a build error because the DB query auto-generates it. The `status` issue DOES trigger a build error because TypeScript sees it as missing.

### Anti-Patterns to Avoid

- **Spreading validation.data directly into taskData:** Don't do `{ ...validation.data, user_id }`. The TaskInsert type has different field names/shapes than the Zod schema output. Explicit field mapping prevents accidental field leaks.
- **Using revalidate:true as a fix for wrong cache shape:** This masks the bug with an extra network round-trip and causes UI flicker.
- **Adding `status: 'active'` in every handler:** Fix at the type level so all callers benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SWR cache shape | Custom cache management | SWR's built-in mutate with correct return value | SWR already handles cache correctly when given the right shape |
| Task field sync | Manual is_completed/status wiring | Existing `syncTaskCreate` / `syncTaskUpdate` | Already battle-tested with 1166 passing tests |

**Key insight:** All fixes in this phase are about correctly using existing infrastructure, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: TypeScript Intersection Types Don't Make Required Fields Optional

**What goes wrong:** Adding `& { field?: Type }` to a type that already has `field: Type` via `Omit` doesn't make the field optional. The required version wins in intersections.
**Why it happens:** TypeScript intersection semantics -- narrower type wins.
**How to avoid:** Always Omit the field first, then re-add as optional.
**Warning signs:** TypeScript error "is missing the following properties" on a field you thought was optional.

### Pitfall 2: SWR Mutate Return Value Replaces Cache

**What goes wrong:** When `revalidate: false`, the return value of the async function becomes the new cache value. Returning the wrong shape causes components to crash or render empty.
**Why it happens:** The PATCH endpoint returns `{task: Task}` but SWR cache shape is `{tasks: Task[]}`. Developers return `res.json()` assuming it's fine.
**How to avoid:** Always check that the mutate function's return value matches the SWR key's response shape.
**Warning signs:** Board works on first drag (optimistic data is correct) but empties ~100-500ms later (when async resolves with wrong shape).

### Pitfall 3: Validated Fields Silently Dropped in API Handlers

**What goes wrong:** Zod schema validates `section` and `project_id` successfully, but the API handler builds taskData without those fields. No TypeScript error because TaskInsert has them as optional.
**Why it happens:** Fields were added to the Zod schema in Phase 14, but the API handler in Phase 13 wasn't updated to forward them. Since TaskInsert marks these as optional, TypeScript doesn't complain.
**How to avoid:** When adding fields to a Zod schema, grep for ALL handlers that use that schema and update them.
**Warning signs:** Form shows correct UI, API validates successfully, but DB row has default/null values instead of user's selection.

### Pitfall 4: Intersection Type for sort_order

**What goes wrong:** The ProjectInsert type has `sort_order?: number` in the intersection, but `Omit<Project, ...>` includes `sort_order: number` (required). The intersection resolves to required.
**Why it happens:** Same TypeScript intersection semantics as Pitfall 1.
**How to avoid:** When fixing `status`, also fix `sort_order` -- move it to the Omit list and re-add as optional.
**Warning signs:** Currently not causing a build error because `sort_order` is auto-computed, but would break if a caller tried to omit it.

## Code Examples

### Fix 1: POST /api/tasks - Forward section and project_id

```typescript
// File: app/api/tasks/route.ts, lines 157-169
// Add after line 168 (sort_order):
const taskData: TaskInsert = {
  user_id: user.id,
  title: validation.data.title.trim(),
  description: validation.data.description?.trim() || null,
  intention: validation.data.intention?.trim() || null,
  is_completed: false,
  priority: validation.data.priority ?? 0,
  category: validation.data.category || null,
  due_date: validation.data.due_date || null,
  due_time: validation.data.due_time || null,
  status: validation.data.status,
  section: validation.data.section,
  project_id: validation.data.project_id ?? null,
  sort_order: getBottomSortOrder(maxRow?.sort_order ?? null),
};
```

### Fix 2: PATCH /api/tasks/[id] - Forward project_id

```typescript
// File: app/api/tasks/[id]/route.ts, after line 136 (sort_order block)
if (validation.data.project_id !== undefined) {
  updates.project_id = validation.data.project_id;
}
```

### Fix 3: Kanban SWR Cache - Return correct shape

```typescript
// File: components/kanban/kanban-board.tsx, lines 138-166
mutate(
  async (current: { tasks: Task[] } | undefined) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error("Failed to update task status");
    const { task: updatedTask } = await res.json();
    return {
      tasks: (current?.tasks ?? []).map((t) =>
        t.id === taskId ? updatedTask : t
      ),
    };
  },
  {
    optimisticData: (current: { tasks: Task[] } | undefined) => ({
      tasks: (current?.tasks ?? []).map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, is_completed: newStatus === "done" }
          : t
      ),
    }),
    rollbackOnError: true,
    revalidate: false,
  }
).catch(() => {
  toast.error(t("dragError"));
});
```

### Fix 4: ProjectInsert Type - Make status optional

```typescript
// File: lib/db/types.ts
// BEFORE:
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  sort_order?: number;
};

// AFTER:
export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'status' | 'sort_order'> & {
  id?: string;
  status?: ProjectStatus;
  sort_order?: number;
};
```

### Fix 5: Archived Projects Navigation Link

```typescript
// File: components/tasks/tasks-page-content.tsx, in PageHeader actions
// Add an "Archived" link button alongside "Create Project" and "Create Task"
<Button variant="ghost" size="sm" asChild>
  <Link href="/projects/archived">
    <Archive className="size-4 mr-2" />
    {t("page.viewArchived")}
  </Link>
</Button>
```

```json
// i18n key to add in all 3 locales under tasks.page:
// en: "viewArchived": "Archived"
// zh: "viewArchived": "已归档"
// zh-TW: "viewArchived": "已封存"
```

## Testing Strategy

### Unit Tests to Add

1. **POST /api/tasks with section=work** - verify createTask is called with `section: 'work'`
2. **POST /api/tasks with project_id** - verify createTask is called with `project_id: '<uuid>'`
3. **PATCH /api/tasks/[id] with project_id** - verify updateTask is called with `project_id: '<uuid>'`
4. **PATCH /api/tasks/[id] with project_id=null** - verify updateTask is called with `project_id: null` (unassign from project)
5. **POST /api/projects without status** - verify createProject is called without status (TypeScript compilation is the test)

### Existing Tests to Verify

The existing test `'should create task with status=todo, section=personal, and sort_order by default'` already passes because syncTaskCreate defaults section to 'personal'. After the fix, this test should still pass because validation.data.section will be undefined (not provided in request body), and syncTaskCreate will still default it.

### Build Verification

`pnpm build` must succeed with zero TypeScript errors in `app/api/projects/route.ts`. The accessibility test errors (`toHaveNoViolations`) are pre-existing and unrelated.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SWR v1 mutate(key, data, revalidate) | SWR v2 mutate(asyncFn, { optimisticData, revalidate }) | SWR v2 | Async function return value replaces cache when revalidate:false |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Sort_order intersection type**
   - What we know: `sort_order` has the same TypeScript intersection issue as `status` but doesn't currently cause a build error
   - What's unclear: Whether fixing it could cause any downstream test breakage
   - Recommendation: Fix it alongside `status` since they share the same pattern -- low risk, prevents future issues

2. **SWR mutate async function argument**
   - What we know: SWR v2 passes current data as argument to the mutate async function
   - What's unclear: Whether the project uses SWR v1 or v2 API
   - Recommendation: Check `package.json` for SWR version. If v1, use closure over current data instead. The existing `optimisticData` callback syntax suggests v2+.

## Sources

### Primary (HIGH confidence)
- **Codebase audit:** Direct reading of all 4 buggy files and their test files
- **v3.0 Milestone Audit:** `.planning/v3.0-MILESTONE-AUDIT.md` -- detailed root cause analysis for all gaps
- **TypeScript compiler output:** `npx tsc --noEmit` confirms the exact ProjectInsert error

### Secondary (MEDIUM confidence)
- **SWR mutate API:** Based on SWR v2 documentation patterns for optimistic mutations with `revalidate: false`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all fixes in existing code
- Architecture: HIGH - patterns are well-established in codebase, bugs are simple field-forwarding issues
- Pitfalls: HIGH - TypeScript intersection semantics and SWR cache shapes are well-documented

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable -- no external dependency changes)
