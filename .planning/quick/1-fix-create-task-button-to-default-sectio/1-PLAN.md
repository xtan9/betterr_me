---
phase: quick-fix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/tasks/tasks-page-content.tsx
  - components/tasks/create-task-content.tsx
  - components/tasks/task-form.tsx
  - tests/components/tasks/tasks-page-content.test.tsx
  - tests/components/tasks/create-task-content.test.tsx
autonomous: true
requirements: [BUG-CREATE-TASK-SECTION-DEFAULT]

must_haves:
  truths:
    - "Clicking 'Create First Task' in the Work section navigates to /tasks/new?section=work"
    - "Clicking 'Create First Task' in the Personal section navigates to /tasks/new?section=personal"
    - "The create task form defaults to the section specified in the URL query parameter"
    - "The header 'Create Task' button navigates to /tasks/new without section param and defaults to personal"
  artifacts:
    - path: "components/tasks/tasks-page-content.tsx"
      provides: "Section-aware handleCreateTask and SectionBlock wiring"
    - path: "components/tasks/create-task-content.tsx"
      provides: "Reads ?section query param and passes defaultSection to TaskForm"
    - path: "components/tasks/task-form.tsx"
      provides: "Accepts optional defaultSection prop for initial section value"
  key_links:
    - from: "components/tasks/tasks-page-content.tsx (SectionBlock)"
      to: "/tasks/new?section={section}"
      via: "onCreateTask callback with section parameter"
      pattern: "router\\.push.*tasks/new\\?section="
    - from: "components/tasks/create-task-content.tsx"
      to: "components/tasks/task-form.tsx"
      via: "defaultSection prop"
      pattern: "defaultSection.*searchParams"
---

<objective>
Fix the "Create First Task" button in the tasks page so that it defaults the section (Work/Personal) based on which section's empty state the button was clicked from.

Purpose: When a user clicks "Create First Task" in the Work section, the new task form should default to "Work" instead of always defaulting to "Personal".

Output: Updated components with section-aware navigation and form defaulting, plus updated tests.
</objective>

<execution_context>
@/home/xingdi/.claude/get-shit-done/workflows/execute-plan.md
@/home/xingdi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/tasks/tasks-page-content.tsx
@components/tasks/create-task-content.tsx
@components/tasks/task-form.tsx
@components/tasks/task-empty-state.tsx
@tests/components/tasks/tasks-page-content.test.tsx
@tests/components/tasks/create-task-content.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass section context through navigation and form</name>
  <files>
    components/tasks/tasks-page-content.tsx
    components/tasks/create-task-content.tsx
    components/tasks/task-form.tsx
  </files>
  <action>
    **1. `components/tasks/tasks-page-content.tsx`:**

    - Change `SectionBlockProps.onCreateTask` type from `() => void` to `(section?: TaskSection) => void`.
    - In `TasksPageContent`, update `handleCreateTask` to accept an optional `section?: TaskSection` parameter. When section is provided, navigate to `/tasks/new?section=${section}`. When not provided (header button), navigate to `/tasks/new` (no query param).
    - In the `SectionBlock` component, update the call to `onCreateTask` to pass the section: change line 466 from `onCreateTask={onCreateTask}` to passing a callback that calls `onCreateTask(section)`. Specifically, in the `TaskEmptyState` usage on line 466, change `onCreateTask={onCreateTask}` to `onCreateTask={() => onCreateTask(section)}`.

    **2. `components/tasks/create-task-content.tsx`:**

    - Import `useSearchParams` from `next/navigation` (same pattern as `edit-task-content.tsx`).
    - In `CreateTaskContent`, read the section query param: `const searchParams = useSearchParams(); const defaultSection = searchParams.get("section") as TaskSection | null;`
    - Import `TaskSection` from `@/lib/db/types`.
    - Pass `defaultSection` to `TaskForm` via a new prop: `<TaskForm ... defaultSection={defaultSection ?? undefined} />`.

    **3. `components/tasks/task-form.tsx`:**

    - Add `defaultSection?: TaskSection` to `TaskFormProps` interface. Import `TaskSection` from `@/lib/db/types` (it's already imported on line 34).
    - In the `useForm` defaultValues, change `section: initialData?.section ?? "personal"` to `section: initialData?.section ?? defaultSection ?? "personal"`. This preserves backward compatibility: edit mode uses `initialData.section`, create mode uses `defaultSection` from URL if available, otherwise falls back to "personal".
  </action>
  <verify>
    Run `pnpm build` to confirm no type errors.
  </verify>
  <done>
    - Clicking "Create First Task" in the Work section empty state navigates to `/tasks/new?section=work`
    - Clicking "Create First Task" in the Personal section empty state navigates to `/tasks/new?section=personal`
    - The header "Create Task" button still navigates to `/tasks/new` (no query param, defaults to personal)
    - The TaskForm section toggle defaults to the section from the URL query parameter
  </done>
</task>

<task type="auto">
  <name>Task 2: Update tests for section-aware create task flow</name>
  <files>
    tests/components/tasks/tasks-page-content.test.tsx
    tests/components/tasks/create-task-content.test.tsx
  </files>
  <action>
    **1. `tests/components/tasks/tasks-page-content.test.tsx`:**

    - Update the existing test "navigates to create task page when button clicked" (line 316): The header "Create Task" button should still navigate to `/tasks/new` (no change expected here since header button has no section).
    - Add a new test: "navigates to create task page with section=work when clicking Create First Task in Work section". Setup: Return empty tasks array from SWR so both sections show empty state. Find the Work section heading, then find the CTA button within that section context. Click it. Assert `mockPush` was called with `/tasks/new?section=work`.
    - Add a new test: "navigates to create task page with section=personal when clicking Create First Task in Personal section". Similar setup but click the Personal section's CTA. Assert `mockPush` was called with `/tasks/new?section=personal`.

    To find the correct "Create First Task" button per section:
    - Both empty states will render. Use `screen.getAllByText("Create First Task")` to get both buttons.
    - The order in the DOM matches the render order: Personal first (index 0), Work second (index 1).
    - Click index 1 for Work, index 0 for Personal.

    **2. `tests/components/tasks/create-task-content.test.tsx`:**

    - Add a mock for `useSearchParams` in the existing `next/navigation` mock. Add `mockSearchParams` using `vi.hoisted`: `const { mockPush, mockBack, mockSearchParams } = vi.hoisted(() => ({ mockPush: vi.fn(), mockBack: vi.fn(), mockSearchParams: new URLSearchParams() }));` Update the mock to include `useSearchParams: () => mockSearchParams`.
    - Update existing tests: In `beforeEach`, reset `mockSearchParams` by clearing it (or re-creating). Since `URLSearchParams` is mutable, clear any leftover params: set it to a new instance.
    - Add a new test: "defaults section to work when ?section=work query param is present". Before rendering, set `mockSearchParams` to `new URLSearchParams("section=work")` (you'll need to update the mock to use a mutable ref pattern). Render `CreateTaskContent`. Assert the Work toggle button in the section toggle group has `data-state="on"` and the Personal toggle has `data-state="off"`.
    - Add a new test: "defaults section to personal when no query param". Render with empty search params. Assert Personal toggle has `data-state="on"`.

    For the mockSearchParams pattern, use a ref object:
    ```ts
    const { mockPush, mockBack } = vi.hoisted(() => ({
      mockPush: vi.fn(),
      mockBack: vi.fn(),
    }));
    let mockSearchParamsValue = new URLSearchParams();
    vi.mock('next/navigation', () => ({
      useRouter: () => ({ push: mockPush, back: mockBack }),
      useSearchParams: () => mockSearchParamsValue,
    }));
    ```
    Then in the test, set `mockSearchParamsValue = new URLSearchParams("section=work");` before `render()`.
    Reset in `beforeEach`: `mockSearchParamsValue = new URLSearchParams();`.
  </action>
  <verify>
    Run `pnpm test:run -- tests/components/tasks/tasks-page-content.test.tsx tests/components/tasks/create-task-content.test.tsx` and confirm all tests pass including the new ones.
  </verify>
  <done>
    - All existing tests continue to pass
    - New test confirms Work section CTA navigates to `/tasks/new?section=work`
    - New test confirms Personal section CTA navigates to `/tasks/new?section=personal`
    - New test confirms CreateTaskContent defaults to "work" section when `?section=work` is in URL
    - New test confirms CreateTaskContent defaults to "personal" when no section query param
  </done>
</task>

</tasks>

<verification>
1. `pnpm build` passes with no type errors
2. `pnpm lint` passes with no lint errors
3. `pnpm test:run -- tests/components/tasks/tasks-page-content.test.tsx tests/components/tasks/create-task-content.test.tsx` — all tests pass
4. `pnpm test:run` — full test suite passes (no regressions)
</verification>

<success_criteria>
- The "Create First Task" CTA in the Work section empty state navigates to `/tasks/new?section=work`
- The "Create First Task" CTA in the Personal section empty state navigates to `/tasks/new?section=personal`
- The header "Create Task" button navigates to `/tasks/new` (no section param, defaults to personal)
- The task creation form defaults the section toggle to match the `?section` query parameter
- All existing and new tests pass
- Build and lint succeed
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-create-task-button-to-default-sectio/1-SUMMARY.md`
</output>
