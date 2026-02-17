---
phase: 09-test-stabilization-baseline-regeneration
plan: 02
subsystem: testing
tags: [playwright, visual-regression, e2e, locale, i18n, baselines, screenshots]

# Dependency graph
requires:
  - phase: 09-test-stabilization-baseline-regeneration
    plan: 01
    provides: "Clean test suite with updated E2E selectors for sidebar navigation"
  - phase: 08-design-polish
    provides: "Final post-redesign sidebar layout, dark mode desaturation, hover polish"
provides:
  - "6 regenerated visual regression baselines for the post-redesign sidebar layout"
  - "Locale verification E2E test confirming en, zh, zh-TW sidebar nav text"
  - "Task-detail E2E selectors fixed for breadcrumb layout"
  - "Full test suite green: 92 chromium E2E + 961 Vitest unit tests"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getByRole('heading') for assertions on text that also appears in breadcrumbs"
    - "getByLabel('breadcrumb').getByRole('link') for scoping breadcrumb link clicks"
    - "Locale cookie injection via page.context().addCookies() for i18n E2E testing"

key-files:
  created:
    - e2e/locale-verification.spec.ts
  modified:
    - e2e/visual-regression.spec.ts-snapshots/
    - e2e/task-detail.spec.ts

key-decisions:
  - "6 baselines (not 18): visual-regression project uses single chromium viewport; 12 stale mobile baselines from pre-project-split era removed"
  - "Task-detail selectors use getByRole('heading') to avoid strict mode violations from breadcrumb + h1 duplicate text"
  - "Back button test replaced with breadcrumb navigation test (Back button removed in Phase 06-03)"
  - "Breadcrumb link click scoped via getByLabel('breadcrumb') to disambiguate from sidebar nav links"

patterns-established:
  - "Locale E2E testing: set cookie before navigation, verify first 2 nav labels as smoke test"
  - "Breadcrumb-scoped locators: page.getByLabel('breadcrumb').getByRole('link') avoids sidebar conflicts"

requirements-completed: [TEST-03, TEST-05, TEST-06]

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 09 Plan 02: Visual Regression Baseline Regeneration Summary

**Regenerated 6 visual regression baselines, added locale verification E2E test, and fixed task-detail selectors for breadcrumb layout -- full test suite green**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T21:31:57Z
- **Completed:** 2026-02-17T21:39:11Z
- **Tasks:** 2
- **Files modified:** 3 (+ 6 baseline PNGs regenerated, 12 stale PNGs deleted)

## Accomplishments
- Regenerated 6 visual regression baselines reflecting the final post-Phase-8 sidebar design (light + dark mode)
- Created locale-verification.spec.ts confirming en, zh, zh-TW sidebar text renders correctly
- Fixed 7 broken task-detail.spec.ts tests caused by breadcrumb migration (stale selectors)
- All 92 chromium E2E tests pass, all 961 Vitest unit tests pass, lint clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Regenerate visual regression baselines** - `1b92f06` (chore)
2. **Task 2: Add locale verification E2E test and run full suite** - `6a6da93` (feat)

## Files Created/Modified
- `e2e/visual-regression.spec.ts-snapshots/` - 6 chromium baselines regenerated, 12 stale mobile baselines deleted
- `e2e/locale-verification.spec.ts` - New E2E test verifying sidebar nav labels for 3 locales
- `e2e/task-detail.spec.ts` - Updated selectors: getByRole('heading') and breadcrumb navigation

## Decisions Made
- Visual-regression project generates 6 baselines (not 18 as planned): the Playwright config hardcodes `chromium` in the snapshot path template for the visual-regression project. The 12 mobile-chrome and mobile-small baselines were stale artifacts from before the project split and were removed.
- Task-detail selectors updated to use `getByRole('heading', { name })` instead of `getByText()` to avoid Playwright strict mode violations caused by the same text appearing in both breadcrumb and page heading.
- "Navigate back" test updated from clicking a Back button (removed in Phase 06-03) to clicking the Tasks breadcrumb link, scoped via `page.getByLabel('breadcrumb')` to avoid ambiguity with sidebar nav links.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 7 broken task-detail.spec.ts selectors**
- **Found during:** Task 2 (full E2E suite run)
- **Issue:** `page.getByText(SEED_TASK_TITLE)` resolved to 2 elements (breadcrumb + h1) causing strict mode violations in 6 tests. Additionally, the "navigate back" test clicked a Back button that no longer exists (replaced by breadcrumbs in Phase 06-03).
- **Fix:** Changed all `getByText(SEED_TASK_TITLE)` to `getByRole('heading', { name: SEED_TASK_TITLE })`. Replaced Back button click with breadcrumb link click scoped to `getByLabel('breadcrumb')`.
- **Files modified:** e2e/task-detail.spec.ts
- **Verification:** All 10 task-detail tests pass, full 92-test chromium suite green
- **Committed in:** 6a6da93 (Task 2 commit)

**2. [Plan Correction] Baseline count is 6, not 18**
- **Found during:** Task 1 (baseline regeneration)
- **Issue:** Plan expected 18 baselines (6 tests x 3 viewport variants). The Playwright config's visual-regression project only uses Desktop Chrome with a hardcoded `chromium` suffix in the snapshot path template.
- **Fix:** Regenerated 6 baselines (the correct count). Removed 12 stale mobile-chrome and mobile-small baselines that were artifacts from before the visual-regression project was split out.
- **Files modified:** e2e/visual-regression.spec.ts-snapshots/
- **Verification:** All 6 visual regression tests pass clean with 0 diff
- **Committed in:** 1b92f06 (Task 1 commit)

---

**Total deviations:** 2 (1 auto-fixed bug, 1 plan correction)
**Impact on plan:** Auto-fix was necessary to achieve the "full E2E suite passes" success criterion. Plan correction reflects accurate Playwright config behavior.

## Issues Encountered
- Pre-existing unhandled rejection in update-password-form.test.tsx (`window is not defined` in React 19 jsdom) -- not related to this plan's changes, does not affect test results (all 961 tests pass).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All test suites green: 92 chromium E2E + 961 Vitest unit tests
- Visual regression baselines fresh for the final post-redesign layout
- Locale verification confirms all 3 locales render correctly
- Phase 9 (final phase) is now complete -- entire 9-phase UI redesign project finished

## Self-Check: PASSED

- e2e/locale-verification.spec.ts: FOUND
- e2e/task-detail.spec.ts: FOUND
- e2e/visual-regression.spec.ts-snapshots/: FOUND (6 PNGs)
- Commit 1b92f06: FOUND
- Commit 6a6da93: FOUND

---
*Phase: 09-test-stabilization-baseline-regeneration*
*Completed: 2026-02-17*
