# Split Oversized Component Files (>400 lines)

## Goal

Reduce all component files over 400 lines to ~350 lines or fewer by extracting co-located components to their own files and extracting heavy state logic into custom hooks. No behavioral changes — purely structural refactoring.

## Scope

12 component files across 6 domains. One PR for all changes.

## Strategy

Three extraction patterns applied based on file structure:

1. **Co-located components → own files** (skeletons, section blocks, sub-dialogs)
2. **Heavy state logic → custom hooks** (dismiss logic, navigation, persistence)
3. **Wizard steps → subdirectory** (csv-import only)

Files that are inherently single-unit forms (`event-dialog.tsx`, `task-form.tsx`) get minimal or no splitting.

## File-by-File Plan

### 1. `components/dashboard/dashboard-content.tsx` (598 → ~350)

| Extract | Target File | Lines |
|---------|-------------|-------|
| `DashboardSkeleton` | `dashboard-skeleton.tsx` | ~60 |
| Dismiss state logic (absence, motivation, milestones, insights) | `use-dashboard-dismissals.ts` | ~100 |
| `EMPTY_DASHBOARD` constant + `getWeekKey` helper | into the hook or kept in main file | ~15 |

### 2. `components/calendar/calendar-page-content.tsx` (569 → ~300)

| Extract | Target File | Lines |
|---------|-------------|-------|
| Navigation functions (`goToToday`, `goToPrev`, `goToNext`, `setView`, `navigateToDate`, `handleDayClick`) + URL params logic | `use-calendar-navigation.ts` | ~120 |
| Event creation state + handlers (`quickCreate`, `eventDialog`, `handleTimeSlotClick`, `handleDragSelect`, `handleEventClick`, `handleNewEvent`, `handleQuickCreateMoreOptions`, `handleEventSaved`) | `use-calendar-events.ts` | ~100 |

### 3. `components/tasks/tasks-page-content.tsx` (562 → ~280)

| Extract | Target File | Lines |
|---------|-------------|-------|
| `SectionBlock` component + its props interface | `section-block.tsx` | ~110 |
| `TasksPageSkeleton` | `tasks-page-skeleton.tsx` | ~20 |
| Local `fetcher` + `recurringFetcher` | `tasks-page-skeleton.tsx` or kept inline | ~10 |

### 4. `components/habits/habit-detail-content.tsx` (517 → ~370)

| Extract | Target File | Lines |
|---------|-------------|-------|
| `HabitDetailSkeleton` | `habit-detail-skeleton.tsx` | ~45 |
| `formatFrequency` helper | `habit-detail-skeleton.tsx` (co-locate) or existing `lib/habits/format.ts` | ~20 |
| `habitFetcher` + `HabitStats` interface | keep in main file (trivial) | — |

### 5. `components/money/csv-import-dialog.tsx` (513 → ~80 orchestrator)

Move to `components/money/csv-import/` subdirectory:

| Extract | Target File | Lines |
|---------|-------------|-------|
| Step 1: upload + account | `csv-upload-step.tsx` | ~80 |
| Step 2: column mapping | `csv-mapping-step.tsx` | ~90 |
| Step 3: preview | `csv-preview-step.tsx` | ~60 |
| Step 4: importing/result | `csv-result-step.tsx` | ~40 |
| Shared types + state | `csv-import-dialog.tsx` (orchestrator) | ~80 |

Update the import in `components/money/transactions-page-content.tsx` (or wherever it's consumed).

### 6. `components/kanban/kanban-detail-modal.tsx` (477 → ~300)

| Extract | Target File | Lines |
|---------|-------------|-------|
| Info card (status, priority, due date, project grid) | `kanban-info-card.tsx` | ~100 |
| Footer bar (save status + delete) | `kanban-footer-bar.tsx` | ~60 |

### 7. `components/chat/chat-content.tsx` (424 → ~280)

| Extract | Target File | Lines |
|---------|-------------|-------|
| Message persistence effect + conversation creation | `use-chat-persistence.ts` | ~100 |
| Error message/retryable logic | keep inline (small) | — |

### 8. `components/money/budget-overview.tsx` (406 → ~280)

| Extract | Target File | Lines |
|---------|-------------|-------|
| Budget summary card (ring + stats) | `budget-summary-card.tsx` | ~50 |
| Category cards grid | `budget-category-grid.tsx` | ~60 |

### 9. `components/tasks/task-detail-content.tsx` (412 → ~330)

| Extract | Target File | Lines |
|---------|-------------|-------|
| `TaskDetailSkeleton` | `task-detail-skeleton.tsx` | ~25 |
| Details grid (category, priority, due date, due time cards) | `task-details-grid.tsx` | ~70 |

### 10. `components/money/goal-form.tsx` (488 → ~140 router)

| Extract | Target File | Lines |
|---------|-------------|-------|
| `GoalCreateEditDialog` | `goal-create-edit-dialog.tsx` | ~240 |
| `ContributeDialog` | `contribute-dialog.tsx` | ~110 |

### 11. `components/calendar/event-dialog.tsx` (513 → ~490)

Minimal change — single form dialog. Only extract:

| Extract | Target File | Lines |
|---------|-------------|-------|
| `getDefaults` helper + `COLOR_PRESET_KEYS` | keep in file | — |

**Decision: leave as-is.** The form is a cohesive unit; splitting fields would hurt readability.

### 12. `components/tasks/task-form.tsx` (406)

**Decision: leave as-is.** Single form component, no natural split points.

## Conventions

- **Directory structure**: flat (same directory), except `csv-import/` subdirectory
- **Naming**: kebab-case files, PascalCase components, hooks prefixed `use-`
- **Imports**: relative within same directory (`./`), absolute across directories (`@/`)
- **Exports**: named exports, no barrel files
- **Props interfaces**: not exported unless needed by parent
- **No behavioral changes**: all tests must continue to pass as-is

## Testing

- Run `pnpm test:run` — all existing tests must pass unchanged
- Run `pnpm lint` — no new lint errors
- Run `pnpm build` — production build succeeds
- Spot-check: extracted hooks/components maintain identical behavior

## Out of Scope

- Refactoring logic or fixing bugs within these components
- Adding new tests for extracted components (pure structural refactor)
- Changing any component's public API or props
- Modifying `components/ui/` (shadcn-managed)
