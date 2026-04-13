# Mutation Testing with Stryker

**Status:** Infrastructure in place — not yet wired into CI.
**Date:** 2026-04-12
**Scope (initial):** `lib/db/**/*.ts`

## What is mutation testing?

Mutation testing evaluates **test suite quality** by introducing small, deliberate changes ("mutants") into the source code (e.g., flipping `>` to `>=`, replacing `true` with `false`, removing a conditional) and re-running the test suite against each mutated copy. A good test suite should **kill** the mutant — at least one test fails. A mutant that **survives** indicates a gap: the code path or condition is not actually being asserted on by any test, even if line coverage says it is.

Stryker reports a **mutation score** — the percentage of mutants killed. It's a much stronger signal of test effectiveness than line/branch coverage alone.

## How to run

```bash
pnpm mutation-test
```

Reports land at:

- **HTML (interactive):** `reports/mutation/mutation.html` — open in a browser; lets you click each surviving mutant and see the unmodified/mutated diff.
- **CLI:** `clear-text` + `progress` reporters print a summary and per-file score to the terminal.

Both `reports/` and `.stryker-tmp/` are git-ignored.

## Current scope & rationale

We target `lib/db/**/*.ts` only (excluding `index.ts` and `types.ts`) because:

1. **Heaviest-tested area.** We recently added comprehensive unit tests for the DB layer — mutation testing there gives the highest signal-to-noise ratio.
2. **Pure-ish logic.** DB classes are thin query builders with mockable Supabase clients — fast to mutate, fewer flaky integration edge cases.
3. **Bounded runtime.** A narrow scope keeps first-run feedback to ~10–30 min. Expanding scope to the whole repo would push runtime into multi-hour territory.

Config lives in `stryker.config.mjs` at the repo root.

### Thresholds

```js
thresholds: { high: 85, low: 70, break: 60 }
```

- `>=85%`: green (high).
- `70–84%`: yellow (acceptable starting bar).
- `60–69%`: orange (warning).
- `<60%`: fail the run.

These are a **starting bar**, expected to rise as weak tests are tightened.

## Expected runtime

**10–30 minutes** on a developer machine for the `lib/db/**` scope with `concurrency: 4` and `coverageAnalysis: "perTest"` (runs only the tests relevant to each mutant). First run may be slower due to TypeScript checker warmup.

## CI recommendation (NOT yet wired in)

Mutation testing is **too slow** to run on every PR. Recommended: run **weekly on a schedule**, and allow on-demand dispatch. Sample `.github/workflows/mutation-test.yml`:

```yaml
name: Mutation Test

on:
  schedule:
    - cron: "0 3 * * 1" # Mondays at 03:00 UTC
  workflow_dispatch:

jobs:
  mutation:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.11
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm mutation-test
      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
          retention-days: 30
```

Do **not** add this to `ci.yml` or any blocking required-check workflow.

## Workflow for surfaced gaps

1. Run `pnpm mutation-test`.
2. Open `reports/mutation/mutation.html`.
3. Filter by **Survived** mutants.
4. For each, add a test assertion that kills the mutant (or verify the mutated behavior is genuinely untestable / equivalent).
5. Never "chase 100%" — equivalent mutants exist. Aim for high score + thoughtful review.

## Gotchas discovered during setup

1. **pnpm isolated layout breaks plugin auto-discovery.** Stryker's default `@stryker-mutator/*` plugin glob doesn't see packages in pnpm's nested `node_modules/.pnpm/` store. Plugins must be listed explicitly in `stryker.config.mjs` under `plugins:`.
2. **`.claude/` symlinks crash the sandbox copy.** Stryker copies the project into `.stryker-tmp/` before mutating; symlinked skill directories under `.claude/skills/` produced `EISDIR` errors. Fixed via `ignorePatterns` (also excludes `.next/`, `coverage/`, `playwright-report/`, `e2e/`, `docs/`, `public/`, `supabase/`, `emails/`, `.worktrees/`).
3. **`typescript-checker` disabled by default.** Enabling it runs the full project `tsc` against every mutant, which surfaces unrelated pre-existing type errors in test files elsewhere in the repo (e.g., `tests/components/calendar/*.tsx`). Kept off until a narrowed tsconfig for `lib/db` is introduced — see commented-out block in `stryker.config.mjs`.
4. **`testFiles` scoping.** We restrict the initial test run to `tests/lib/db/**/*.test.ts` — running the full 2000+-test suite copied all of `app/` into the sandbox and tripped over `@/lib/supabase/server` resolution in a sidebar route test. Scoping keeps startup under 30s and matches the mutation scope.

## Recommended first-run command

After merging this infrastructure PR:

```bash
pnpm mutation-test 2>&1 | tee reports/mutation/first-run.log
```

Open `reports/mutation/mutation.html` and review **Survived** mutants per file.

## Files

- `stryker.config.mjs` — Stryker config.
- `package.json` — `mutation-test` script.
- `.gitignore` — excludes `reports/` and `.stryker-tmp/`.
