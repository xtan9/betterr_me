---
phase: 08-visual-polish
plan: 01
subsystem: ui
tags: [tailwind, css-tokens, dark-mode, design-system, emerald, primary]

# Dependency graph
requires:
  - phase: 01-design-tokens
    provides: "CSS custom property token system (--primary, --ring, --sidebar-primary, etc.)"
  - phase: 01-design-tokens
    provides: "Tailwind config mapping tokens to bg-primary, text-primary utilities"
provides:
  - "Desaturated dark mode accent (160 45% 55% vs light 157 63% 45%)"
  - "Zero hardcoded emerald/teal classes in component files -- all use design tokens"
  - "Universal dark mode accent desaturation across entire UI"
affects: [08-visual-polish, 09-test-stabilization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bg-primary/text-primary token usage instead of hardcoded emerald/teal Tailwind classes"
    - "bg-primary/90 for hover states (opacity modifier instead of shade stepping)"
    - "text-primary-foreground for text on primary backgrounds"
    - "bg-primary/10 and bg-primary/5 for light accent backgrounds"

key-files:
  created: []
  modified:
    - app/globals.css
    - components/footer.tsx
    - components/hero.tsx
    - components/navbar.tsx
    - components/habits/heatmap.tsx
    - components/habits/streak-counter.tsx
    - components/habits/habit-card.tsx
    - components/habits/habit-empty-state.tsx
    - components/habits/frequency-selector.tsx
    - components/habits/next-milestone.tsx
    - components/tasks/task-card.tsx
    - components/tasks/task-empty-state.tsx
    - components/tasks/task-detail-content.tsx
    - app/page.tsx
    - tests/components/habits/heatmap.test.tsx

key-decisions:
  - "Dark mode primary reduced from S=60%/L=50% to S=45%/L=55% for visible desaturation and eye comfort"
  - "Hero text gradients (emerald-to-teal, teal-to-cyan) replaced with solid text-primary for token compliance"
  - "Progress bar gradient (from-emerald-500 to-emerald-400) replaced with solid bg-primary"
  - "frequency-selector active state uses text-primary-foreground instead of text-white for token consistency"

patterns-established:
  - "Token-first accent: all brand accent colors use bg-primary/text-primary, never hardcoded color names"
  - "Hover opacity: hover:bg-primary/90 pattern for primary button hover states"

requirements-completed: [VISL-06]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 8 Plan 1: Dark Mode Accent Desaturation Summary

**Desaturated dark mode primary accent to S=45%/L=55% and migrated all 14 component files from hardcoded emerald/teal to design tokens**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T20:21:54Z
- **Completed:** 2026-02-17T20:25:55Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Dark mode accent visibly desaturated (--primary, --ring, --sidebar-primary, --sidebar-ring all set to 160 45% 55%)
- All 14 component files migrated from hardcoded emerald-*/teal-* classes to bg-primary/text-primary design tokens
- Heatmap test assertions updated to match new token-based classes
- Semantic colors (green priority, blue info, amber warning, orange streak) preserved unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Desaturate dark mode accent tokens in globals.css** - `8e0713b` (feat)
2. **Task 2: Migrate hardcoded emerald/teal classes to design tokens** - `098548a` (feat)

## Files Created/Modified
- `app/globals.css` - Updated 4 dark mode tokens from 160 60% 50% to 160 45% 55%
- `components/footer.tsx` - 16 hover:text-emerald-600 -> hover:text-primary
- `components/hero.tsx` - CTA button, text gradients, background gradient migrated to tokens
- `components/navbar.tsx` - Brand text text-emerald-600 -> text-primary
- `components/habits/heatmap.tsx` - Completed cell, today ring, legend dot migrated
- `components/habits/streak-counter.tsx` - 4 text-emerald-500 -> text-primary
- `components/habits/habit-card.tsx` - Checkbox and progress bar migrated
- `components/habits/habit-empty-state.tsx` - Icon color, background, CTA button migrated
- `components/habits/frequency-selector.tsx` - Both toggle groups migrated to token pattern
- `components/habits/next-milestone.tsx` - Target icon color migrated
- `components/tasks/task-card.tsx` - Checkbox migrated
- `components/tasks/task-empty-state.tsx` - Icon color, background, CTA button migrated
- `components/tasks/task-detail-content.tsx` - Status icon, badge, intention callout migrated
- `app/page.tsx` - Feature icons, stats section, CTA button migrated
- `tests/components/habits/heatmap.test.tsx` - Assertions updated for bg-primary/ring-primary

## Decisions Made
- Dark mode primary reduced from S=60%/L=50% to S=45%/L=55% -- creates visible distinction from light mode (S=63%/L=45%) while remaining readable
- Hero text gradients replaced with solid text-primary -- gradients bypass CSS custom property system and cannot be desaturated via tokens
- Progress bar gradient replaced with solid bg-primary -- same reasoning as text gradients
- frequency-selector uses text-primary-foreground instead of text-white -- aligns with token system where primary-foreground adapts per theme

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All brand accent colors now flow through the token system
- Dark mode desaturation applies universally with no emerald/teal outliers
- Ready for 08-02 (remaining visual polish tasks)

## Self-Check: PASSED

- All 15 modified files verified present on disk
- Commit 8e0713b (Task 1) verified in git log
- Commit 098548a (Task 2) verified in git log

---
*Phase: 08-visual-polish*
*Completed: 2026-02-17*
