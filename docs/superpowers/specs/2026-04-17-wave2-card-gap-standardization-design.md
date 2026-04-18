# Wave 2 — Card vs Raw Div + space-y → gap Standardization

**Date:** 2026-04-17
**Source task:** `[Wave 2] Refactor: Standardize Card vs raw div, remaining space-y → gap` (BeterR.me project, task `eadc181f-1106-4523-9d45-d61bb5cdb6cb`)

## Audit Findings

The task description anticipated three separate cleanup PRs. After auditing the current codebase (Wave 1 refactoring already merged, spacing tokens adopted in PRs #394–#399), the real scope is much smaller than the task suggested. This spec records what IS a fix and what is NOT, so we don't churn code that is already correct.

### 1. Card vs raw div — NO WORK NEEDED

The task's seed `grep` (`rounded-lg border.*bg-background`) returns zero matches outside `components/ui/`. Broader searches for raw card containers surface 130 matches, but every one falls into a category that is intentionally NOT shadcn `Card`:

- **Skeletons** (`rounded-card` placeholders during loading) — mimic card shape on purpose
- **Small accent boxes** (`bg-muted/50`, `bg-primary/5`, info banners, chips) — not cards
- **Kanban cards/columns** — use `bg-background` against a `bg-muted/30` column; shadcn Card's `bg-card` would make them blend in dark mode (`--background: 240 27% 14%` vs `--card: 240 25% 18%`)
- **Money surface cards** — use `bg-money-surface` + `border-money-border` from the Calm Finance palette

Converting any of these to `<Card>` changes visual design. No files are converted in this PR.

### 2. space-y → gap — Narrow scope (6 files)

Raw counts: 199 `space-y-*` instances across 98 files (down from the 308 the task description cited — earlier waves already converted many).

Most remaining `space-y-*` is legitimate:
- `CardHeader` overrides like `space-y-0` on top of flex rows
- Form field stacks (react-hook-form uses `space-y-2` between `FormItem`s; the task explicitly excludes forms)
- Pure block-content stacks where flex is not needed

The only clearly-wrong pattern is `flex flex-col … space-y-N` — if a container is already `flex flex-col`, `space-y` is redundant and should be `gap`. That pattern appears in exactly 6 places:

| File | Line | Current | Target |
|---|---|---|---|
| `components/dashboard/dashboard-content.tsx` | 282 | `flex flex-col items-center justify-center py-16 space-y-4` | `flex flex-col items-center justify-center py-16 gap-4` |
| `components/dashboard/dashboard-content.tsx` | 321 | `flex flex-col items-center justify-center py-16 space-y-6` | `flex flex-col items-center justify-center py-16 gap-6` |
| `components/tasks/tasks-page-content.tsx` | 242 | `flex flex-col items-center justify-center py-16 space-y-4` | `flex flex-col items-center justify-center py-16 gap-4` |
| `components/habits/habits-page-content.tsx` | 107 | `flex flex-col items-center justify-center py-16 space-y-4` | `flex flex-col items-center justify-center py-16 gap-4` |
| `components/money/csv-import/csv-result-step.tsx` | 24 | `flex flex-col items-center space-y-4 py-8` | `flex flex-col items-center gap-4 py-8` |
| `components/profile-avatar.tsx` | 56 | `flex flex-col space-y-1` | `flex flex-col gap-1` |

Visually identical in all cases (children are simple block elements, no absolute/float children).

### 3. Raw button/input — NO WORK NEEDED

15 raw `<button>` tags and 2 raw `<input>` tags exist in kanban/journal/calendar/money — but each is intentional:

- **Radio-like selectors** (mood picker, link selector) — use `role="radio"` with custom scale/ring transforms that shadcn `Button` doesn't ship
- **Calendar event blocks** — absolutely-positioned, inline-styled, domain-colored; shadcn `Button` adds conflicting padding/border/radius
- **Popover/dropdown triggers** — use `asChild` + clean inline look; `Button` adds visible chrome
- **CSV file input** — `<input type="file">`; shadcn has no equivalent
- **Event quick-create time input** — intentionally minimal inline input

Converting these would degrade UX. No files are converted in this PR.

## Scope of this PR

**One PR, one commit.** Replace `space-y-*` with `gap-*` in the 6 flex-column containers listed above. No other changes.

## Verification

- `pnpm lint` clean
- `pnpm test:run` green
- Visual check: dashboard/tasks/habits empty states, CSV import success view, profile dropdown label block — spacing unchanged

## Why not a more aggressive sweep?

The Wave 2 task anticipated three domains of work. Today's codebase has already absorbed two of them implicitly (token adoption) and has no real inconsistency in the third (cards). Converting healthy `space-y-*` in forms or plain stacks to `flex gap-*` is cosmetic churn that risks regressions (margin-collapse vs flex-gap behave differently around absolute/sticky children, floated media, or RHF error slots). The 6 cases in this PR are the only ones where the file *itself* is already using flex; switching them to `gap` is a pure consistency fix inside that file.

The parent task will be closed after this PR merges. Any follow-up would be opened as a focused issue ("form field spacing uses space-y-N, adopt field-gap token instead") rather than a blanket sweep.
