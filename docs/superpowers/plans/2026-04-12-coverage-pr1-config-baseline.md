# Coverage PR 1: Config Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up coverage report noise (exclude data/templates/re-exports) and remove stale CLAUDE.md note about `habit-logs.test.ts`. No new tests; no threshold change yet.

**Architecture:** Single-file config edit to `vitest.config.ts`, plus documentation fix to `CLAUDE.md`. Verify via `pnpm test:coverage` that overall numbers rise from exclusions alone.

**Tech Stack:** Vitest v8 coverage.

Spec: `docs/superpowers/specs/2026-04-12-coverage-improvement-design.md`.

---

### Task 1: Update vitest coverage exclusions

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Edit `vitest.config.ts` — extend the `coverage.exclude` array**

Replace the existing `exclude:` block with:

```ts
exclude: [
  'node_modules/',
  'tests/',
  '**/*.d.ts',
  '**/*.config.{js,ts,mjs}',
  '**/components/ui/**',
  '.next/',
  'coverage/',
  // data / templates / re-exports — no logic to test
  'i18n/messages/**',
  'lib/db/index.ts',
  'lib/constants.ts',
  '**/ndi-exercise-catalog.json',
  'emails/**',
  'app/**/layout.tsx',
  'app/**/loading.tsx',
  'app/**/error.tsx',
  'e2e/**',
],
```

Note: `middleware.ts` was in the spec but does not exist at repo root (removed). `lib/**/constants.ts` matches `lib/constants.ts` specifically (the only match).

- [ ] **Step 2: Run coverage and verify build passes**

Run: `pnpm test:coverage 2>&1 | tail -20`

Expected: `Test Files 310 passed (310)`, `Tests 3558 passed (3558)`, coverage threshold (50%) still passes, and the `All files` row shows higher stmts % than the baseline 73.13% (the exclusions remove zero-coverage noise).

Record the new `All files` numbers in the PR description.

### Task 2: Remove stale CLAUDE.md note

**Files:**
- Modify: `CLAUDE.md:127`

- [ ] **Step 1: Remove the stale bullet**

Delete this line from `CLAUDE.md` (under the `## Testing` section):

```
- **Known:** 2 pre-existing failures in `habit-logs.test.ts` (`times_per_week getDetailedHabitStats`) — issue #98
```

(Verified in the brainstorming session: `tests/lib/db/habit-logs.test.ts` now runs 30/30 passing.)

- [ ] **Step 2: Verify habit-logs still green**

Run: `pnpm test:run tests/lib/db/habit-logs.test.ts`

Expected: `Test Files 1 passed (1)`, `Tests 30 passed (30)`.

### Task 3: Lint + full test pass

- [ ] **Step 1: Run lint**

Run: `pnpm lint`

Expected: no errors. Fix anything reported before continuing.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test:run 2>&1 | tail -5`

Expected: `Test Files 310 passed (310)`, `Tests 3558 passed (3558)`.

### Task 4: Commit and open PR

- [ ] **Step 1: Stage and commit**

```bash
git add vitest.config.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
chore(tests): tighten coverage exclusions and drop stale CLAUDE.md note

Exclude data, translation JSON, thin Next.js wrappers, barrel re-exports,
and email JSX templates from coverage — they're either data or markup,
not logic worth asserting. Removes zero-coverage noise from the report.

Also drop the stale "2 pre-existing failures in habit-logs.test.ts" note
from CLAUDE.md — 30/30 in that file pass now.

Part of the coverage improvement effort:
docs/superpowers/specs/2026-04-12-coverage-improvement-design.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push branch**

Run: `git push -u origin test/coverage-improvement-spec`

Note: branch already has the spec commit; the coverage config change stacks on top.

- [ ] **Step 3: Open PR**

Run:
```bash
gh pr create --title "chore(tests): coverage config baseline" --body "$(cat <<'EOF'
## Summary
- Exclude data/templates/re-exports from coverage so the report reflects real source code
- Drop stale CLAUDE.md note about `habit-logs.test.ts` failures (all 30 pass now)
- Ships the coverage improvement spec as part of the same branch

## Coverage impact
Numbers expected to rise from exclusion of noise only — no new tests yet. Full plan at `docs/superpowers/specs/2026-04-12-coverage-improvement-design.md`.

## Test plan
- [ ] `pnpm test:run` passes (3558 tests)
- [ ] `pnpm test:coverage` passes threshold
- [ ] `pnpm lint` clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI green, request PR review via hook, merge**

Follow the memory rule: invoke `pr-review-toolkit:review-pr` and wait for all CI checks green before merging.
