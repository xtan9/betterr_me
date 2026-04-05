---
phase: 37-navigation-i18n
plan: 01
subsystem: ui
tags: [sidebar, navigation, i18n, lucide-react, next-intl]

# Dependency graph
requires:
  - phase: 35-chat-ui-message-rendering
    provides: Chat UI components with i18n keys
  - phase: 36-conversation-persistence-management
    provides: Conversation sidebar with i18n keys
provides:
  - Chat nav item in app sidebar navigation
  - Complete i18n coverage for all chat.* keys across 3 locales
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - components/layouts/app-sidebar.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/layouts/app-sidebar.test.tsx

key-decisions:
  - "Chat nav placed after Calendar as last main nav item"

patterns-established:
  - "Chat nav uses same startsWith match pattern as other nav items for subpath highlighting"

requirements-completed: [INTG-01, INTG-02]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 37 Plan 01: Navigation & i18n Integration Summary

**Chat nav item added to sidebar after Calendar with MessageSquare icon, complete i18n coverage verified across all 3 locales**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T16:09:55Z
- **Completed:** 2026-04-05T16:14:19Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Added Chat nav item with MessageSquare icon to app sidebar after Calendar entry
- Added common.nav.chat i18n key in all 3 locales (en: "Chat", zh: "聊天", zh-TW: "聊天")
- Verified all chat.* i18n keys from Phases 35-36 are present and complete in en, zh, zh-TW
- Added 4 new tests for chat nav rendering and active state (TDD approach)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Chat nav item to sidebar and complete i18n**
   - `b920647` (test: add failing tests for Chat nav item — RED)
   - `eb9dadd` (feat: add Chat nav item and i18n keys — GREEN)

## Files Created/Modified
- `components/layouts/app-sidebar.tsx` - Added MessageSquare import and chat nav item to mainNavItems array
- `i18n/messages/en.json` - Added common.nav.chat = "Chat"
- `i18n/messages/zh.json` - Added common.nav.chat = "聊天"
- `i18n/messages/zh-TW.json` - Added common.nav.chat = "聊天"
- `tests/components/layouts/app-sidebar.test.tsx` - Added 4 tests for chat nav item, updated link count expectations

## Decisions Made
- Chat nav placed after Calendar as the last item in mainNavItems, matching the plan specification (D-01, D-03)
- No badge count for chat nav (per D-04) — chat doesn't have pending count semantics

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing build failure in `emails/bill-due.tsx` due to missing `@react-email/components` dependency — unrelated to this plan's changes, not addressed (out of scope)

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Chat feature is now discoverable from the main sidebar navigation
- All i18n strings complete — v7.0 milestone integration is ready for final verification

## Self-Check: PASSED

- All 5 modified files exist on disk
- Commits b920647 and eb9dadd verified in git log
- common.nav.chat key present in all 3 locale files (2 matches each: nav + chat section)
- MessageSquare import and usage confirmed in app-sidebar.tsx

---
*Phase: 37-navigation-i18n*
*Completed: 2026-04-05*
