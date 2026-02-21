---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - components/kanban/kanban-detail-modal.tsx
autonomous: true
requirements:
  - QUICK-3

must_haves:
  truths:
    - "Kanban detail modal opens with a smooth fade + slide-up animation instead of zoom"
    - "Kanban detail modal closes with a fade + slide-down animation"
    - "No visual glitch of bottom-right origin shift on open/close"
    - "Other dialogs in the app remain unchanged (zoom animation preserved)"
  artifacts:
    - path: "components/kanban/kanban-detail-modal.tsx"
      provides: "Overridden animation classes on DialogContent"
      contains: "slide-in-from-bottom"
  key_links: []
---

<objective>
Fix the kanban task detail modal animation. The current zoom-in-95/zoom-out-95 animation combined with translate-based centering creates a perceived "bottom-right origin" effect on the large (85vw x 85vh) modal. Replace with a fade + slight slide-up animation for a cleaner feel.

Purpose: Eliminate the jarring zoom animation artifact on the large kanban detail modal.
Output: Updated kanban-detail-modal.tsx with overridden animation classes.
</objective>

<execution_context>
@/home/xingdi/.claude/get-shit-done/workflows/execute-plan.md
@/home/xingdi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/kanban/kanban-detail-modal.tsx
@components/ui/dialog.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Override DialogContent animation classes in KanbanDetailModal</name>
  <files>components/kanban/kanban-detail-modal.tsx</files>
  <action>
In `kanban-detail-modal.tsx` line 118, update the `DialogContent` className prop to add animation override classes. The current className is:

```
"sm:max-w-[85vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-[#1a1a2e]"
```

Add these classes to neutralize the zoom and add a slide-up effect:

```
"sm:max-w-[85vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-[#1a1a2e] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4"
```

Explanation of the added classes:
- `data-[state=open]:zoom-in-100` overrides `zoom-in-95` from the base DialogContent (100% = no zoom, effectively neutralized)
- `data-[state=closed]:zoom-out-100` overrides `zoom-out-95` (same reasoning)
- `data-[state=open]:slide-in-from-bottom-4` adds a subtle 1rem slide-up on open
- `data-[state=closed]:slide-out-to-bottom-4` adds a subtle 1rem slide-down on close

The base DialogContent already has `fade-in-0` / `fade-out-0` which provide the fade effect -- those stay as-is.

Do NOT edit `components/ui/dialog.tsx` (CLAUDE.md: "Do not edit components/ui/ directly").

The `cn()` utility uses `tailwind-merge`, so the className values passed to DialogContent will override the base classes from dialog.tsx when they conflict (same variant + same utility group).
  </action>
  <verify>
1. `pnpm lint` passes with no new errors
2. `pnpm build` completes without errors
3. Visually verify (checkpoint not needed -- user will verify after merge): open a kanban task detail, confirm the modal fades in and slides up slightly instead of zooming
  </verify>
  <done>
KanbanDetailModal's DialogContent has animation override classes. The modal opens with fade + slide-up-4 instead of zoom-in-95, and closes with fade + slide-down-4 instead of zoom-out-95. No other dialogs are affected.
  </done>
</task>

</tasks>

<verification>
- `pnpm lint` passes
- `pnpm build` completes successfully
- Only `components/kanban/kanban-detail-modal.tsx` is modified (one line change)
- `components/ui/dialog.tsx` is NOT modified
</verification>

<success_criteria>
- The kanban detail modal uses fade + slide-up animation instead of zoom
- The animation feels smooth and centered (no bottom-right origin artifact)
- All other dialogs in the app retain their default zoom animation
- Build and lint pass cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-kanban-task-detail-popup-animation-o/3-SUMMARY.md`
</output>
