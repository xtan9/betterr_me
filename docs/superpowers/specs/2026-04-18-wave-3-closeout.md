# Wave 3 — Skeleton Audit & Closeout

**Date:** 2026-04-18
**Source task:** `cd803683-37d5-4f7d-aad4-4bbd8f974f56` — [Wave 3] Refactor: Extract shared UI patterns

This document closes out Wave 3 with the skeleton audit conclusion.

## Recap: what Wave 3 actually shipped

| PR | Shared primitive | Migrations | Notes |
|---|---|---|---|
| #457 | `components/shared/empty-state.tsx` | `task-empty-state`, `habit-empty-state` | Twin files collapsed into one shell |
| #458 | `components/shared/card-header-with-actions.tsx` | `dashboard/tasks-today`, `dashboard/habit-checklist` | Twin card headers collapsed |
| **This (closeout)** | none — audit only | — | Skeleton duplication below extraction threshold |

The planned skeleton-extraction PR is being closed out as audit-only per the Wave 3 design spec ([2026-04-18-shared-ui-patterns-design.md](./2026-04-18-shared-ui-patterns-design.md#pr-3--skeleton-audit--closeout)), which required ≥3 concrete duplicates before extracting.

## Skeleton file inventory

Six skeleton files in the real repo (worktree copies excluded):

| File | Role | Unique? |
|---|---|---|
| `components/layouts/page-header.tsx` (exports `PageHeaderSkeleton`) | Page-title + subtitle + actions placeholder | Already shared — 6 consumers |
| `components/tasks/task-detail-skeleton.tsx` | Task detail shell | Shares shell with `habit-detail-skeleton` |
| `components/habits/habit-detail-skeleton.tsx` | Habit detail shell | Shares shell with `task-detail-skeleton` |
| `components/tasks/tasks-page-skeleton.tsx` | List-page grid | Unique shape |
| `components/dashboard/dashboard-skeleton.tsx` | Dashboard grid with widget placeholders | Unique shape |
| `components/kanban/kanban-skeleton.tsx` | 4-column kanban with card placeholders | Domain-specific |
| `components/journal/journal-editor-skeleton.tsx` | Toolbar + editor area | Domain-specific |

## Candidate patterns considered

### 1. "Detail-page skeleton shell" (2 sites — BELOW threshold)

`task-detail-skeleton.tsx` and `habit-detail-skeleton.tsx` share an identical opening block:

```tsx
<div className="flex flex-col gap-section-gap" data-testid="...">
  <div>
    <Skeleton className="h-4 w-N mb-2" />  {/* breadcrumb */}
    <PageHeaderSkeleton hasActions />
  </div>
  <Card className="max-w-3xl">
    <CardContent className="space-y-6 pt-card-padding">
      <div>
        <Skeleton className="h-5 w-48 mb-2" />        {/* title */}
        <Skeleton className="h-4 w-full max-w-md" />  {/* description */}
      </div>
      {/* ... divergent content ... */}
    </CardContent>
  </Card>
</div>
```

Then the files diverge: task-detail has a 2x2 grid of `h-20 rounded-card` metric cards; habit-detail has a 2x1 grid of `h-32` streak cards + a stats row section + a 35-cell heatmap grid.

**Extraction would save** ~12 lines of duplicated shell across 2 files. A `DetailPageSkeleton` component would need to accept divergent children, which reduces the visual compression benefit. Only 2 consumers means every change to the shared component is a full "grep and update" anyway.

**Decision:** do not extract. Meets our 2-site floor neither materially nor against the spec's ≥3 threshold.

### 2. "Card grid with `h-N rounded-card` tiles" (2 sites)

`tasks-page-skeleton` uses `grid gap-card-gap md:grid-cols-2 lg:grid-cols-3` with six `h-40 rounded-card` skeletons. `dashboard-skeleton` uses three `h-28 rounded-card` skeletons inside a different grid. Different counts, heights, grid definitions — not a shared pattern, just a family resemblance.

### 3. "Breadcrumb skeleton" (2 sites)

`<Skeleton className="h-4 w-N mb-2" />` before a `PageHeaderSkeleton` in both detail skeletons. 1-line duplication — not worth abstracting.

## Conclusion

Wave 3's real cross-domain skeleton primitive (`PageHeaderSkeleton`) was already extracted before this wave started and is in broad use. Remaining duplication is at 2 sites each, below the extraction threshold. Further consolidation would add indirection without compression gains.

Wave 3 is complete. Source task `cd803683-37d5-4f7d-aad4-4bbd8f974f56` will be marked done after this PR merges.

## Follow-ups (out of scope)

- `PageHeaderSkeleton` has `hasActions` and `hasSubtitle` boolean props — if a third detail-page skeleton gets added with the same shell shape, revisit "DetailPageSkeleton" extraction at that time.
- `.gitignore` / vitest / eslint config cleanup for `.claude/worktrees/**` (carried over from earlier Wave 2 notes) remains open.
