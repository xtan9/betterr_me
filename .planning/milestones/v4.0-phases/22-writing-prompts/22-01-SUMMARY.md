---
phase: 22-writing-prompts
plan: 01
subsystem: ui
tags: [tiptap, placeholder, i18n, journal, writing-prompts]

# Dependency graph
requires:
  - phase: 21-journal-entry-crud
    provides: journal editor component, journal entry modal, autosave hook
provides:
  - WritingPrompt type, PromptCategory type, and WRITING_PROMPTS constant
  - getPromptsByCategory() and getPromptByKey() helper functions
  - journal.prompts i18n namespace in all 3 locale files
  - Tiptap Placeholder extension in journal editor
  - Placeholder CSS for empty editor hint text
affects: [22-writing-prompts plan 02, 25-translations]

# Tech tracking
tech-stack:
  added: []
  patterns: [hardcoded prompt data with i18n keys, Tiptap Placeholder extension]

key-files:
  created:
    - lib/data/writing-prompts.ts
  modified:
    - components/journal/journal-editor.tsx
    - app/globals.css
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Prompts defined as hardcoded TypeScript constant with i18n keys (not database)"
  - "Placeholder uses @apply text-muted-foreground/50 for consistent Tailwind theming"

patterns-established:
  - "Prompt data pattern: typed constant array with stable string keys and i18n key references"

requirements-completed: [PRMT-01, PRMT-02]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 22 Plan 01: Writing Prompts Data + Editor Placeholder Summary

**15 writing prompts across 3 categories with typed helpers, i18n strings in all locales, and Tiptap Placeholder extension for empty editor hints**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T20:39:48Z
- **Completed:** 2026-02-23T20:43:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created prompt data structure with 15 prompts in 3 categories (gratitude, reflection, goals) with typed helpers
- Added journal.prompts i18n namespace to all 3 locale files (en, zh, zh-TW) with English placeholder text
- Integrated Tiptap Placeholder extension into journal editor with customizable placeholder prop and CSS

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prompt data structure and i18n strings** - `fc02a19` (feat)
2. **Task 2: Add Tiptap Placeholder extension and CSS** - `aadd5f5` (feat)

## Files Created/Modified
- `lib/data/writing-prompts.ts` - Prompt types, constants (15 prompts in 3 categories), and helper functions
- `components/journal/journal-editor.tsx` - Added Placeholder extension import and configuration with optional placeholder prop
- `app/globals.css` - Added `.tiptap-journal .tiptap p.is-empty::before` CSS rule for placeholder rendering
- `i18n/messages/en.json` - Added journal.prompts namespace with 15 prompt texts and UI labels
- `i18n/messages/zh.json` - Added journal.prompts namespace (English placeholder text for Phase 25 translation)
- `i18n/messages/zh-TW.json` - Added journal.prompts namespace (English placeholder text for Phase 25 translation)

## Decisions Made
- Prompts stored as hardcoded TypeScript constant with i18n keys rather than database table (matches existing pattern for small static datasets like mood emojis)
- Placeholder CSS uses `@apply text-muted-foreground/50` for Tailwind theme consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prompt data layer ready for Plan 02 to build the PromptBrowserSheet UI component
- Editor placeholder is active and will show "Start writing..." in empty state
- All i18n keys in place for `useTranslations()` calls in Plan 02 components

## Self-Check: PASSED

All 6 files verified present. Both task commits (fc02a19, aadd5f5) verified in git log.

---
*Phase: 22-writing-prompts*
*Completed: 2026-02-23*
