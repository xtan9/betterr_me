# Phase 35: Email Notification Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

Resend integration with React Email templates for all 4 reminder source types (event reminder, task due, habit nudge, bill due), email notification toggle in settings, and unsubscribe link support. This phase delivers the email sending infrastructure — the actual reminder dispatch cron and per-type reminder preferences are in Phase 36. No push notification changes — that was Phase 34.

</domain>

<decisions>
## Implementation Decisions

### Email Service Setup (MAIL-01, MAIL-02)
- **D-01:** Use Resend as the email delivery service. Install `resend` and `@react-email/components` packages.
- **D-02:** API key stored as `RESEND_API_KEY` environment variable (server-only, not prefixed with `NEXT_PUBLIC_`).
- **D-03:** Sender address: `reminders@betterr.me` (per design spec). Resend domain verification assumed to be handled outside this phase.
- **D-04:** Create `lib/email/resend.ts` utility that exports a configured Resend client instance.

### React Email Template Architecture (MAIL-02, MAIL-04)
- **D-05:** Templates live in `emails/` directory at project root (React Email convention). Four templates: `event-reminder.tsx`, `task-due.tsx`, `habit-nudge.tsx`, `bill-due.tsx`.
- **D-06:** Shared base layout component (`emails/components/base-layout.tsx`) with BetterR.Me branding: logo, teal primary color, footer with unsubscribe link. All templates compose this layout.
- **D-07:** Templates receive typed props (source item name, time, action URL) and render with React Email components (`@react-email/components`).
- **D-08:** Action URLs in emails reuse the same URL map from Phase 34: events→`/calendar?date=YYYY-MM-DD`, tasks→`/tasks`, habits→`/habits`, bills→`/money/bills`.

### Unsubscribe Mechanism (MAIL-03)
- **D-09:** Stateless unsubscribe: HMAC-SHA256 signed token encoding `user_id`. No extra database table needed. Token generated server-side when building the email.
- **D-10:** Unsubscribe link in every email footer points to `GET /api/email/unsubscribe?token=<signed_token>`. Route verifies HMAC signature, sets `email_notifications_enabled = false` on the user's profile.
- **D-11:** Unsubscribe route renders a simple confirmation page ("You've been unsubscribed") — no auth required (the signed token is the auth).
- **D-12:** HMAC secret stored as `EMAIL_UNSUBSCRIBE_SECRET` environment variable.

### Settings Integration (MAIL-01)
- **D-13:** Add email notification toggle to the existing `NotificationSettings` component (`components/settings/notification-settings.tsx`). Lives alongside the push notification toggle.
- **D-14:** Email toggle calls `PATCH /api/profile` (or a new `POST /api/email/preferences`) to update `email_notifications_enabled` on the user's profile.
- **D-15:** Need to add `email_notifications_enabled` boolean column to `profiles` table (default `false`). New migration file.

### Email Send Utility
- **D-16:** Create `lib/email/send.ts` with a `sendReminderEmail(userId, reminder, sourceItem)` function. This is the function the Phase 36 cron job will call when `'email'` is in a reminder's channels.
- **D-17:** The send function: looks up user email from profiles, checks `email_notifications_enabled`, renders the appropriate React Email template, sends via Resend, returns success/failure.

### i18n
- **D-18:** Email templates render in the user's preferred locale (from `profiles.locale`). Template strings pulled from locale-specific objects within each template file (not next-intl — emails render server-side outside Next.js request context).

### Claude's Discretion
- Internal structure of the email send utility (error handling, retry logic)
- React Email component choices (Section, Row, Column vs simpler layouts)
- Whether to add a `lib/email/templates.ts` registry mapping source types to template components
- Test email button behavior (separate from push test notification)
- Email preview dev tooling setup (React Email dev server)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Full design spec. "Email notifications" section (line ~261-266) defines Resend usage, template types, sender address, and unsubscribe requirement. "Delivery pipeline" section (line ~268-276) defines how email fits into the cron dispatch flow.

### Phase 34 Context (Push Notifications)
- `.planning/phases/34-push-notification-infrastructure/34-CONTEXT.md` — Push notification decisions. D-14 defines URL map by source type (reuse for email action links). D-15/D-16 define the NotificationSettings component structure to extend.

### Existing Infrastructure
- `components/settings/notification-settings.tsx` — Existing push notification settings component to extend with email toggle
- `lib/db/types.ts` — `ReminderChannel = 'push' | 'email'` type already defined (line ~1231)
- `lib/validations/reminders.ts` — `channelSchema = z.enum(["push", "email"])` already validates email channel
- `lib/db/profiles.ts` — ProfilesDB class; will need update for `email_notifications_enabled` column
- `hooks/use-push-notifications.ts` — Pattern reference for hook structure

### Requirements
- `.planning/REQUIREMENTS.md` — MAIL-01 through MAIL-04 requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NotificationSettings` component: Already has push toggle UI pattern — extend for email toggle
- `ReminderChannel` type: Already supports `'email'` channel — no type changes needed
- Zod `channelSchema`: Already validates `'email'` — no validation changes needed
- URL map from Phase 34 D-14: Reuse for email action links
- `fetcher` utility: For SWR calls to email preference endpoints

### Established Patterns
- API routes: `createClient()` → `getUser()` → auth check → DB operation → JSON response
- Settings components: Card-based sections with Switch toggles and descriptive text
- Database migrations: Sequential numbered files in `supabase/migrations/`
- i18n: All 3 locale files (en.json, zh.json, zh-TW.json) updated together

### Integration Points
- `components/settings/notification-settings.tsx`: Add email toggle section
- `supabase/migrations/`: New migration for `email_notifications_enabled` column on profiles
- `lib/email/`: New directory for Resend client, send utility, and unsubscribe token logic
- `emails/`: New directory for React Email templates
- `app/api/email/`: New API routes for unsubscribe and email preferences
- `package.json`: Add `resend` and `@react-email/components` dependencies

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The design spec is straightforward: Resend for delivery, React Email for templates, unsubscribe link in every email. All reminder infrastructure (DB types, channels) already supports email from Phase 29.

</specifics>

<deferred>
## Deferred Ideas

- Per-source-type email preferences (e.g., email for bills but not habits) — belongs in Phase 36 reminder preferences
- Email digest/summary (daily rollup instead of individual emails) — potential future phase
- HTML email dark mode support — nice-to-have, not in requirements

</deferred>

---

*Phase: 35-email-notification-infrastructure*
*Context gathered: 2026-04-02*
