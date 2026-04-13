# Codebase Coverage Improvement

**Status:** Approved (brainstorming), pending implementation plan
**Date:** 2026-04-12
**Owner:** Claude + Xingdi

## Problem

Overall test coverage sits at **73.13% stmts / 64.75% branches / 69.56% funcs / 75.71% lines**. The `vitest.config.ts` threshold is 50% — easily met, but masks large zero-coverage regions:

- **10+ DB classes with 0% coverage** (concentrated in the money domain): `budgets.ts`, `transactions.ts`, `savings-goals.ts`, `recurring-bills.ts`, `merchant-rules.ts`, `bank-connections.ts`, `manual-assets.ts`, `net-worth-snapshots.ts`, `transaction-splits.ts`, `accounts-money.ts`, plus `categories.ts`, `categories-db.ts`, `exercises.ts`, `routines.ts`, `workout-exercises.ts`, `households.ts` (17%).
- **Components with <10% coverage:** `project-card.tsx` (2.9%), `exercise-list.tsx` (8.3%), several csv-import dialog steps (0%), projects dialogs (0%), journal toolbar (0%).
- **Coverage noise:** `i18n/messages/*.json`, barrel re-exports, and bundled catalog JSON reported as 0% but are data, not code.
- **Stale CLAUDE.md:** claims 2 pre-existing failing tests in `habit-logs.test.ts` (issue #98). They currently pass (30/30).

## Goals

1. No source file with 0% coverage (after sensible exclusions).
2. Overall stmts ≥ 90%, branches ≥ 85%, functions ≥ 85%, lines ≥ 90%.
3. Raise `vitest.config.ts` thresholds to match, locking progress in so regressions fail CI.
4. Remove stale CLAUDE.md note.
5. Every new test asserts behavior — a test that would still pass after deleting the tested function's body is unacceptable.

## Non-goals

- 100% coverage everywhere. JSX-only templates, re-exports, and data files are excluded from the denominator rather than tested for show.
- E2E / Playwright coverage, performance testing, visual regression, mutation testing.

## Coverage Config Changes

Add these entries to `vitest.config.ts` `coverage.exclude`:

```ts
'i18n/messages/**',             // translation JSON — data, not logic
'lib/db/index.ts',              // barrel re-exports
'lib/**/constants.ts',          // type/constant-only files
'**/ndi-exercise-catalog.json', // bundled catalog data
'emails/**',                    // JSX-only email templates
'app/**/layout.tsx',            // thin Next.js layout wrappers
'app/**/loading.tsx',           // skeleton JSX
'app/**/error.tsx',             // error boundary JSX
'middleware.ts',                // proxy to lib/supabase/proxy.ts, tested there
'e2e/**',                       // Playwright
```

Final thresholds (applied in last PR only):
```ts
thresholds: { lines: 90, statements: 90, functions: 85, branches: 85 }
```

## Approach: Hybrid Decomposition (8 PRs)

Work lands as eight reviewable PRs (~300–800 LoC each), in this order:

| # | PR | Scope | Size |
|---|----|-------|------|
| 1 | `chore(tests): coverage config baseline` | Update `vitest.config.ts` exclusions; update CLAUDE.md (remove stale habit-logs note). | S |
| 2 | `test(db/money-core): transactions, accounts, budgets` | Unit tests for `transactions.ts`, `accounts-money.ts`, `budgets.ts`. | L |
| 3 | `test(db/money-aux)` | `recurring-bills.ts`, `savings-goals.ts`, `manual-assets.ts`, `net-worth-snapshots.ts`, `transaction-splits.ts`, `merchant-rules.ts`, `bank-connections.ts`. | L |
| 4 | `test(db/misc)` | `categories.ts`, `categories-db.ts`, `exercises.ts`, `routines.ts`, `workout-exercises.ts`, `households.ts`. | M |
| 5 | `test(components/money)` | `project-card.tsx`, csv-import dialog + steps, `filter-bar.tsx`, goals/net-worth/accounts components. | L |
| 6 | `test(components/fitness + projects)` | `exercise-list.tsx`, `routine-form.tsx`, projects color-picker / create-dialog / modal, `journal-toolbar.tsx`. | M |
| 7 | `test(components/chat + habits + calendar gaps)` | Raise `chat-input.tsx`, `message-list.tsx`, `habit-list.tsx`, `event-dialog.tsx`, `time-grid.tsx` to ≥90%. | M |
| 8 | `chore(tests): raise coverage thresholds` | Bump `vitest.config.ts` thresholds to 90/85/85/90. | XS |

Sequencing rules:
- PRs 2–4 (DB) land before 5–7 (components); component tests re-use DB-class mocking patterns.
- PR 8 lands only after measuring; if short, triage gaps first.
- Each PR is green on CI (all tests pass, lint clean) before the next opens.

## Testing Patterns

### DB classes (`lib/db/*.ts`)

Follow `tests/lib/db/habits.test.ts` / `habit-logs.test.ts`:

- `mockSupabaseClient.setMockResponse([data])` from `tests/setup.ts`.
- Instantiate the DB class with the mock client.
- Cover per public method: happy path, input-validation errors, Supabase error passthrough, edge cases (empty results, date boundaries, optional params).
- Target ≥ 90% stmts per file. Private helpers covered transitively.

### Components

Follow `tests/components/habits/`, `tests/components/chat/`:

- Render with Testing Library + `NextIntlClientProvider` (real translations).
- Mock SWR via `vi.mock('swr', ...)`.
- Cover: renders with default props, user interactions (clicks, forms, keyboard), loading / empty / error states, `axe` accessibility check.
- Prefer `getByRole` / accessible queries over `getByTestId` / CSS selectors — avoid pinning markup.
- Target ≥ 85% per file. Keyboard-only branches may remain uncovered.

### API routes (selective)

Only for routes currently below 90% (`app/api/*/route.ts` at 52% and 59%). Follow `tests/app/api/habits/route.test.ts`: `vi.hoisted` + mocked DB classes. Cover auth 401, Zod 400, success 200/201, DB error 500.

### Quality bar

Every new test must make an assertion that would fail if the tested function's body were deleted or returned `undefined`. No "it renders without crashing" tests.

## Risks

1. **Mock drift.** DB tests mock Supabase; tests pass while real queries break. Mitigation: existing API route tests + Playwright E2E catch integration issues.
2. **Pinning implementation details.** Component tests coupled to markup break during refactors. Mitigation: use accessible queries.
3. **Threshold lockstep.** Future PRs that drop coverage will fail CI. Intentional — land PR 8 only when the team is ready to maintain the bar.
4. **Test runtime.** Suite is ~30s now; adding ~2000 tests could push past 60s. Acceptable up to ~90s; beyond that, shard DB tests.
5. **`chat-input.tsx` lines 205–238** — likely speech / paste handlers needing `vi.stubGlobal`. Flag in PR 7 if blocked.

## Per-PR workflow

For every PR:
1. Create feature branch from `main`.
2. Write tests; run `pnpm test:run` and `pnpm test:coverage` locally.
3. Run `pnpm lint` and fix errors.
4. Commit, push, open PR, wait for all CI checks green, invoke `pr-review-toolkit:review-pr` hook.
5. Address review, merge, delete branch.
6. Start next PR.

## Open questions (non-blocking)

- If a DB class turns out to be dead code (zero callers), delete it instead of testing; call out in the PR.
- If a component exceeds ~400 lines and is gnarly to test, split-then-test (following commit `b592f23`).
