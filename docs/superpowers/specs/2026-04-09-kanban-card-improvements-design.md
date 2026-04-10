# Kanban Task Details Modal — Redesign Spec

**Date:** 2026-04-09
**Goal:** Add a footer action bar to the Kanban task details modal, consolidate save status indicators, and remove the top-right delete icon for a cleaner, more professional design.

## Overview

The current Kanban task details modal (`kanban-detail-modal.tsx`) has auto-save on blur with per-field save indicators and a trash icon in the top-right corner. This redesign adds a footer bar and consolidates actions without changing the auto-save behavior.

## Changes

### 1. Add Footer Bar

A sticky footer at the bottom of the modal with two sections:

**Left side — Save status indicator:**
- **Idle state:** Green dot + "All changes saved"
- **Saving state:** Spinner + "Saving..."
- **Error state:** Red dot + "Save failed" (on any field save error)

The status reflects the aggregate state of all in-flight saves. If any field is currently saving, show "Saving...". If all saves are complete, show "All changes saved". If the most recent save failed, show "Save failed".

**Right side — Action buttons:**
- **Delete** — Outline button, red/destructive styling. Triggers the existing AlertDialog confirmation flow.
- **Close** — Outline button, default styling. Closes the modal (same as clicking outside).

### 2. Remove Top-Right Trash Icon

The trash icon button currently in the modal header is removed. Delete is now only accessible via the footer. The Dialog's default overlay-click-to-close behavior remains for dismissal.

### 3. Consolidate Save Status to Footer

Remove the per-field "Saving..." / "Saved" indicators from the description card header. The footer's consolidated save status replaces them. This reduces visual noise — users see one clear status instead of per-field spinners.

### 4. Track Aggregate Save State

Add a simple save state tracker to the modal component:

- `saveCount` ref — incremented when a save starts, decremented when it completes
- `lastSaveError` state — set when any save fails, cleared on next successful save
- Footer status derived from: `saveCount > 0` → "Saving...", `lastSaveError` → "Save failed", else → "All changes saved"

## Files Affected

| File | Action | Change |
|------|--------|--------|
| `components/kanban/kanban-detail-modal.tsx` | Modify | Add footer, remove trash from header, remove per-field indicators, add aggregate save state |
| `tests/components/kanban/kanban-detail-modal.test.tsx` | Modify | Update for new footer layout, test save status states |
| `i18n/messages/en.json` | Modify | Add footer-related keys |
| `i18n/messages/zh.json` | Modify | Add footer-related keys |
| `i18n/messages/zh-TW.json` | Modify | Add footer-related keys |

## i18n Keys

```
kanban.detail.footer.allSaved — "All changes saved"
kanban.detail.footer.saving — "Saving..."
kanban.detail.footer.saveFailed — "Save failed"
kanban.detail.footer.close — "Close"
```

Existing keys reused: `kanban.detail.delete`, `kanban.detail.deleteConfirmTitle`, `kanban.detail.deleteConfirmDescription`, `kanban.detail.cancel`.

## Non-Goals

- Changing auto-save to explicit save
- Redesigning the two-column layout
- Adding new fields or tabs
- Changing the delete confirmation flow (AlertDialog stays)
- Mobile-specific layout changes (footer works on all sizes)
