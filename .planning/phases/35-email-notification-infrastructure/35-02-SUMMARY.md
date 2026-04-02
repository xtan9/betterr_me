---
phase: 35-email-notification-infrastructure
plan: 02
subsystem: email
tags: [resend, email, notifications, unsubscribe, settings, i18n]

requires:
  - phase: 35-01
    provides: Resend client, email templates, unsubscribe token utilities, email_notifications_enabled column
provides:
  - sendReminderEmail utility for Phase 36 cron job
  - Unsubscribe API route for one-click email opt-out
  - Email notification toggle in settings UI
  - i18n strings for email notifications in all 3 locales
affects: [36-cron-reminder-delivery]

tech-stack:
  added: []
  patterns: [admin-client-for-cron-operations, hmac-token-unsubscribe]

key-files:
  created:
    - lib/email/send.ts
    - app/api/email/unsubscribe/route.ts
    - tests/lib/email/send.test.ts
    - tests/app/api/email/unsubscribe.test.ts
  modified:
    - components/settings/notification-settings.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/settings/notification-settings.test.tsx

key-decisions:
  - "Used MailX icon (not MailOff) for disabled email state -- MailOff does not exist in installed lucide-react version"
  - "Email section renders even when push is not supported, ensuring email toggle always accessible"

patterns-established:
  - "sendReminderEmail pattern: admin client + profile lookup + preference check + template selection + Resend send"
  - "Unsubscribe route returns HTML pages (not JSON) for direct browser access from email links"

requirements-completed: [MAIL-01, MAIL-02, MAIL-03]

duration: 8min
completed: 2026-04-02
---

# Phase 35 Plan 02: Email Send Utility & Settings Summary

**sendReminderEmail utility with preference checking and per-source-type template selection, unsubscribe API with HMAC token verification, and email toggle in notification settings with 3-locale i18n**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02T22:05:35Z
- **Completed:** 2026-04-02T22:13:46Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- sendReminderEmail checks email_notifications_enabled, selects correct template by source type, sends via Resend with `reminders@betterr.me` sender
- Unsubscribe API route verifies HMAC token, disables email via admin client, renders styled HTML confirmation page
- Email notification toggle added alongside push notification toggle in settings
- All 3 locale files updated with 6 email notification strings each
- 32 tests total: 9 for send utility, 4 for unsubscribe API, 19 for notification settings

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sendReminderEmail utility and unsubscribe API route** - `fc2e793` (feat)
2. **Task 2: Extend NotificationSettings with email toggle and add i18n strings** - `6c7a455` (feat)
3. **Task 3: Tests for send utility, unsubscribe API, and notification settings** - `a50b9ae` (test)

## Files Created/Modified
- `lib/email/send.ts` - Main email send utility with preference checking and template selection
- `app/api/email/unsubscribe/route.ts` - Unsubscribe endpoint with HMAC token verification and HTML responses
- `components/settings/notification-settings.tsx` - Extended with email notification toggle card
- `i18n/messages/en.json` - Added 6 email notification strings
- `i18n/messages/zh.json` - Added 6 email notification strings (Simplified Chinese)
- `i18n/messages/zh-TW.json` - Added 6 email notification strings (Traditional Chinese)
- `tests/lib/email/send.test.ts` - 9 tests covering preference check, all source types, error handling
- `tests/app/api/email/unsubscribe.test.ts` - 4 tests covering token validation and profile update
- `tests/components/settings/notification-settings.test.tsx` - Updated with 7 new email toggle tests

## Decisions Made
- Used `MailX` icon instead of `MailOff` (not available in installed lucide-react version)
- Email notification section renders even when push notifications are not supported, ensuring the email toggle is always accessible
- Used `document.getElementById` in tests instead of `getByRole("switch")` to disambiguate between push and email toggle switches

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MailOff icon import**
- **Found during:** Task 2 (NotificationSettings email toggle)
- **Issue:** Plan specified `MailOff` from lucide-react but the icon does not exist in the installed version
- **Fix:** Changed to `MailX` which exists and conveys the same meaning
- **Files modified:** components/settings/notification-settings.tsx
- **Verification:** TypeScript compiles without error
- **Committed in:** 6c7a455

**2. [Rule 1 - Bug] Fixed Profile type cast in send.ts**
- **Found during:** Task 1 (sendReminderEmail utility)
- **Issue:** Direct cast from `Profile` to `Record<string, unknown>` failed TypeScript strict check
- **Fix:** Used double cast `as unknown as Record<string, unknown>` for locale access
- **Files modified:** lib/email/send.ts
- **Verification:** TypeScript compiles without error
- **Committed in:** fc2e793

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both were minor type/import fixes. No scope creep.

## Issues Encountered
- Vitest picks up `.claude/worktrees/` test files (pre-existing known issue) causing false failures; used `--exclude '.claude/**'` to verify all tests pass

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- sendReminderEmail is ready for Phase 36 cron job integration
- Unsubscribe endpoint is live and linked from email templates
- Email preferences persisted via existing PATCH /api/profile endpoint

---
*Phase: 35-email-notification-infrastructure*
*Completed: 2026-04-02*

## Self-Check: PASSED
