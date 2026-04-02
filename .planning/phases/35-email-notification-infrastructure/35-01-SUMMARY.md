---
phase: 35-email-notification-infrastructure
plan: 01
subsystem: email
tags: [resend, react-email, hmac, email-templates, unsubscribe]

requires:
  - phase: 29-calendar-reminder-foundation
    provides: ReminderSourceType type and profiles table

provides:
  - Resend client singleton for sending emails
  - HMAC-SHA256 unsubscribe token generation and verification
  - Four email templates (event-reminder, task-due, habit-nudge, bill-due)
  - Shared base email layout with BetterR.Me branding
  - Template registry mapping ReminderSourceType to components
  - DB migration for email_notifications_enabled on profiles
  - Profile type and validation schema updated for email opt-in

affects: [35-02-PLAN, email-sending, reminder-dispatch]

tech-stack:
  added: [resend, "@react-email/components", react-email]
  patterns: [email-template-registry, hmac-unsubscribe-tokens, react-email-components]

key-files:
  created:
    - lib/email/resend.ts
    - lib/email/unsubscribe.ts
    - lib/email/templates.ts
    - emails/components/base-layout.tsx
    - emails/event-reminder.tsx
    - emails/task-due.tsx
    - emails/habit-nudge.tsx
    - emails/bill-due.tsx
    - supabase/migrations/20260402000001_add_email_notifications_enabled.sql
    - .env.example
    - tests/lib/email/unsubscribe.test.ts
    - tests/emails/templates.test.tsx
  modified:
    - lib/db/types.ts
    - lib/validations/profile.ts
    - app/api/profile/route.ts
    - package.json

key-decisions:
  - "console.warn for missing RESEND_API_KEY instead of throw to avoid dev crash"
  - "HMAC-SHA256 with timing-safe comparison for unsubscribe tokens"
  - "email_notifications_enabled defaults to false (opt-in)"

patterns-established:
  - "Email template pattern: STRINGS object with en/zh/zh-TW keys, BaseLayout wrapper, typed props interface"
  - "Template registry: EMAIL_TEMPLATES maps ReminderSourceType to component + localized subjects"
  - "Unsubscribe token: base64url-encoded JSON with uid + HMAC signature"

requirements-completed: [MAIL-02, MAIL-03, MAIL-04]

duration: 5min
completed: 2026-04-02
---

# Phase 35 Plan 01: Email Infrastructure Foundation Summary

**Resend client, HMAC unsubscribe tokens, four React Email templates with i18n, and template registry for all reminder source types**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T21:57:30Z
- **Completed:** 2026-04-02T22:02:52Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Installed Resend and React Email packages, configured Resend client singleton
- Created HMAC-SHA256 unsubscribe token utility with timing-safe comparison
- Built four email templates (event-reminder, task-due, habit-nudge, bill-due) with shared BaseLayout and i18n for en/zh/zh-TW
- Created template registry mapping ReminderSourceType to components with localized default subjects
- Added email_notifications_enabled column migration, Profile type update, and validation schema extension
- 14 tests covering token generation/verification/tampering and template rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages, DB migration, type updates, and email infrastructure utilities** - `7b93fb3` (feat)
2. **Task 2: Create email templates and template registry** - `d1cff76` (feat)
3. **Task 3: Tests for unsubscribe tokens and email templates** - `84f84a4` (test)

## Files Created/Modified
- `lib/email/resend.ts` - Resend client singleton with missing key warning
- `lib/email/unsubscribe.ts` - HMAC-SHA256 token generation, verification, URL builder
- `lib/email/templates.ts` - Template registry mapping source types to React Email components
- `emails/components/base-layout.tsx` - Shared email layout with teal branding and unsubscribe footer
- `emails/event-reminder.tsx` - Event reminder template with timed/all-day variants
- `emails/task-due.tsx` - Task due template with optional time
- `emails/habit-nudge.tsx` - Habit nudge template
- `emails/bill-due.tsx` - Bill due template with optional amount
- `supabase/migrations/20260402000001_add_email_notifications_enabled.sql` - Add column to profiles
- `.env.example` - Document all required env vars
- `lib/db/types.ts` - Added email_notifications_enabled to Profile interface
- `lib/validations/profile.ts` - Added email_notifications_enabled to update schema
- `app/api/profile/route.ts` - Handle email_notifications_enabled in PATCH
- `tests/lib/email/unsubscribe.test.ts` - 6 tests for token utility
- `tests/emails/templates.test.tsx` - 8 tests for template rendering

## Decisions Made
- Used console.warn instead of throw for missing RESEND_API_KEY so dev environments without the key don't crash at import time
- HMAC-SHA256 with timing-safe comparison chosen for unsubscribe tokens (simple, stateless, secure)
- email_notifications_enabled defaults to false (opt-in model, user must explicitly enable)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

Users need to configure the following environment variables for email functionality:
- `RESEND_API_KEY` - API key from Resend dashboard
- `EMAIL_UNSUBSCRIBE_SECRET` - Random secret string (32+ characters) for HMAC token signing

## Next Phase Readiness
- Email infrastructure complete: Resend client, templates, and unsubscribe utility ready
- Plan 02 can build the send utility and API routes consuming these artifacts
- Template registry provides clean mapping for the dispatch layer

## Self-Check: PASSED

All 12 created files verified present. All 3 task commits verified in git log.

---
*Phase: 35-email-notification-infrastructure*
*Completed: 2026-04-02*
