# Pitfalls Research

**Domain:** Adding project organization and kanban boards to an existing task management system (BetterR.Me)
**Researched:** 2026-02-18
**Confidence:** HIGH (verified against codebase + current library ecosystem)

## Critical Pitfalls

### Pitfall 1: DnD Library React 19 Incompatibility

**What goes wrong:**
Every major drag-and-drop library has some level of React 19 incompatibility. BetterR.Me uses React `^19.0.0` with Next.js 16. The landscape as of February 2026:

- `react-beautiful-dnd`: **Deprecated and archived** (April 2025). Peer dep requires React ^16/17/18. Does NOT work with React 19.
- `@hello-pangea/dnd` (community fork of rbd): Peer dep requires React ^18. Runtime may work but peer dep conflict exists. Latest version 18.0.1 published ~1 year ago.
- `@dnd-kit/core` (v6.3.1): Legacy package, no longer actively updated. React 19 not explicitly supported.
- `@dnd-kit/react` (v0.3.1): New rewrite, actively developed, but **still in pre-1.0**. Known issue with missing `"use client"` directive on `DragDropProvider` (GitHub #1654). SSR/RSC compatibility actively being patched.
- `@atlaskit/pragmatic-drag-and-drop`: Peer dep requires React ^16/17/18. **React 19 NOT officially supported** (GitHub #181). React-specific sub-packages (`react-drop-indicator`, `react-accessibility`, `flourish`) all have peer dep conflicts.

**Why it happens:**
Developers pick a DnD library based on popularity/familiarity without checking React 19 peer dependency compatibility. The ecosystem is in transition -- the old guard (`react-beautiful-dnd`, `react-dnd`) are deprecated/stale, and the new generation (`@dnd-kit/react`, pragmatic-drag-and-drop) have not fully caught up with React 19.

**How to avoid:**
Use `@dnd-kit/react` (the new package, NOT `@dnd-kit/core`). Despite being pre-1.0, it is the only actively-maintained option targeting React 19. Specific mitigations:
1. Pin to a specific version (e.g., `0.3.1`) rather than using `^` range -- pre-1.0 APIs can break between minor versions.
2. Wrap ALL DnD components in a single client component with `"use client"` directive.
3. Use `next/dynamic` with `{ ssr: false }` for the kanban board component to avoid hydration mismatches.
4. Do NOT use `@dnd-kit/core` or `@dnd-kit/sortable` (the old API). The new `@dnd-kit/react` has a completely different API surface.

If `@dnd-kit/react` proves too unstable, the fallback is `@hello-pangea/dnd` with `--legacy-peer-deps` (runtime works with React 19 per community testing, but peer dep declarations have not been updated).

**Warning signs:**
- `npm install` or `pnpm install` warnings about peer dependency conflicts
- Hydration mismatch errors in development console
- `DragDropProvider` not recognized as a client component
- Drop animations jumping/flickering instead of smooth transitions

**Phase to address:**
Phase 1 (Foundation) -- the DnD library choice must be validated with a proof-of-concept before building the full kanban board. Create a minimal kanban prototype with 2 columns and 3 cards to verify the library works in the existing stack.

---

### Pitfall 2: Hydration Mismatch with Server-Side Rendering

**What goes wrong:**
DnD components rely on browser APIs (pointer events, DOM measurements, `requestAnimationFrame`) that do not exist on the server. When Next.js App Router renders the page server-side, the DnD components produce different HTML than what the client expects, causing React hydration errors: "Hydration failed because the initial UI does not match what was rendered on the server."

Even marking a component with `"use client"` does NOT prevent it from rendering on the server -- it only means it will hydrate on the client. The server still attempts to render it.

**Why it happens:**
Developers assume `"use client"` means "client-only rendering." In Next.js App Router, `"use client"` means "this component and its children are part of the client bundle" but the server still pre-renders them.

**How to avoid:**
1. Wrap the entire kanban board component with `next/dynamic`:
```tsx
const KanbanBoard = dynamic(
  () => import("@/components/tasks/kanban-board"),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);
```
2. The task list view (non-kanban) should remain server-renderable. Only the kanban view needs SSR disabled.
3. Provide a proper loading skeleton so the page does not flash empty content during client-side hydration.
4. Test with `reactStrictMode: true` (the project default) -- Strict Mode double-renders in development and exposes DnD bugs that hide in production mode.

**Warning signs:**
- Console errors mentioning "hydration" in development
- Content flashing or disappearing on initial page load
- DnD working in dev but failing in production (or vice versa)

**Phase to address:**
Phase 2 (Kanban Board) -- must be architected from the start with SSR-disabled wrapper.

---

### Pitfall 3: Breaking the `is_completed` Boolean Contract

**What goes wrong:**
The current task system uses `is_completed: boolean` as the universal completion signal. Introducing a kanban `status` field (e.g., `'todo' | 'in_progress' | 'done'`) creates two sources of truth for task completion. The dashboard, sidebar counts, recurring task logic, and 94+ test assertions all rely on `is_completed`. If the new `status` field disagrees with `is_completed`, the system enters an inconsistent state.

Specific breakage points found in the codebase:
- `TasksDB.getTodayTasks()` -- no filter on `is_completed`, returns all tasks due today
- `TasksDB.getUpcomingTasks()` -- filters `is_completed = false`
- `TasksDB.getOverdueTasks()` -- filters `is_completed = false`
- `TasksDB.toggleTaskCompletion()` -- flips `is_completed` and sets `completed_at`
- `DashboardContent` optimistic updates -- mutates `is_completed` and `completed_at` directly
- `RecurringTasksDB.deleteRecurringTask()` -- deletes incomplete instances using `.eq('is_completed', false)`
- `RecurringTasksDB.updateInstanceWithScope()` -- filters with `.eq('is_completed', false)`
- Sidebar counts route -- counts tasks via `getTodayTasks()` which returns both completed/incomplete
- Dashboard `tasks_completed_today` stat -- counts `tasks_today.filter(t => t.is_completed)`
- Task list component -- filters `!t.is_completed` for pending tab, `t.is_completed` for completed tab

**Why it happens:**
The temptation is to add a `status` enum and start using it for the kanban board while leaving `is_completed` in place. Without a synchronization mechanism, developers update `status` to `'done'` but forget to also set `is_completed = true`, or vice versa. The two fields drift apart.

**How to avoid:**
Use the **Expand and Contract** pattern with a computed/derived approach:
1. **Phase 1 (Expand):** Add `status` column with default `NULL`. Add `project_id` column with default `NULL`. Do NOT change any existing queries.
2. **Phase 2 (Dual-write):** When `status` is set to `'done'`, also set `is_completed = true` and `completed_at`. When `is_completed` is toggled to `true`, also set `status = 'done'`. Use a database trigger OR application-level middleware for synchronization:
```sql
CREATE OR REPLACE FUNCTION sync_task_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND NOT NEW.is_completed THEN
    NEW.is_completed := true;
    NEW.completed_at := now();
  END IF;
  IF NEW.is_completed AND NEW.status IS NOT NULL AND NEW.status != 'done' THEN
    NEW.status := 'done';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
3. **Phase 3 (Contract):** Only after all consumers are migrated, consider removing `is_completed` (or keep it permanently as a denormalized field for query performance).

Critical: NEVER remove `is_completed` in the same phase as adding `status`. The 1084+ existing tests and all existing features depend on it.

**Warning signs:**
- Tasks appearing as "done" in kanban but "pending" in dashboard
- Task counts in sidebar not matching kanban board state
- Recurring task cleanup deleting tasks that were moved to "done" column in kanban but have `is_completed = false`
- Tests passing in isolation but failing in integration

**Phase to address:**
Phase 1 (Database Migration) -- the synchronization strategy must be designed before any status field is added. The DB trigger approach is safest because it catches ALL writes, not just application-level writes.

---

### Pitfall 4: SWR Cache Fragmentation After Adding Projects

**What goes wrong:**
The current SWR cache keys are simple: `/api/tasks`, `/api/tasks/${id}`, `/api/dashboard?date=${today}`, `/api/sidebar/counts?date=${today}`. When projects are added, new keys emerge: `/api/projects`, `/api/projects/${id}/tasks`, `/api/tasks?project_id=${id}`. A task status change via kanban drag must invalidate:
1. The kanban board's project-specific task list
2. The main `/api/tasks` list (tasks page)
3. The `/api/dashboard` data (tasks today section)
4. The `/api/sidebar/counts` data
5. The individual `/api/tasks/${id}` cache (if task detail was viewed)

Missing any of these causes stale data -- a task moved to "done" in kanban still showing as pending in the dashboard.

The existing codebase already demonstrates this pattern in `create-task-content.tsx`:
```ts
mutate("/api/dashboard");
mutate(
  (key: string) => typeof key === "string" && key.startsWith("/api/tasks"),
  undefined,
);
```
But this invalidation pattern becomes much more complex with projects. The filter-based `mutate` on `/api/tasks` prefix would work, but `/api/dashboard` and `/api/sidebar/counts` also need invalidation.

**Why it happens:**
SWR's cache is keyed by exact URL strings. When new endpoints are added, developers forget to update ALL the mutation/invalidation call sites. The problem compounds because there are multiple places that modify task state:
- Dashboard toggle (optimistic update in `dashboard-content.tsx`)
- Tasks page toggle (in `tasks-page-content.tsx`)
- Task detail page edits (in `edit-task-content.tsx`)
- Task creation (in `create-task-content.tsx`)
- Kanban drag-and-drop (NEW)
- Project-specific task operations (NEW)

**How to avoid:**
Create a centralized cache invalidation utility:
```ts
// lib/swr/invalidation.ts
import { mutate } from "swr";

export function invalidateTaskCaches() {
  // Invalidate all task-related caches with a single call
  mutate((key: string) =>
    typeof key === "string" && (
      key.startsWith("/api/tasks") ||
      key.startsWith("/api/projects") ||
      key.startsWith("/api/dashboard") ||
      key.startsWith("/api/sidebar/counts")
    ),
    undefined,
    { revalidate: true }
  );
}

export function invalidateProjectCaches(projectId?: string) {
  invalidateTaskCaches(); // Tasks and projects are coupled
}
```
All task mutation call sites should use this utility instead of manual `mutate()` calls.

**Warning signs:**
- Users seeing stale task counts in the sidebar after using kanban
- Dashboard showing different completion counts than the tasks page
- "Ghost tasks" appearing in one view but not another after drag-and-drop

**Phase to address:**
Phase 1 (Foundation) -- create the invalidation utility BEFORE building the kanban board. Retrofit existing mutation sites to use it.

---

### Pitfall 5: Optimistic Update Rollback Chaos in Kanban Drag-and-Drop

**What goes wrong:**
Kanban drag-and-drop requires optimistic updates -- the card must move instantly when dropped, before the server confirms. If the server rejects the update (e.g., validation error, network failure), the card must snap back to its original position. With SWR's `rollbackOnError: true`, this works for simple toggles. But kanban drags involve:
1. Moving a card from column A to column B (status change)
2. Potentially reordering cards within a column (position change)
3. Updating the task's `status` AND `is_completed` (if moved to "done")
4. Cross-invalidating multiple caches simultaneously

If the API call fails mid-flight, SWR rolls back the optimistic update, but the DnD library's internal state may have already committed the move. The DnD overlay animation and SWR state diverge, causing cards to appear in two places or disappear entirely.

Additionally, SWR's `revalidateOnFocus` (currently enabled in `tasks-page-content.tsx`) can trigger a revalidation DURING a drag operation, resetting the list and canceling the drag.

**Why it happens:**
DnD libraries manage their own internal state for drag positions and overlays. SWR manages its own cache state. When a rollback happens, these two state systems do not communicate, leading to visual artifacts.

**How to avoid:**
1. **Disable `revalidateOnFocus` and `refreshInterval`** on any SWR hook used by the kanban board during drag operations. Use a `isDragging` state variable:
```ts
const [isDragging, setIsDragging] = useState(false);
const { data, mutate } = useSWR(key, fetcher, {
  revalidateOnFocus: !isDragging,
  refreshInterval: isDragging ? 0 : 60000,
});
```
2. **Use local state as the source of truth during drag**, synced from SWR data via `useEffect`. On `onDragEnd`, update local state immediately, then fire the API call. On API success, let SWR revalidation sync. On API failure, reset local state from SWR cache:
```ts
const [columns, setColumns] = useState(serverData);
useEffect(() => {
  if (!isDragging && serverData) setColumns(serverData);
}, [serverData, isDragging]);
```
3. **Batch status updates** -- if a drag moves a card AND reorders, send a single API call, not two.
4. **Never call `mutate()` with `revalidate: true` during a drag sequence.**

**Warning signs:**
- Cards visually jumping back and then forward after a drop
- Cards appearing in two columns simultaneously for a brief moment
- Drag getting "stuck" or canceled when the window regains focus
- Console errors about state updates on unmounted components during drag

**Phase to address:**
Phase 2 (Kanban Board) -- the optimistic update strategy must be designed alongside the drag-and-drop implementation. Do not add optimistic updates as an afterthought.

---

### Pitfall 6: Breaking Recurring Task Instance Generation

**What goes wrong:**
Recurring task instances are generated as regular tasks with a `recurring_task_id` foreign key. The `RecurringTasksDB.deleteRecurringTask()` method deletes all incomplete instances using `.eq('is_completed', false)`. If a project/kanban system introduces an `in_progress` status that is NOT `is_completed = true`, these in-progress instances would be deleted when the recurring template is deleted, because they still have `is_completed = false`.

Similarly, `updateInstanceWithScope('following')` and `updateInstanceWithScope('all')` filter on `.eq('is_completed', false)` to find future instances. If the new status system decouples from `is_completed`, these scope operations break.

The recurring task resume flow in `resumeRecurringTask()` generates instances via `ensureRecurringInstances()`. If new tasks get a `project_id`, recurring instances should NOT inherit it (recurring tasks are template-based, not project-based), but a careless migration that adds a NOT NULL constraint to `project_id` would break instance generation.

**Why it happens:**
Recurring task logic is the most complex part of the existing task system. It touches both the `tasks` table (for instances) and `recurring_tasks` table (for templates). Developers adding project/kanban features focus on the tasks table and forget that recurring task logic makes assumptions about the task schema.

**How to avoid:**
1. `project_id` on tasks MUST be nullable (default NULL). Recurring task instances should be created with `project_id = NULL` unless explicitly assigned.
2. The `status` field MUST be kept in sync with `is_completed` via the DB trigger described in Pitfall 3. This ensures recurring task operations that filter on `is_completed = false` continue to work correctly.
3. Add a test specifically for: "recurring task instances created after project/status migration still work correctly with scope operations."
4. Do NOT add `status` or `project_id` to the `recurring_tasks` template table. Templates define WHAT recurs, not project assignment.

**Warning signs:**
- Recurring tasks stop generating after migration
- `ensureRecurringInstances` throws errors about NOT NULL constraint violations
- Deleting a recurring template orphans tasks that are "in progress" in the kanban
- Edit scope operations affecting fewer tasks than expected

**Phase to address:**
Phase 1 (Database Migration) -- migration SQL must be reviewed against all recurring task queries. Add integration tests for recurring task operations post-migration.

---

### Pitfall 7: Dashboard "Tasks Today" Widget Regression

**What goes wrong:**
The dashboard's `TasksToday` component receives `tasks_today` from the dashboard API. The dashboard API calls `tasksDB.getTodayTasks(userId, date)` which returns ALL tasks with `due_date <= today` (both completed and incomplete, no project filter). The `TasksToday` component then filters `!t.is_completed` for display and shows a completion counter.

If the kanban board allows changing task status to values other than completed/incomplete (e.g., "in_progress"), the dashboard widget has no concept of this. A task marked "in progress" in the kanban would still appear as an incomplete task in the dashboard -- which is arguably correct behavior, but needs explicit design decision.

More critically, if a task's `due_date` is removed when assigned to a kanban project (some project-based workflows ignore due dates), the task would disappear from the dashboard's "Tasks Today" entirely, even if it was previously tracked there.

**Why it happens:**
The dashboard `getTodayTasks()` query requires a non-null `due_date`. Tasks without due dates are invisible to the dashboard. If project-based workflows encourage optional due dates, tasks silently disappear from the dashboard.

**How to avoid:**
1. NEVER modify `due_date` behavior when assigning tasks to projects. Adding `project_id` should be purely additive.
2. Document the design decision: tasks assigned to projects STILL appear in "Tasks Today" if they have a due date.
3. The dashboard should remain completely unchanged in Phase 1. Do not add project awareness to the dashboard until a later phase.
4. Add a regression test: "tasks with project_id still appear in getTodayTasks".

**Warning signs:**
- Task counts dropping after assigning tasks to projects
- Users reporting "missing tasks" from their daily view
- Dashboard "all complete" message showing when kanban has active tasks

**Phase to address:**
Phase 1 (Database Migration) -- ensure migration is purely additive. Phase 3 or later for any dashboard project-awareness.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `is_completed` boolean forever alongside `status` enum | Zero risk to existing features, no migration needed | Two fields representing similar concepts, sync logic required | Always -- the sync overhead is minimal and the safety is worth it |
| Use `--legacy-peer-deps` for DnD library install | Bypass React 19 peer dep conflict | Masks real incompatibilities, may break on minor updates | Only as temporary measure during library evaluation; replace once library officially supports React 19 |
| Hardcode kanban column order (`todo`, `in_progress`, `done`) instead of making configurable | Ship kanban faster | Users cannot customize workflow columns | MVP only -- plan for configurability in a later phase |
| Store card position as array index rather than fractional ranking | Simpler implementation | Reordering requires updating ALL cards in a column | Acceptable for <100 tasks per column; add fractional ranking later if needed |
| Disable SSR entirely for tasks page instead of just kanban board | Simpler code | Slower initial page load, worse SEO (though SEO irrelevant for authenticated app) | Acceptable since tasks page is behind auth |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase RLS + new `projects` table | Forgetting to add RLS policies for the new table, leaving it world-readable | Add `CREATE POLICY` statements in the same migration that creates the table. Use the same pattern as existing tasks RLS: `auth.uid() = user_id` |
| SWR + kanban drag-and-drop | Using bound `mutate` from the kanban's SWR hook, which only invalidates that one cache key | Use global `mutate` from `useSWRConfig()` with a filter function to invalidate all related caches |
| `@dnd-kit/react` + Next.js App Router | Importing DnD components in a Server Component or forgetting `"use client"` | Ensure the kanban board AND its DnD wrapper are in a file marked `"use client"`, or use `next/dynamic` with `{ ssr: false }` |
| Zod validation + new fields | Adding `project_id` and `status` to the Task type but not updating `taskFormSchema` and `taskUpdateSchema` | Update ALL Zod schemas in `lib/validations/task.ts` when adding new task fields. Make new fields optional in schemas for backward compatibility |
| Supabase migration + existing data | Running `ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL` which fails because existing rows have no value | Always use `ADD COLUMN ... DEFAULT NULL` or `ADD COLUMN ... DEFAULT 'todo'`. Never use NOT NULL without a DEFAULT on a populated table |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering entire kanban board on every card drag | Visible lag during drag, janky animations, dropped frames | Memoize column components with `React.memo`. Use `useCallback` for drag handlers. DnD state should be isolated from card rendering. | >20 cards visible on screen |
| Fetching ALL tasks when kanban only needs project-specific ones | Slow kanban load time, unnecessary bandwidth | Add `project_id` filter to task queries: `/api/tasks?project_id=${id}`. Add database index on `(user_id, project_id)` | >100 total tasks |
| Updating sort order for ALL cards in a column on every reorder | Multiple API calls per drag, visible save lag | Use fractional indexing (e.g., moving between position 1.0 and 2.0 gets position 1.5) or batch update. Store position as `REAL` not `INTEGER` | >50 cards in one column |
| SWR polling with `refreshInterval` during kanban drag | Network requests during drag cause re-renders, animations break | Pause `refreshInterval` while `isDragging === true` | Any drag operation |
| Loading all project tasks for sidebar/counts | N+1 queries: one per project | Use a single aggregated query: `SELECT project_id, COUNT(*) FROM tasks WHERE user_id = ? GROUP BY project_id` | >10 projects |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Missing RLS policy on `projects` table | Any authenticated user can read/modify any user's projects | Add `USING (auth.uid() = user_id)` policy. Copy pattern from existing `tasks` table RLS |
| Not validating `project_id` ownership in API routes | User A could assign their task to User B's project by guessing the UUID | Before assigning `project_id`, verify the project belongs to the authenticated user: `SELECT id FROM projects WHERE id = $1 AND user_id = $2` |
| Accepting arbitrary `status` values from client | Injection of unexpected status values could break kanban rendering | Validate `status` with Zod enum: `z.enum(['todo', 'in_progress', 'done']).nullable()` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Drag-and-drop as the ONLY way to change task status | Mobile users cannot drag precisely; accessibility failure for keyboard/screen reader users | Provide a dropdown/menu on each card to change status. DnD is an enhancement, not the primary interaction |
| No visual feedback during drag on touch devices | Users do not know if they grabbed the card; touch-and-hold feels unresponsive | Add a grab handle icon, use a brief haptic/visual pulse on drag start, show a drag preview |
| Forcing all tasks into projects | Users with simple task lists are forced into unnecessary project structure | Keep "No Project" / "Inbox" as the default. Tasks without a project_id should display in a default "Inbox" section |
| Kanban columns not scrollable independently | With many cards, the entire page scrolls instead of individual columns | Each column must be a scrollable container with `overflow-y: auto` and a max height |
| Moving task to "done" column not triggering completion reflection | The existing dashboard has a reflection strip (difficulty rating) for high-priority completed tasks; kanban bypass skips this | When a kanban drag moves a task to "done", check if it qualifies for reflection and show the prompt inline in the kanban card |

## "Looks Done But Isn't" Checklist

- [ ] **Kanban drag-and-drop:** Often missing keyboard accessibility (arrow keys to move cards between columns) -- verify with keyboard-only navigation
- [ ] **Project CRUD:** Often missing the delete confirmation that handles orphan tasks -- verify what happens to tasks when a project is deleted
- [ ] **Status migration:** Often missing the database trigger to sync `is_completed` <-> `status` -- verify by toggling via the old API and checking kanban state
- [ ] **SWR cache invalidation:** Often missing sidebar counts invalidation after kanban operations -- verify sidebar counts update after dragging a card to "done"
- [ ] **Recurring tasks post-migration:** Often missing tests for recurring task scope operations after adding new columns -- verify "edit all future" still works
- [ ] **Mobile drag-and-drop:** Often missing touch event handling -- verify on actual mobile device, not just responsive browser
- [ ] **Empty project state:** Often missing what to show when a project has zero tasks -- verify the kanban board renders correctly with empty columns
- [ ] **i18n for new strings:** Project names, status labels, kanban UI strings need all three locales (en, zh, zh-TW) -- verify no missing translation keys
- [ ] **Optimistic rollback:** Often missing error recovery UX -- verify that a failed drag shows a toast and the card returns to original position

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `is_completed` / `status` desync | MEDIUM | Write a one-time migration script to reconcile: `UPDATE tasks SET is_completed = true WHERE status = 'done' AND NOT is_completed`. Add the DB trigger retroactively. |
| DnD library incompatibility discovered late | HIGH | If `@dnd-kit/react` fails, switching to `@hello-pangea/dnd` with `--legacy-peer-deps` requires rewriting all DnD code. Mitigate by abstracting DnD behind an adapter layer. |
| SWR cache stale data in production | LOW | Call `mutate(() => true)` to clear all caches (nuclear option). Then fix the specific invalidation patterns. |
| Recurring task instances broken by migration | HIGH | Requires manual data repair: identify orphaned instances, re-link to templates, regenerate missing instances. Prevention is far cheaper than cure. |
| Dashboard regression (missing tasks) | LOW | Revert the dashboard API to its pre-migration behavior. Dashboard should not change in the first phase anyway. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| DnD Library React 19 Incompatibility | Phase 1 (Foundation) | Build a 2-column, 3-card kanban prototype. Verify drag works with React Strict Mode, SSR, and production build. |
| Hydration Mismatch with SSR | Phase 2 (Kanban Board) | Run `pnpm build && pnpm start` and verify kanban loads without hydration errors in browser console. |
| Breaking `is_completed` Boolean Contract | Phase 1 (Database Migration) | Run ALL existing 1084+ tests after migration. Specifically run `pnpm test:run -- tests/lib/db/tasks.test.ts` and verify all 21 `is_completed` assertions pass. |
| SWR Cache Fragmentation | Phase 1 (Foundation) | Create centralized invalidation utility. Retrofit existing `create-task-content.tsx` and `dashboard-content.tsx` to use it. Run existing tests. |
| Optimistic Update Rollback in Kanban | Phase 2 (Kanban Board) | Simulate network failure during drag (e.g., disconnect network in DevTools). Verify card returns to original position with error toast. |
| Breaking Recurring Task Instance Generation | Phase 1 (Database Migration) | Create new recurring task after migration. Verify instances generate correctly. Test all scope operations (this/following/all). |
| Dashboard "Tasks Today" Widget Regression | Phase 1 (Database Migration) | Assign a task with due_date to a project. Verify it still appears in dashboard "Tasks Today". Run `tests/app/api/dashboard/route.test.ts`. |

## Sources

- [dnd-kit future/maintenance discussion (GitHub #1194)](https://github.com/clauderic/dnd-kit/issues/1194)
- [@dnd-kit/react "use client" issue (GitHub #1654)](https://github.com/clauderic/dnd-kit/issues/1654)
- [react-beautiful-dnd deprecated (GitHub #2672)](https://github.com/atlassian/react-beautiful-dnd/issues/2672)
- [react-beautiful-dnd React 19 incompatibility (GitHub #2653)](https://github.com/atlassian/react-beautiful-dnd/issues/2653)
- [pragmatic-drag-and-drop React 19 support (GitHub #181)](https://github.com/atlassian/pragmatic-drag-and-drop/issues/181)
- [@hello-pangea/dnd React 19 support (GitHub #864)](https://github.com/hello-pangea/dnd/issues/864)
- [SWR Mutation & Revalidation docs](https://swr.vercel.app/docs/mutation)
- [Prisma expand/contract migration pattern](https://www.prisma.io/docs/guides/data-migration)
- [Supabase database migrations docs](https://supabase.com/docs/guides/deployment/database-migrations)
- [Next.js hydration error docs](https://nextjs.org/docs/messages/react-hydration-error)
- [dnd-kit Sortable docs](https://docs.dndkit.com/presets/sortable)
- [Top 5 DnD Libraries for React 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)
- [dnd-kit async reorder issue (GitHub #833)](https://github.com/clauderic/dnd-kit/issues/833)
- [SWR race condition discussion (GitHub #479)](https://github.com/vercel/swr/discussions/479)
- [SWR v2 optimistic updates](https://swr.vercel.app/blog/swr-v2)
- BetterR.Me codebase analysis: `lib/db/tasks.ts`, `lib/db/recurring-tasks.ts`, `lib/db/types.ts`, `lib/validations/task.ts`, `components/dashboard/dashboard-content.tsx`, `components/dashboard/tasks-today.tsx`, `components/tasks/tasks-page-content.tsx`, `components/tasks/create-task-content.tsx`, `app/api/dashboard/route.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tasks/[id]/toggle/route.ts`, `app/api/sidebar/counts/route.ts`

---
*Pitfalls research for: Adding projects & kanban to BetterR.Me task management*
*Researched: 2026-02-18*
