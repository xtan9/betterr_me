# Remove Separate Recurring Tasks Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the standalone `/tasks/recurring` page and its "Recurring" button, integrating paused-template management directly into `/tasks` as a small inline banner.

**Architecture:** The `/tasks/recurring` page is a template-management admin screen that creates UX confusion. Recurring task instances already appear in the main task list. For active templates, users manage them via the existing EditScopeDialog ("this / following / all") on any instance. For paused templates (which have no visible instances), we add a lightweight collapsible banner at the bottom of `/tasks`. The `/api/recurring-tasks` API routes remain unchanged — they're still called for pause/resume/delete operations.

**Tech Stack:** Next.js App Router, SWR, shadcn/ui, next-intl, Vitest

---

### Task 1: Remove the "Recurring" button from tasks page header

**Files:**
- Modify: `components/tasks/tasks-page-content.tsx:6,74-79`

**Step 1: Remove the Recurring button and its import**

In `components/tasks/tasks-page-content.tsx`:

1. Remove `Repeat` from the lucide-react import on line 6 (keep `Plus, RefreshCw`)
2. Remove the `<Button variant="outline" onClick={() => router.push("/tasks/recurring")}>` block (lines 76–79)
3. Since the Create button is now the only action, simplify the `actions` prop — remove the wrapping `<div className="flex gap-2">` and just pass the Create button directly

The result should look like:

```tsx
actions={
  <Button onClick={handleCreateTask}>
    <Plus className="size-4 mr-2" />
    {t("page.createButton")}
  </Button>
}
```

**Step 2: Run lint to verify**

Run: `pnpm lint`
Expected: No errors related to `tasks-page-content.tsx`

**Step 3: Commit**

```
feat: remove Recurring button from tasks page header
```

---

### Task 2: Add paused recurring tasks banner to `/tasks`

**Files:**
- Modify: `components/tasks/tasks-page-content.tsx`

**Step 1: Write the failing test**

Add a test in `tests/components/tasks/tasks-page-content.test.tsx`:

```tsx
it("shows paused recurring tasks banner when paused templates exist", async () => {
  // First call: tasks, Second call: paused recurring tasks
  mockUseSWR.mockImplementation((key: string) => {
    if (key === "/api/tasks") {
      return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
    }
    if (key === "/api/recurring-tasks?status=paused") {
      return {
        data: [
          { id: "rt-1", title: "Weekly review", status: "paused", recurrence_rule: { frequency: "weekly", interval: 1 } },
        ],
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    }
    return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
  });

  renderWithProviders(<TasksPageContent />);

  expect(screen.getByText("Weekly review")).toBeInTheDocument();
});

it("does not show paused banner when no paused templates", () => {
  mockUseSWR.mockImplementation((key: string) => {
    if (key === "/api/tasks") {
      return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
    }
    if (key === "/api/recurring-tasks?status=paused") {
      return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
    }
    return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
  });

  renderWithProviders(<TasksPageContent />);

  expect(screen.queryByText(/paused/i)).not.toBeInTheDocument();
});
```

Also update the test messages object to include the new i18n keys:

```tsx
const messages = {
  tasks: {
    page: {
      title: "My Tasks",
      createButton: "Create Task",
    },
    paused: {
      title: "{count} paused recurring tasks",
      resume: "Resume",
      delete: "Delete",
      resumeSuccess: "Recurring task resumed",
      deleteSuccess: "Recurring task deleted",
      actionError: "Action failed",
    },
    // ... existing keys ...
  },
};
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/tasks/tasks-page-content.test.tsx`
Expected: FAIL — no "Weekly review" text rendered

**Step 3: Implement the paused banner in `tasks-page-content.tsx`**

Add a second SWR call for paused templates and a `PausedRecurringBanner` section:

```tsx
import { Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";
import type { RecurringTask } from "@/lib/db/types";

// Inside TasksPageContent:

const recurringFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.recurring_tasks;
};

const {
  data: pausedTemplates,
  mutate: mutatePaused,
} = useSWR<RecurringTask[]>(
  "/api/recurring-tasks?status=paused",
  recurringFetcher,
  { revalidateOnFocus: true }
);

const handleResume = async (templateId: string) => {
  try {
    const res = await fetch(`/api/recurring-tasks/${templateId}?action=resume`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    mutatePaused();
    mutate(); // refresh tasks list too — resumed template may generate new instances
    toast.success(t("paused.resumeSuccess"));
  } catch {
    toast.error(t("paused.actionError"));
  }
};

const handleDeleteTemplate = async (templateId: string) => {
  try {
    const res = await fetch(`/api/recurring-tasks/${templateId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    mutatePaused();
    toast.success(t("paused.deleteSuccess"));
  } catch {
    toast.error(t("paused.actionError"));
  }
};
```

In the JSX, after `<TaskList>`, add:

```tsx
{/* Paused recurring tasks banner */}
{pausedTemplates && pausedTemplates.length > 0 && (
  <div className="space-y-3">
    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
      <Pause className="size-4" />
      {t("paused.title", { count: pausedTemplates.length })}
    </h3>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {pausedTemplates.map((template) => (
        <Card key={template.id} className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="font-medium truncate text-sm">{template.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {describeRecurrence(template.recurrence_rule)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleResume(template.id)}
                  title={t("paused.resume")}
                >
                  <Play className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteTemplate(template.id)}
                  title={t("paused.delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
)}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/tasks/tasks-page-content.test.tsx`
Expected: PASS

**Step 5: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 6: Commit**

```
feat: add paused recurring tasks banner to /tasks page
```

---

### Task 3: Add i18n strings for paused banner (all 3 locales)

**Files:**
- Modify: `i18n/messages/en.json`
- Modify: `i18n/messages/zh.json`
- Modify: `i18n/messages/zh-TW.json`

**Step 1: Add new keys to `tasks` section in all 3 locales**

In each locale file, add under `tasks` (sibling of `page`, `list`, etc.):

**en.json:**
```json
"paused": {
  "title": "{count} paused recurring tasks",
  "resume": "Resume",
  "delete": "Delete",
  "resumeSuccess": "Recurring task resumed",
  "deleteSuccess": "Recurring task deleted",
  "actionError": "Action failed"
}
```

**zh.json:**
```json
"paused": {
  "title": "{count} 个已暂停的重复任务",
  "resume": "恢复",
  "delete": "删除",
  "resumeSuccess": "重复任务已恢复",
  "deleteSuccess": "重复任务已删除",
  "actionError": "操作失败"
}
```

**zh-TW.json:**
```json
"paused": {
  "title": "{count} 個已暫停的重複任務",
  "resume": "恢復",
  "delete": "刪除",
  "resumeSuccess": "重複任務已恢復",
  "deleteSuccess": "重複任務已刪除",
  "actionError": "操作失敗"
}
```

**Step 2: Commit**

```
feat: add i18n strings for paused recurring tasks banner
```

---

### Task 4: Delete the `/tasks/recurring` page and its component

**Files:**
- Delete: `app/tasks/recurring/page.tsx`
- Delete: `components/tasks/recurring-tasks-page-content.tsx`

**Step 1: Delete both files**

```bash
rm app/tasks/recurring/page.tsx
rm components/tasks/recurring-tasks-page-content.tsx
```

**Step 2: Verify no other imports reference these files**

Search for any imports of `recurring-tasks-page-content` or route references to `/tasks/recurring` across the codebase. The only remaining reference should be i18n keys under `tasks.recurring` — those will be cleaned up in Task 5.

**Step 3: Run the build to verify nothing breaks**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```
refactor: remove /tasks/recurring page and component
```

---

### Task 5: Clean up dead i18n keys

**Files:**
- Modify: `i18n/messages/en.json`
- Modify: `i18n/messages/zh.json`
- Modify: `i18n/messages/zh-TW.json`

**Step 1: Remove the `tasks.recurring` section from all 3 locale files**

The entire `"recurring": { ... }` block under `tasks` (which contained `title`, `createNew`, `empty`, `emptyDescription`, `error`, `retry`, `activeSection`, `pausedSection`, `archivedSection`, `nextOccurrence`, `pause`, `resume`, `deleteTemplate`, `pauseSuccess`, `resumeSuccess`, `deleteSuccess`, `actionError`, `status.*`) was only used by the now-deleted `RecurringTasksPageContent`. Remove it from all 3 files.

**Keep** the `tasks.page.recurringButton` key — actually, this was the text for the button we removed in Task 1. Remove it too.

**Keep** the `tasks.recurrence` section (recurrence descriptions like "Every day", "Every weekday") — these are still used by `describeRecurrence()` and `RecurrencePicker`.

**Keep** the `tasks.scope` section — still used by `EditScopeDialog`.

**Step 2: Verify nothing references deleted keys**

Search for `t("recurring."` in the codebase (excluding locale files). Should have zero results after the page deletion.

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 4: Commit**

```
chore: remove dead i18n keys from deleted recurring page
```

---

### Task 6: Update existing test for removed button

**Files:**
- Modify: `tests/components/tasks/tasks-page-content.test.tsx`

**Step 1: Verify the existing test mock setup works with the new dual-SWR pattern**

The existing tests use `mockUseSWR.mockReturnValue(...)` which returns the same value for ALL SWR calls. Since `TasksPageContent` now makes 2 SWR calls (tasks + paused templates), update the existing tests to use `mockImplementation` that dispatches by key:

```tsx
// Helper for existing tests
function mockSWRForTasks(overrides: Partial<ReturnType<typeof useSWR>>) {
  mockUseSWR.mockImplementation((key: string) => {
    if (key === "/api/tasks") {
      return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn(), ...overrides };
    }
    // Paused templates — return empty by default
    return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
  });
}
```

Update existing tests to use this helper. E.g. the loading test becomes:

```tsx
it("shows loading skeleton while data is loading", () => {
  mockSWRForTasks({ isLoading: true, data: undefined });
  renderWithProviders(<TasksPageContent />);
  expect(screen.getByTestId("tasks-skeleton")).toBeInTheDocument();
});
```

Also remove the `recurringButton` key from the test messages (no longer rendered), and remove any test that checks for the Recurring button navigation.

**Step 2: Run all tests**

Run: `pnpm vitest run tests/components/tasks/tasks-page-content.test.tsx`
Expected: All tests pass

**Step 3: Commit**

```
test: update tasks page tests for removed recurring button and dual SWR
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass (except the 2 known pre-existing failures in `habit-logs.test.ts`)

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Manual smoke test** (if dev server available)

- Navigate to `/tasks` — no "Recurring" button in header
- If you have paused recurring tasks, a banner shows at the bottom with resume/delete
- Navigate to `/tasks/recurring` — should 404
- Clicking a recurring task instance → detail → Edit/Delete still shows scope dialog

**Step 5: Final commit (if any fixups needed)**

```
chore: final cleanup for recurring page removal
```
