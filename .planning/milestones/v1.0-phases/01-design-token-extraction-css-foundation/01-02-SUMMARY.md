---
phase: 01-design-token-extraction-css-foundation
plan: 02
subsystem: ui
tags: [tailwind, design-tokens, css, audit, documentation]

# Dependency graph
requires:
  - phase: 01-01
    provides: CSS custom properties in globals.css (page, highlight, sidebar, typography, spacing, layout tokens)
provides:
  - Tailwind utility registration for all new CSS tokens (bg-page, bg-highlight, bg-sidebar, text-page-title, etc.)
  - Typography scale Tailwind utilities with line-height and font-weight
  - Spacing and width Tailwind utilities for semantic layout
  - Complete design token reference document (DESIGN-TOKENS.md)
  - Hardcoded emerald/green/teal color audit across 22 component files
affects:
  - 02 (sidebar shell uses bg-sidebar, w-sidebar, text-sidebar-foreground)
  - 03-06 (page migrations use bg-page, text-page-title, p-card-padding, etc.)
  - 05-06 (hardcoded color migration uses audit results from DESIGN-TOKENS.md)
  - 07-09 (all phases consume registered Tailwind utilities)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hsl(var(--xxx)) pattern for color tokens consumed from CSS custom properties"
    - "Tailwind fontSize with tuple format [size, { lineHeight, fontWeight }]"
    - "Semantic spacing tokens as Tailwind spacing extensions (p-card-padding, gap-card-gap)"
    - "Sidebar width tokens as Tailwind width extensions (w-sidebar, w-sidebar-mobile, w-sidebar-icon)"

key-files:
  created:
    - ".planning/phases/01-design-token-extraction-css-foundation/DESIGN-TOKENS.md"
  modified:
    - "tailwind.config.ts"

key-decisions:
  - "Sidebar colors registered as nested object with DEFAULT key for bg-sidebar shorthand"
  - "Typography utilities include lineHeight and fontWeight in tuple format for single-class usage"
  - "Spacing tokens extend spacing (not padding/margin) so they work with all spacing utilities (p-, m-, gap-)"
  - "Width tokens extend width for sidebar dimension utilities"
  - "Teal classes included in audit alongside emerald/green since they are same brand family"

patterns-established:
  - "New color tokens use same hsl(var(--xxx)) pattern as existing shadcn colors"
  - "Typography scale: text-page-title, text-section-heading, text-body, text-caption, text-stat"
  - "Semantic spacing: p-card-padding, p-page-padding, gap-card-gap"
  - "Sidebar dimensions: w-sidebar, w-sidebar-mobile, w-sidebar-icon"
  - "Hardcoded color migration pattern: emerald-500 -> primary, emerald-100 -> primary/10, emerald-50 -> highlight"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 1 Plan 2: Tailwind Registration & Token Reference Summary

**Tailwind utility registration for all design tokens (colors, typography, spacing, layout) plus comprehensive hardcoded color audit across 22 component files**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T17:39:59Z
- **Completed:** 2026-02-16T17:43:59Z
- **Tasks:** 2
- **Files modified:** 1 (tailwind.config.ts), 1 created (DESIGN-TOKENS.md)

## Accomplishments

- Registered all new CSS tokens in tailwind.config.ts: page, highlight, sidebar (8 sub-tokens), fontSize (5 scales), spacing (3 tokens), width (3 sidebar dimensions)
- Created comprehensive DESIGN-TOKENS.md with token reference tables, surface hierarchy diagrams, typography/spacing scales, and quick-lookup guide
- Audited 93+ hardcoded emerald/green/teal color class usages across 22 component files with per-file migration recommendations
- Verified build, lint, and all 937 unit tests pass with the updated config

## Task Commits

Each task was committed atomically:

1. **Task 1: Register new design tokens in tailwind.config.ts** - `85697b4` (feat)
2. **Task 2: Audit hardcoded colors and create token reference document** - `4ab382f` (docs)

## Files Created/Modified

- `tailwind.config.ts` - Added page, highlight, sidebar colors; fontSize, spacing, width extensions
- `.planning/phases/01-design-token-extraction-css-foundation/DESIGN-TOKENS.md` - Complete token reference and hardcoded color audit (429 lines)

## Decisions Made

- Sidebar colors registered as a nested object (`sidebar: { DEFAULT, foreground, primary, ... }`) to match existing shadcn card/popover pattern and enable `bg-sidebar` shorthand
- Typography utilities use Tailwind tuple format `[size, { lineHeight, fontWeight }]` so a single class like `text-page-title` sets size, weight, and line-height together
- Spacing tokens extend the `spacing` key (not `padding`/`margin`) so they work with all spacing-based utilities (`p-`, `m-`, `gap-`, `top-`, etc.)
- Included `teal-*` classes in the audit alongside `emerald-*` and `green-*` since teal is part of the same brand gradient family

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 is now complete: all design tokens are defined in globals.css (Plan 01) and registered in tailwind.config.ts (Plan 02)
- DESIGN-TOKENS.md provides a reference for all subsequent phases
- Phase 2 (Sidebar Shell) can use `bg-sidebar`, `w-sidebar`, `text-sidebar-foreground`, etc.
- Phases 5-6 (Page Migration) have a complete audit of hardcoded colors to migrate

## Self-Check: PASSED

- [x] tailwind.config.ts contains `page:` color registration
- [x] tailwind.config.ts contains `highlight:` color registration
- [x] tailwind.config.ts contains `sidebar:` color group
- [x] tailwind.config.ts contains `fontSize:` with `page-title`
- [x] tailwind.config.ts contains `spacing:` with `card-padding`
- [x] tailwind.config.ts contains `width:` with `sidebar`
- [x] DESIGN-TOKENS.md exists
- [x] Commit 85697b4 found in git log
- [x] Commit 4ab382f found in git log
- [x] Build passes
- [x] Lint passes
- [x] All 937 tests pass

---
*Phase: 01-design-token-extraction-css-foundation*
*Completed: 2026-02-16*
