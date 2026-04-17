# Mutation Testing Foundation

**Date:** 2026-04-17
**Status:** Approved, executing

## Context

PR #429 unblocked the Stryker sandbox; lib/db mutation score is now **65.64%** (was 52.84%, inflated by config bug). The baseline reveals systemic test weaknesses: ~1,186 survived mutants, mostly from permissive Supabase mocks that don't assert on `.from(table)` / `.eq(col, val)` arguments. This spec defines how to raise the bar to a sustained **85%+ mutation score across all critical `lib/` code**, with guard rails that prevent regression.

## Goal

Three-layer foundation:

1. **Documentation** — `docs/testing.md` as the canonical reference; short pointer in `CLAUDE.md` so every future test-writing session inherits the rules by default.
2. **Enforcement** — Stryker per-PR (changed files only, ~2-5 min) + scheduled full weekly run. Break threshold tightens phase-by-phase: 60 → 70 → 80 → 85.
3. **Evidence** — one file rewritten by hand as the canonical template before parallelizing.

## Scope

**In scope:** `lib/db/**`, later expanded to `lib/money/**`, `lib/recurring-tasks/**`, `lib/habits/**`.

**Out of scope:** React components, API route handlers, `lib/ai/tools` (already 96%+), one-off scripts.

## Testing patterns (codified in `docs/testing.md`)

Five prescriptive rules, each with example + rationale:

- **R1 — Use `expectQuery()` for DB calls.** Assert on `{table, method, args}` together. Catches table-swap bugs and column-name typos that positive stubs hide.
- **R2 — Test error paths explicitly.** `setMockResponse(null, new Error(...))` + `await expect(...).rejects.toThrow(...)`. Kills the `if (error)` → `if (false)` mutant.
- **R3 — Assert on `.order()` and `.range()` args.** Column name, ascending flag, offset, limit. Kills reversed-sort and off-by-one bugs.
- **R4 — Import pure functions, don't stub them.** Stubs hide behavior drift. Mock only real boundaries (network, time, DB client).
- **R5 — Specific values, not just shape.** For aggregations (`Math.max`, sum, count), assert concrete numbers, not `toBeGreaterThan(0)`.

Plus a short section on `// Stryker disable next-line` usage: only for documented-equivalent mutants; the comment must explain why the mutant is equivalent.

## Per-file target

**Hard 85% floor** on every file, with `// Stryker disable` comments used sparingly for documented equivalent mutants. Per-file gate means a regression in one file fails CI even if aggregate is above 85%.

## CI strategy

- **Per-PR**: `stryker run --since origin/main` — scopes `mutate` glob to changed files. Fast (<5 min), immediate regression signal.
- **Weekly (Mon 3am UTC)**: full `pnpm mutation-test` run. Catches cross-file regressions (e.g., a shared helper change that weakens tests elsewhere). Publishes HTML report as a GitHub Actions artifact.
- **On-demand**: manual `pnpm mutation-test` works as today.

## Phased execution

**Phase 1 — Patterns doc (1 PR, ~2 hrs)**
Write `docs/testing.md` with the five rules + Stryker-disable guidance. Update `CLAUDE.md` with a short pointer. No code changes.

**Phase 2a — Canonical example (1 PR, ~2 hrs)**
Rewrite `tests/lib/db/habit-graduations.test.ts` (8.11% → 85%+) by hand. This is the template.

**Phase 2b — Strengthen remaining weakest DB tests (4 PRs, parallel agents, ~12 hrs)**
One PR per file: `habits.ts` (38%), `habit-logs.ts` (45%), `workouts.ts` (49%), `journal-entries.ts` (51%). Agents follow the 2a template.

**Phase 3 — Medium-tier files (6-8 PRs, parallel agents, ~10 hrs)**
`households.ts` (55%), `habit-errors.ts` (56%), `insights.ts` (59%), `recurring-tasks.ts` (62%), `tasks.ts` (54%), `budgets.ts` (68%), `chat-memories.ts` (70%), `journal-entry-links.ts` (75%).

**Phase 4 — Lock in the bar (1 PR, ~1 hr)**
- Raise `stryker.config.mjs` `thresholds.break` to 85.
- Add `.github/workflows/mutation-testing.yml` with per-PR-changed-files job and weekly-full job.
- Add `pnpm mutation-test:changed` script (wraps `stryker run --since origin/main`).

**Phase 5 — Scope expansion (3 PRs, ~6 hrs)**
Add to Stryker `mutate` glob sequentially, one dir per PR:
1. `lib/money/**` (pure logic — arithmetic, projections, insights, csv-import/export). Expected high score (90%+) on first run since tests already exist.
2. `lib/recurring-tasks/**` (recurrence, instance-generator). Already near-90% coverage; instance-generator already at 97% mutation score on a narrow run.
3. `lib/habits/**` (format, graduation, streak).

Each scope expansion requires mutation threshold to hold at 85 aggregate across the new wider scope.

## Threshold progression

| After phase | `thresholds.break` |
|------|------|
| Current | 60 |
| Phase 2 complete | 70 |
| Phase 3 complete | 80 |
| Phase 4 complete | 85 |
| Phase 5 complete | 85 (wider scope) |

## Risks

- **Equivalent mutants creep**: reviewers need to flag unjustified `// Stryker disable` comments. Mitigation: `docs/testing.md` states the bar — "comment must explain why the mutant is semantically equivalent".
- **Per-PR Stryker slowness on changed files**: `--since` mode may be buggy or imprecise. Mitigation: budget for a Phase 4 retry if the initial CI integration is too slow; fall back to weekly-only if needed.
- **Agent-generated test churn**: parallel agents rewriting tests may introduce inconsistencies. Mitigation: the Phase 2a canonical example acts as a template; agents are explicitly told to mirror its structure.

## Success criteria

- `docs/testing.md` exists; `CLAUDE.md` references it.
- All files in `lib/db/**` score ≥85% mutation.
- Aggregate mutation score ≥85% across `lib/db/**`, `lib/money/**`, `lib/recurring-tasks/**`, `lib/habits/**`.
- CI fails a PR that drops any file's score below 85% (excluding documented equivalents).
- `stryker.config.mjs` `thresholds.break = 85`.
