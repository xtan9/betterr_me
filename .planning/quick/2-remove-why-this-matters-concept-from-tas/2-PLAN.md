---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/db/types.ts
  - lib/validations/task.ts
  - lib/validations/recurring-task.ts
  - lib/recurring-tasks/instance-generator.ts
  - lib/db/recurring-tasks.ts
  - app/api/tasks/route.ts
  - app/api/tasks/[id]/route.ts
  - app/api/recurring-tasks/route.ts
  - components/tasks/task-form.tsx
  - components/tasks/task-detail-content.tsx
  - components/dashboard/tasks-today.tsx
  - i18n/messages/en.json
  - i18n/messages/zh.json
  - i18n/messages/zh-TW.json
  - supabase/migrations/20260221000001_drop_task_intention.sql
  - tests/components/tasks/task-form.test.tsx
  - tests/components/tasks/task-detail-content.test.tsx
  - tests/components/dashboard/tasks-today.test.tsx
  - tests/app/api/tasks/route.test.ts
  - tests/app/api/tasks/[id]/route.test.ts
  - tests/lib/validations/task.test.ts
  - tests/lib/validations/recurring-task.test.ts
  - tests/lib/recurring-tasks/instance-generator.test.ts
  - tests/lib/db/recurring-tasks.test.ts
  - tests/components/tasks/create-task-content.test.tsx
  - tests/components/tasks/tasks-page-content.test.tsx
  - tests/components/tasks/edit-task-content.test.tsx
  - tests/app/dashboard/dashboard-content.test.tsx
  - tests/lib/tasks/sync.test.ts
autonomous: true
requirements: [QUICK-2]

must_haves:
  truths:
    - "The task creation form has no intention/why-this-matters field"
    - "The task detail page does not display any Your Why section"
    - "The dashboard tasks-today widget does not show intention text"
    - "API routes do not read or write intention field"
    - "TypeScript types do not include intention property"
    - "All tests pass with intention fully removed"
  artifacts:
    - path: "lib/db/types.ts"
      provides: "Task and RecurringTask types without intention"
      contains: "interface Task"
    - path: "components/tasks/task-form.tsx"
      provides: "Task form without intention field"
    - path: "components/tasks/task-detail-content.tsx"
      provides: "Task detail without Your Why section"
    - path: "supabase/migrations/20260221000001_drop_task_intention.sql"
      provides: "Migration to drop intention column from tasks and recurring_tasks tables"
  key_links:
    - from: "components/tasks/task-form.tsx"
      to: "lib/validations/task.ts"
      via: "taskFormSchema import"
      pattern: "taskFormSchema"
    - from: "app/api/tasks/route.ts"
      to: "lib/validations/task.ts"
      via: "validation schema"
      pattern: "taskFormSchema"
---

<objective>
Remove the "Why This Matters" (intention) concept entirely from the codebase. This field exists across types, validation schemas, form UI, detail display, API routes, recurring task logic, i18n strings, and tests. All references must be stripped cleanly.

Purpose: Simplify the task model by removing an unused/unwanted field.
Output: Clean codebase with no intention references in source or tests, plus a DB migration to drop the column.
</objective>

<execution_context>
@/home/xingdi/.claude/get-shit-done/workflows/execute-plan.md
@/home/xingdi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@lib/db/types.ts
@lib/validations/task.ts
@lib/validations/recurring-task.ts
@components/tasks/task-form.tsx
@components/tasks/task-detail-content.tsx
@components/dashboard/tasks-today.tsx
@app/api/tasks/route.ts
@app/api/tasks/[id]/route.ts
@app/api/recurring-tasks/route.ts
@lib/recurring-tasks/instance-generator.ts
@lib/db/recurring-tasks.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove intention from types, validations, API routes, and recurring task logic</name>
  <files>
    lib/db/types.ts
    lib/validations/task.ts
    lib/validations/recurring-task.ts
    lib/recurring-tasks/instance-generator.ts
    lib/db/recurring-tasks.ts
    app/api/tasks/route.ts
    app/api/tasks/[id]/route.ts
    app/api/recurring-tasks/route.ts
    supabase/migrations/20260221000001_drop_task_intention.sql
  </files>
  <action>
    Remove the `intention` field from all TypeScript types and backend logic:

    1. **lib/db/types.ts**: Remove `intention: string | null` from `Task` interface (line 54). Remove `intention?: string | null` from `TaskInsert` type (line 71). Remove `intention: string | null` from `RecurringTask` interface (line 164).

    2. **lib/validations/task.ts**: Remove `intention: z.string().max(200).optional().nullable()` from `taskFormSchema` (line 12). The `taskUpdateSchema` extends `taskFormSchema.partial()` so it will automatically lose the field.

    3. **lib/validations/recurring-task.ts**: Remove `intention: z.string().max(200).optional().nullable()` from the recurring task create/update schemas (around line 46 and 85).

    4. **app/api/tasks/route.ts**: In POST handler, remove `intention: validation.data.intention?.trim() || null` from the `taskData` object (line 161).

    5. **app/api/tasks/[id]/route.ts**: In PATCH handler, remove the `if (validation.data.intention !== undefined)` block (lines 104-106).

    6. **app/api/recurring-tasks/route.ts**: Remove `intention: validation.data.intention?.trim() || null` from the POST handler (around line 77).

    7. **lib/recurring-tasks/instance-generator.ts**: Remove `intention: template.intention` from the task instance creation object (line 115).

    8. **lib/db/recurring-tasks.ts**: Remove the two `if (updates.intention !== undefined) templateUpdates.intention = updates.intention` lines (around lines 195 and 223).

    9. **Create migration** `supabase/migrations/20260221000001_drop_task_intention.sql`:
       ```sql
       ALTER TABLE tasks DROP COLUMN IF EXISTS intention;
       ALTER TABLE recurring_tasks DROP COLUMN IF EXISTS intention;
       ```

    IMPORTANT: After removing `intention` from the `Task` interface, also remove it from the `TaskInsert` Omit list (the string `'intention'` in the Omit generic type parameter on line 68) since the field no longer exists.
  </action>
  <verify>Run `pnpm tsc --noEmit` to confirm no TypeScript errors from the removed field references.</verify>
  <done>No `intention` field in any TypeScript type, validation schema, API route, or recurring task logic. Migration file exists to drop the DB column.</done>
</task>

<task type="auto">
  <name>Task 2: Remove intention from UI components and i18n strings</name>
  <files>
    components/tasks/task-form.tsx
    components/tasks/task-detail-content.tsx
    components/dashboard/tasks-today.tsx
    i18n/messages/en.json
    i18n/messages/zh.json
    i18n/messages/zh-TW.json
  </files>
  <action>
    Strip intention from all UI and translations:

    1. **components/tasks/task-form.tsx**:
       - Remove the entire `<FormField>` block for `name="intention"` (lines 301-321). This is the "Why This Matters" input field.
       - Remove `intention: initialData?.intention ?? null` from the `defaultValues` object (line 114).
       - Remove `intention: data.intention || null` from the `handleFormSubmit` spread (line 159).

    2. **components/tasks/task-detail-content.tsx**:
       - Remove the entire "Your Why" conditional block: `{task.intention && (<div className="flex items-start ...">...</div>)}` (lines 277-289).

    3. **components/dashboard/tasks-today.tsx**:
       - In `qualifiesForReflection` function (line 16): Change from `return task.priority === 3 || !!task.intention` to `return task.priority === 3`. The intention check is no longer valid.
       - Remove the conditional display of `task.intention` text (lines 120-123): Remove `{task.priority === 3 && task.intention && (<p ...>{task.intention}</p>)}`.

    4. **i18n/messages/en.json**: Remove the two keys inside `tasks.form`:
       - `"intentionLabel": "Why This Matters"`
       - `"intentionPlaceholder": "Why does this matter to you?"`
       Also remove `"yourWhy": "Your Why"` from `tasks.detail`.

    5. **i18n/messages/zh.json**: Remove the same three keys:
       - `"intentionLabel": "为什么重要"` and `"intentionPlaceholder": "这件事对你来说为什么重要？"` from `tasks.form`
       - `"yourWhy": "你的初衷"` from `tasks.detail`

    6. **i18n/messages/zh-TW.json**: Remove the same three keys:
       - `"intentionLabel": "為什麼重要"` and `"intentionPlaceholder": "這件事對你來說為什麼重要？"` from `tasks.form`
       - `"yourWhy": "你的初衷"` from `tasks.detail`
  </action>
  <verify>Run `pnpm build` to confirm no build errors and no missing i18n key warnings.</verify>
  <done>Task form has no intention field, task detail has no "Your Why" section, dashboard tasks-today does not reference intention, all three locale files have no intention-related keys.</done>
</task>

<task type="auto">
  <name>Task 3: Update all tests and run full test suite</name>
  <files>
    tests/components/tasks/task-form.test.tsx
    tests/components/tasks/task-detail-content.test.tsx
    tests/components/dashboard/tasks-today.test.tsx
    tests/app/api/tasks/route.test.ts
    tests/app/api/tasks/[id]/route.test.ts
    tests/lib/validations/task.test.ts
    tests/lib/validations/recurring-task.test.ts
    tests/lib/recurring-tasks/instance-generator.test.ts
    tests/lib/db/recurring-tasks.test.ts
    tests/components/tasks/create-task-content.test.tsx
    tests/components/tasks/tasks-page-content.test.tsx
    tests/components/tasks/edit-task-content.test.tsx
    tests/app/dashboard/dashboard-content.test.tsx
    tests/lib/tasks/sync.test.ts
  </files>
  <action>
    Update all test files that reference `intention`:

    For each test file, grep for `intention` and:
    - Remove `intention` from mock data objects (e.g., `intention: null`, `intention: 'some text'`)
    - Remove `intention` from expected/asserted objects
    - Remove or update test cases that specifically test intention behavior (e.g., "renders intention field", "validates intention max length")
    - In task-form.test.tsx: Remove `'intentionLabel': 'Why This Matters'` from mock translations (line 32), remove the test that checks for "Why This Matters" text (around line 404)
    - In tasks-today.test.tsx: Remove `intention` from mock task data, update any tests for the reflection qualification logic to only check priority
    - In task-detail-content.test.tsx: Remove any test for "Your Why" rendering
    - In API route tests: Remove `intention` from request bodies and expected response shapes
    - In validation tests: Remove test cases for intention validation
    - In recurring-task tests: Remove `intention` from template and instance mock data
    - In sync.test.ts: Remove `intention` from mock task objects if present
    - In create-task-content.test.tsx, tasks-page-content.test.tsx, edit-task-content.test.tsx, dashboard-content.test.tsx: Remove `intention` from any mock data

    Do NOT delete test files. Only remove intention-specific lines/blocks within them.

    After updating tests, run `pnpm lint` and fix any lint errors (unused imports, trailing commas, etc.).
  </action>
  <verify>Run `pnpm test:run` — all tests pass (except the 2 known pre-existing failures in habit-logs.test.ts). Run `pnpm lint` — no lint errors.</verify>
  <done>All 14 test files updated, no TypeScript errors, all tests pass, lint clean. Zero references to `intention` remain in source code (docs excluded).</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `grep -r "intention" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v .planning | grep -v docs | grep -v .playwright-mcp` returns zero results
2. `pnpm tsc --noEmit` passes
3. `pnpm build` passes
4. `pnpm test:run` passes (except known 2 failures in habit-logs.test.ts)
5. `pnpm lint` passes
6. Migration file exists at `supabase/migrations/20260221000001_drop_task_intention.sql`
</verification>

<success_criteria>
- Zero references to `intention`, `intentionLabel`, `intentionPlaceholder`, or `yourWhy` in any source file (types, components, API routes, validations, tests, i18n)
- All existing tests pass after removal
- Database migration created to drop the column
- Build and lint clean
</success_criteria>

<output>
After completion, create `.planning/quick/2-remove-why-this-matters-concept-from-tas/2-SUMMARY.md`
</output>
