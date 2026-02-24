---
phase: 25-i18n-polish
plan: 01
subsystem: i18n
tags: [next-intl, i18n, tiptap, dark-mode, vitest, translations]

# Dependency graph
requires:
  - phase: 23-journal-prompts-links
    provides: journal prompts system with i18n keys and editor placeholder
provides:
  - Simplified Chinese translations for all 20 journal prompt keys
  - Traditional Chinese translations for all 20 journal prompt keys
  - Translated editor placeholder in all 3 locales
  - Automated i18n key parity test preventing future locale drift
  - Dark mode verification across all journal components
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "i18n key parity test using flatKeys + cross-locale comparison"
    - "Placeholder prop forwarding through dynamic loader component"

key-files:
  created:
    - tests/i18n-key-parity.test.ts
  modified:
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - components/journal/journal-editor.tsx
    - components/journal/journal-editor-loader.tsx
    - components/journal/journal-entry-modal.tsx

key-decisions:
  - "Empty string fallback for editor placeholder instead of English text"
  - "Parity test checks both directions (en->zh and zh->en) to catch orphan keys"

patterns-established:
  - "i18n parity test: flatKeys comparison across all locale files catches missing translations"

requirements-completed: [I18N-01, I18N-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 25 Plan 01: i18n & Polish Summary

**40 journal prompt translations (zh/zh-TW), translated editor placeholder, i18n key parity test, and dark mode verification across 20 journal components**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T18:18:29Z
- **Completed:** 2026-02-24T18:21:55Z
- **Tasks:** 3
- **Files modified:** 7 (3 locale files, 3 components, 1 test)

## Accomplishments
- Translated all 20 journal prompt keys into Simplified Chinese (zh.json) and Traditional Chinese (zh-TW.json) with culturally appropriate phrasing
- Added journal.editor.placeholder key to all 3 locale files, removed hardcoded "Start writing..." from editor component
- Created automated i18n key parity test (6 test cases) ensuring all 3 locale files maintain identical key sets
- Verified all 20 journal components use Tailwind theme tokens or explicit dark: variants -- no raw color classes found

## Task Commits

Each task was committed atomically:

1. **Task 1: Translate prompt keys and add editor placeholder to all locale files** - `32d1e14` (feat)
2. **Task 2: Fix hardcoded editor placeholder and create i18n parity test** - `ec5f871` (feat)
3. **Task 3: Verify dark mode rendering across all journal components** - no commit (verification-only, no files changed)

## Files Created/Modified
- `i18n/messages/en.json` - Added journal.editor.placeholder key
- `i18n/messages/zh.json` - 20 prompt translations (Simplified Chinese) + editor placeholder
- `i18n/messages/zh-TW.json` - 20 prompt translations (Traditional Chinese) + editor placeholder
- `components/journal/journal-editor.tsx` - Removed hardcoded "Start writing..." fallback
- `components/journal/journal-editor-loader.tsx` - Added placeholder prop forwarding
- `components/journal/journal-entry-modal.tsx` - Passes translated placeholder to editor
- `tests/i18n-key-parity.test.ts` - 6 tests for cross-locale key parity and translation verification

## Decisions Made
- Used empty string (`""`) as fallback for editor placeholder instead of English text -- parent always passes translated string, fallback is just a safety net
- Parity test checks both directions (en->zh and zh->en) to catch orphan keys that exist in one locale but not the reference

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All journal strings now available in all 3 locales (en, zh, zh-TW)
- i18n parity test will catch any future key mismatches across locales
- Dark mode verified safe across all journal components
- Ready for any remaining i18n-polish plans in this phase

## Self-Check: PASSED

All 8 files verified present. Both task commits (32d1e14, ec5f871) verified in git log.

---
*Phase: 25-i18n-polish*
*Completed: 2026-02-24*
