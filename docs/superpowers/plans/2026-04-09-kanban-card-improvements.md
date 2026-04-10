# Kanban Task Details Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a footer action bar with consolidated save status to the Kanban task details modal, remove the top-right delete icon, and remove per-field save indicators.

**Architecture:** Single component refactor of `kanban-detail-modal.tsx`. The footer tracks aggregate save state via a `saveCount` ref (incremented/decremented by `updateField`) and a `lastSaveError` state. The footer replaces the per-field "Saving..."/"Saved" indicators and the top-right trash icon.

**Tech Stack:** React, shadcn/ui (Dialog, AlertDialog, Button), next-intl, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/kanban/kanban-detail-modal.tsx` | Modify | Add footer, remove trash from header, remove per-field indicators, add aggregate save state |
| `tests/components/kanban/kanban-detail-modal.test.tsx` | Modify | Update for new footer layout, test save status states |
| `i18n/messages/en.json` | Modify | Add footer keys |
| `i18n/messages/zh.json` | Modify | Add footer keys |
| `i18n/messages/zh-TW.json` | Modify | Add footer keys |

---

### Task 1: Add i18n Keys

**Files:**
- Modify: `i18n/messages/en.json`
- Modify: `i18n/messages/zh.json`
- Modify: `i18n/messages/zh-TW.json`

- [ ] **Step 1: Add keys to en.json**

In the `kanban.detail` section, after `"deleteConfirmDescription"`, add:

```json
"footer": {
  "allSaved": "All changes saved",
  "saving": "Saving...",
  "saveFailed": "Save failed",
  "close": "Close"
}
```

- [ ] **Step 2: Add keys to zh.json**

```json
"footer": {
  "allSaved": "所有更改已保存",
  "saving": "保存中...",
  "saveFailed": "保存失败",
  "close": "关闭"
}
```

- [ ] **Step 3: Add keys to zh-TW.json**

```json
"footer": {
  "allSaved": "所有變更已儲存",
  "saving": "儲存中...",
  "saveFailed": "儲存失敗",
  "close": "關閉"
}
```

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add i18n/messages/en.json i18n/messages/zh.json i18n/messages/zh-TW.json
git commit -m "feat(kanban): add i18n keys for task detail modal footer"
```

---

### Task 2: Refactor Modal — Footer, Remove Trash, Consolidate Save Status

**Files:**
- Modify: `components/kanban/kanban-detail-modal.tsx`
- Modify: `tests/components/kanban/kanban-detail-modal.test.tsx`

- [ ] **Step 1: Update tests for new footer**

In `tests/components/kanban/kanban-detail-modal.test.tsx`, update the mock translations to include the new footer keys. Add these to the `messages` record inside the `useTranslations` mock:

```ts
"detail.footer.allSaved": "All changes saved",
"detail.footer.saving": "Saving...",
"detail.footer.saveFailed": "Save failed",
"detail.footer.close": "Close",
```

Update the existing delete test — the delete button is now in the footer, not in the header. The test currently finds the delete button via `aria-label`. The AlertDialog trigger button still has `aria-label={t("detail.delete")}`, so the selector should still work. But the test that checks for the trash icon in the header should be updated.

Add new tests:

```tsx
it("shows 'All changes saved' in footer when idle", () => {
  render(<KanbanDetailModal {...defaultProps} />);
  expect(screen.getByText("All changes saved")).toBeInTheDocument();
});

it("shows 'Saving...' in footer during field save", async () => {
  // Mock fetch to delay
  let resolvePromise: () => void;
  const fetchPromise = new Promise<void>((r) => { resolvePromise = r; });
  global.fetch = vi.fn().mockImplementation(() => fetchPromise.then(() => ({
    ok: true,
    json: () => Promise.resolve({ task: mockTask }),
  })));

  render(<KanbanDetailModal {...defaultProps} />);
  const textarea = screen.getByPlaceholderText("Add a description...");
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "new text");
  await userEvent.tab(); // blur triggers save

  expect(screen.getByText("Saving...")).toBeInTheDocument();
  resolvePromise!();
});

it("shows Close button in footer that closes the modal", async () => {
  const onClose = vi.fn();
  render(<KanbanDetailModal {...defaultProps} onClose={onClose} />);
  const closeBtn = screen.getByRole("button", { name: "Close" });
  await userEvent.click(closeBtn);
  expect(onClose).toHaveBeenCalled();
});

it("does not show per-field save indicator next to description", async () => {
  render(<KanbanDetailModal {...defaultProps} />);
  // The old "Saved" indicator was next to the Description heading
  // It should no longer appear there (consolidated to footer)
  const descHeading = screen.getByText("Description");
  const parent = descHeading.parentElement;
  expect(parent?.querySelector(".text-green-500")).toBeNull();
});
```

Remove or update any test that specifically looks for the trash icon in the header area.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/kanban/kanban-detail-modal.test.tsx`
Expected: FAIL — "All changes saved" not found, "Close" button not found

- [ ] **Step 3: Refactor the modal component**

In `components/kanban/kanban-detail-modal.tsx`, make these changes:

**3a. Add aggregate save state tracking.**

Replace the existing `savingFields` and `savedField` state (lines 87-88):

```ts
const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
const [savedField, setSavedField] = useState<string | null>(null);
```

With:

```ts
const saveCountRef = useRef(0);
const [isSaving, setIsSaving] = useState(false);
const [lastSaveError, setLastSaveError] = useState(false);
```

**3b. Update `updateField` to use aggregate state.**

In the `updateField` callback (lines 125-158), replace the `setSavingFields` / `showSavedIndicator` logic:

```ts
const updateField = useCallback(
  async <K extends keyof TaskUpdate>(field: K, value: TaskUpdate[K]): Promise<boolean> => {
    if (!task) return false;
    const fieldName = String(field);
    saveCountRef.current += 1;
    setIsSaving(true);
    setLastSaveError(false);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        console.error(`Task update failed: field="${fieldName}", status=${res.status}, serverError="${body?.error}"`);
        toast.error(body?.error || t("detail.updateError"));
        setLastSaveError(true);
        return false;
      }
      onTaskUpdated();
      return true;
    } catch (error) {
      console.error(`Task update network error: field="${fieldName}"`, error);
      toast.error(t("detail.updateError"));
      setLastSaveError(true);
      return false;
    } finally {
      saveCountRef.current -= 1;
      if (saveCountRef.current === 0) {
        setIsSaving(false);
      }
    }
  },
  [task, onTaskUpdated, t]
);
```

**3c. Remove the `showSavedIndicator` callback and `savedTimerRef`** (lines 91-92, 94-98, 119-123). These are no longer needed.

**3d. Remove the per-field save indicators from the description card header** (lines 407-418). Change the description card header from:

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h3 className="text-base font-semibold">
    {t("detail.descriptionHeading")}
  </h3>
  {savingFields.has("description") && (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      {t("detail.saving")}
    </span>
  )}
  {savedField === "description" && (
    <span className="flex items-center gap-1 text-xs text-green-500">
      <Check className="size-3" />
      {t("detail.saved")}
    </span>
  )}
</div>
```

To:

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h3 className="text-base font-semibold">
    {t("detail.descriptionHeading")}
  </h3>
</div>
```

**3e. Remove the AlertDialog + trash icon from the header** (lines 250-279). Remove the entire `<AlertDialog>` block from inside the header's `<div className="flex items-start justify-between ...">`. The header div simplifies to just the title.

**3f. Add the footer before the closing `</Tabs>`** (before line 465). Insert between the closing `</TabsContent>` (activity tab) and `</Tabs>`:

```tsx
{/* Footer bar */}
<div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3 flex-shrink-0">
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    {isSaving ? (
      <>
        <Loader2 className="size-3 animate-spin" />
        {t("detail.footer.saving")}
      </>
    ) : lastSaveError ? (
      <>
        <span className="size-2 rounded-full bg-destructive inline-block" />
        {t("detail.footer.saveFailed")}
      </>
    ) : (
      <>
        <span className="size-2 rounded-full bg-green-500 inline-block" />
        {t("detail.footer.allSaved")}
      </>
    )}
  </div>
  <div className="flex items-center gap-2">
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          aria-label={t("detail.delete")}
        >
          <Trash2 className="size-3.5 mr-1.5" />
          {t("detail.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertTitle>{t("detail.deleteConfirmTitle")}</AlertTitle>
          <AlertDialogDescription>
            {t("detail.deleteConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("detail.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? t("detail.deleting") : t("detail.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Button
      variant="outline"
      size="sm"
      onClick={onClose}
    >
      {t("detail.footer.close")}
    </Button>
  </div>
</div>
```

**3g. Clean up unused imports.** Remove `Check` from the lucide-react import (no longer used after removing the per-field save indicator). Keep `Loader2` (used in footer) and `Trash2` (used in footer).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/kanban/kanban-detail-modal.test.tsx`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add components/kanban/kanban-detail-modal.tsx tests/components/kanban/kanban-detail-modal.test.tsx
git commit -m "feat(kanban): add footer bar with save status, move delete to footer"
```

---

### Task 3: Final Integration Test & PR

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: PASS (excluding pre-existing failures)

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

- [ ] **Step 3: Push and create PR**

```bash
git push -u origin feat/kanban-card-improvements
```

Create PR with summary of footer bar changes.
