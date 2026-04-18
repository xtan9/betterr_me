# Wave 3 — Shared UI Patterns Design

**Date:** 2026-04-18
**Source task:** [Wave 3] Refactor: Extract shared UI patterns (EmptyState, PageHeader) — `cd803683-37d5-4f7d-aad4-4bbd8f974f56`

## Audit findings vs task description

The original task description is partly stale. Independent audit findings:

| Item in task description | Reality |
|---|---|
| "Create shared PageHeader" | **Already exists** at `components/layouts/page-header.tsx`, adopted in 10+ files (tasks, habits, workouts, journal, money pages). No work needed. |
| "Empty state pattern repeated in 7+ files with no shared component" | Only **2 files are genuine twins** — `components/tasks/task-empty-state.tsx` + `components/habits/habit-empty-state.tsx`. Other "empty state" files have trivially different shapes or unique chrome and should not be force-fit. |
| "Card header with actions repeated 5+ times in dashboard" | Only **2 files** have the pattern: `dashboard/tasks-today.tsx` + `dashboard/habit-checklist.tsx`. Overstated but still worth extracting. |
| "Loading skeleton grids (489 skeleton usages) — could use 3-4 reusable templates" | Audit needed. Most usages are layout-specific. Extract only if ≥3 sites share a concrete pattern. |

## Scope

Three narrow, independently reviewable PRs.

### PR 1 — Shared `EmptyState` primitive

**New file:** `components/shared/empty-state.tsx`

```ts
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColorClass?: string;     // default: "text-muted-foreground"
  iconBgClass?: string;         // default: "bg-muted"
  variant?: "default" | "celebration";  // celebration adds gradient card bg
  action?: React.ReactNode;
  className?: string;
}
```

**Render shape** (extracted from current `task-empty-state.tsx` / `habit-empty-state.tsx`):

- Outer div: `flex flex-col items-center justify-center text-center py-12 px-4`, `data-testid="empty-state"`
- Celebration variant adds: `bg-gradient-to-b from-empty-state-celebration-bg/50 to-transparent rounded-card`
- Icon wrapper: `flex items-center justify-center size-16 rounded-pill mb-4` + iconBgClass
- Icon: `size-8` + iconColorClass
- Title: `<h3 className="text-section-heading text-foreground mb-2">`
- Description: `<p className="text-body text-muted-foreground max-w-xs">`
- Optional action wrapper: `mt-6`

**Migrated:**
- `components/tasks/task-empty-state.tsx` — keeps its `VARIANT_CONFIG` + `ICON_BG_CLASS` maps, delegates visual structure to `EmptyState`.
- `components/habits/habit-empty-state.tsx` — same pattern. `no_results` variant interpolation (`t(key, { query })`) stays in the wrapper.

**Intentionally NOT migrated:**
- `components/chat/chat-empty-state.tsx` (15 lines, one-liner greeting, no icon/CTA — no shared structure)
- `components/money/accounts-empty-state.tsx` (bordered card chrome with money-specific colors + Plaid + manual-entry dual-action footer — unique shape)

### PR 2 — Shared `CardHeaderWithActions` primitive

**New file:** `components/shared/card-header-with-actions.tsx`

```ts
interface CardHeaderWithActionsProps {
  title: string;
  href?: string;              // when set, wraps title in Link with hover-chevron
  actions?: React.ReactNode;
  className?: string;
}
```

**Render shape** (extracted from `tasks-today.tsx:264-278` / `habit-checklist.tsx:45-59`):

- Wrap `<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">`
- If `href`: Link with `group flex items-center gap-1` + `<h2 className="font-display text-section-heading">{title}</h2>` + hover-chevron
- Else: plain h2
- Actions slot on the right

**Migrated:**
- `components/dashboard/tasks-today.tsx:264-278`
- `components/dashboard/habit-checklist.tsx:45-59`

### PR 3 — Skeleton audit + closeout

**Approach:**
1. Grep for recurring skeleton compositions (e.g. `Card` → `h-4 w-24` title → `h-6 w-full` body).
2. If ≥3 sites share a concrete composition, extract `components/shared/card-skeleton.tsx` (or similar) with clear props.
3. If no real duplication found, close the task with a note in the PR body documenting the audit.
4. Mark source task `cd803683-...` done after merge.

## Constraints

- **No visual change** — tokens and classnames identical to pre-refactor.
- **Public API of wrapper components unchanged** — callers of `TaskEmptyState` / `HabitEmptyState` / dashboard widgets don't change.
- **Existing tests continue to pass** — habit-empty-state has tests relying on `data-testid="empty-state"` and variant icon rendering; both preserved.
- **Coverage:** add tests for new shared components (render + variant + axe).

## Success criteria

- PR 1 merged: `EmptyState` exists, 2 twin files delegate to it, existing tests still green.
- PR 2 merged: `CardHeaderWithActions` exists, 2 dashboard widgets use it, existing behavior unchanged.
- PR 3 merged: either a shared skeleton template exists with ≥3 consumers, OR audit-only PR with closeout notes.
- Source task `cd803683-...` moved to done.

## Out of scope

- Refactoring `chat-empty-state.tsx` or `accounts-empty-state.tsx` (genuinely different shapes).
- Tokenization work (completed in Wave 2).
- Component-splitting work (orthogonal, tracked separately).
