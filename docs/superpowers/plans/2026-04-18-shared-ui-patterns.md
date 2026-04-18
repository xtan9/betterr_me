# Wave 3 — Shared UI Patterns Implementation Plan

> **For agentic workers:** follow the task-by-task sequence; each task ends in a commit. Steps use checkbox syntax for tracking.

**Goal:** Extract the two most duplicated UI patterns (empty state, card header with actions) into shared primitives under `components/shared/`, then assess skeleton duplication.

**Architecture:** Shared primitives expose a narrow, prop-driven API; existing domain wrappers keep their translation/variant logic and delegate layout to the shared primitive.

**Tech Stack:** Next.js 16, React, Tailwind CSS 3, next-intl, Vitest + Testing Library + vitest-axe.

---

## Task 1: Shared EmptyState + migrate twin wrappers (PR 1)

**Files:**
- Create: `components/shared/empty-state.tsx`
- Create: `tests/components/shared/empty-state.test.tsx`
- Modify: `components/tasks/task-empty-state.tsx`
- Modify: `components/habits/habit-empty-state.tsx`
- Add: spec + plan docs (this file) to the PR

**Branch:** `refactor/shared-empty-state`

- [ ] Write `components/shared/empty-state.tsx` with `EmptyStateProps` and the render shape from the spec
- [ ] Write `tests/components/shared/empty-state.test.tsx` covering: default variant render, celebration variant gradient bg, custom icon/bg classes, action slot, axe violations
- [ ] Update `components/tasks/task-empty-state.tsx` to delegate visual shell to `EmptyState`; keep `VARIANT_CONFIG`, `ICON_BG_CLASS`, translation calls, and CTA logic in the wrapper
- [ ] Update `components/habits/habit-empty-state.tsx` the same way; keep `searchQuery` interpolation for `no_results`
- [ ] Run `pnpm lint` + `pnpm test:run` (via CI — local blocked per known env issue)
- [ ] Commit: `refactor(shared): extract EmptyState primitive (Wave 3 PR 1/3)`
- [ ] Push, open PR, run review toolkit, fix, re-review until clean, merge

## Task 2: Shared CardHeaderWithActions + migrate dashboard widgets (PR 2)

**Files:**
- Create: `components/shared/card-header-with-actions.tsx`
- Create: `tests/components/shared/card-header-with-actions.test.tsx`
- Modify: `components/dashboard/tasks-today.tsx:264-278`
- Modify: `components/dashboard/habit-checklist.tsx:45-59`

**Branch:** `refactor/shared-card-header`

- [ ] Write `components/shared/card-header-with-actions.tsx` wrapping `CardHeader` (shadcn) with optional Link+chevron title + actions slot
- [ ] Write tests: plain title render, linked title with chevron, actions slot, axe violations
- [ ] Update `tasks-today.tsx` CardHeader block to use the shared component; preserve `href="/tasks"` + Add Task button
- [ ] Update `habit-checklist.tsx` the same way; preserve `href="/habits"` + Add Habit button
- [ ] Commit: `refactor(shared): extract CardHeaderWithActions (Wave 3 PR 2/3)`
- [ ] Push, open PR, review, fix, re-review, merge

## Task 3: Skeleton audit + closeout (PR 3)

**Branch:** `refactor/skeleton-audit`

- [ ] Grep existing skeleton compositions; tally patterns that repeat across ≥3 files
- [ ] If a pattern qualifies: create `components/shared/<name>-skeleton.tsx`, tests, migrate sites. Otherwise: PR is audit-only with findings in the body
- [ ] Update Wave 3 source task `cd803683-37d5-4f7d-aad4-4bbd8f974f56` to done after merge
- [ ] Commit: either `refactor(shared): extract <name>Skeleton (Wave 3 PR 3/3)` or `docs: close out Wave 3 skeleton audit`

## Review protocol (applied to every PR)

1. Push branch, open PR via `gh pr create`
2. Wait for CI to post checks; address failures
3. Run pr-review-toolkit review (code-reviewer agent)
4. Fix all critical + important issues
5. Re-review; repeat until no issues remain
6. Merge via `gh pr merge --squash`

## Success criteria

- All three PRs merged to main with green CI
- Source task marked done
- Zero visual regressions (enforced by test suite + manual spot check on dashboard + tasks/habits pages)
