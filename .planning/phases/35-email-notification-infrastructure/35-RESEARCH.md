# Phase 35: Email Notification Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** Transactional email (Resend + React Email) in Next.js 16 App Router
**Confidence:** HIGH

## Summary

This phase adds email notification infrastructure to BetterR.Me using Resend for delivery and React Email for template rendering. The codebase already has the `ReminderChannel = 'push' | 'email'` type and Zod validation for the email channel from Phase 29, so no type-level changes are needed. The work is greenfield: install packages, create templates, build the send utility, add the unsubscribe mechanism, extend settings UI, and add a database migration.

Resend's API is straightforward -- a single `resend.emails.send()` call with a `react` property that accepts a React Email component. React Email provides cross-client-tested components (Html, Head, Body, Container, Section, Text, Button, Link, Img, Heading, Preview, Hr) that compile to table-based HTML for Outlook compatibility. The unsubscribe mechanism uses HMAC-SHA256 signed tokens (stateless, no extra DB table).

**Primary recommendation:** Use `resend@6.10.0` and `@react-email/components@1.0.11`. Templates in `emails/` directory. Shared base layout component. HMAC unsubscribe via `crypto.createHmac`. Extend existing `PATCH /api/profile` to handle the new `email_notifications_enabled` column.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Use Resend as the email delivery service. Install `resend` and `@react-email/components` packages.
- D-02: API key stored as `RESEND_API_KEY` environment variable (server-only).
- D-03: Sender address: `reminders@betterr.me`. Domain verification handled outside this phase.
- D-04: Create `lib/email/resend.ts` utility that exports a configured Resend client instance.
- D-05: Templates in `emails/` directory at project root. Four templates: `event-reminder.tsx`, `task-due.tsx`, `habit-nudge.tsx`, `bill-due.tsx`.
- D-06: Shared base layout component (`emails/components/base-layout.tsx`) with BetterR.Me branding.
- D-07: Templates receive typed props and render with React Email components.
- D-08: Action URLs reuse Phase 34 URL map: events->`/calendar?date=YYYY-MM-DD`, tasks->`/tasks`, habits->`/habits`, bills->`/money/bills`.
- D-09: Stateless unsubscribe: HMAC-SHA256 signed token encoding `user_id`. No extra DB table.
- D-10: Unsubscribe link in every email footer, `GET /api/email/unsubscribe?token=<signed_token>`.
- D-11: Unsubscribe route renders a simple confirmation page, no auth required.
- D-12: HMAC secret stored as `EMAIL_UNSUBSCRIBE_SECRET` environment variable.
- D-13: Add email notification toggle to existing `NotificationSettings` component.
- D-14: Email toggle calls `PATCH /api/profile` to update `email_notifications_enabled`.
- D-15: Add `email_notifications_enabled` boolean column to `profiles` table (default `false`). New migration.
- D-16: Create `lib/email/send.ts` with `sendReminderEmail(userId, reminder, sourceItem)` function.
- D-17: Send function: looks up user email, checks `email_notifications_enabled`, renders template, sends via Resend.
- D-18: Email templates render in user's preferred locale (from `profiles.locale`). Template strings pulled from locale-specific objects within each template file (not next-intl).

### Claude's Discretion
- Internal structure of the email send utility (error handling, retry logic)
- React Email component choices (Section, Row, Column vs simpler layouts)
- Whether to add a `lib/email/templates.ts` registry mapping source types to template components
- Test email button behavior
- Email preview dev tooling setup (React Email dev server)

### Deferred Ideas (OUT OF SCOPE)
- Per-source-type email preferences (Phase 36)
- Email digest/summary (daily rollup)
- HTML email dark mode support
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAIL-01 | User can enable email notifications from settings | Extend `NotificationSettings` component with email toggle, `email_notifications_enabled` column on profiles, `PATCH /api/profile` update |
| MAIL-02 | Email reminders sent via Resend with React Email templates per source type | `resend@6.10.0` + `@react-email/components@1.0.11`, `sendReminderEmail()` utility, 4 template files |
| MAIL-03 | Every reminder email includes an unsubscribe link | HMAC-SHA256 signed token in base layout footer, `GET /api/email/unsubscribe` route |
| MAIL-04 | Email templates exist for: event reminder, task due, habit nudge, bill due | 4 templates in `emails/` directory composing shared base layout |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Git workflow: Create feature branch + PR, never push to main
- Testing: Always add tests with PRs
- i18n: All three locale files (en, zh, zh-TW) must be updated together
- API error handling: try/catch -> console.error -> NextResponse.json({ error }, { status })
- Validation: Zod schemas at API boundaries
- Files: kebab-case. Components: PascalCase
- UI primitives: Do not edit `components/ui/` directly

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| resend | 6.10.0 | Transactional email delivery API | Official recommendation in CONTEXT.md D-01; developer-friendly API, React Email native support |
| @react-email/components | 1.0.11 | Email template components | Cross-client-tested HTML rendering, table-based layouts for Outlook compatibility |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-email | (dev only) | Local email preview server | Optional: `pnpm email:dev` for template development preview |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend | SendGrid | Design spec mentions both; Resend chosen for simpler API and native React Email integration |
| React Email | MJML | MJML uses its own markup; React Email lets you use familiar React components |

**Installation:**
```bash
pnpm add resend @react-email/components
pnpm add -D react-email
```

## Architecture Patterns

### Recommended Project Structure
```
emails/
  components/
    base-layout.tsx          # Shared branding wrapper (logo, footer, unsubscribe)
  event-reminder.tsx         # Event reminder template
  task-due.tsx               # Task due template
  habit-nudge.tsx            # Habit nudge template
  bill-due.tsx               # Bill due template

lib/email/
  resend.ts                  # Configured Resend client singleton
  send.ts                    # sendReminderEmail() main utility
  unsubscribe.ts             # HMAC token generation and verification
  templates.ts               # Template registry mapping source types to components

app/api/email/
  unsubscribe/route.ts       # GET handler for unsubscribe link

supabase/migrations/
  20260402000001_add_email_notifications_enabled.sql
```

### Pattern 1: Resend Client Singleton
**What:** Single configured Resend instance for server-side use
**When to use:** Any server-side email sending
**Example:**
```typescript
// lib/email/resend.ts
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

export const resend = new Resend(process.env.RESEND_API_KEY);
```

### Pattern 2: React Email Template Structure
**What:** React components that render to cross-client HTML
**When to use:** Every email template
**Example:**
```typescript
// emails/event-reminder.tsx
import {
  Html, Head, Body, Container, Section,
  Text, Button, Preview, Heading,
} from '@react-email/components';
import { BaseLayout } from './components/base-layout';

interface EventReminderProps {
  eventTitle: string;
  eventTime: string;
  eventDate: string;
  actionUrl: string;
  unsubscribeUrl: string;
  locale: string;
}

export function EventReminderEmail({
  eventTitle, eventTime, eventDate, actionUrl, unsubscribeUrl, locale,
}: EventReminderProps) {
  const strings = getStrings(locale); // locale-specific strings object
  return (
    <BaseLayout unsubscribeUrl={unsubscribeUrl} locale={locale}>
      <Preview>{strings.preview(eventTitle)}</Preview>
      <Heading as="h1">{strings.heading}</Heading>
      <Text>{strings.body(eventTitle, eventDate, eventTime)}</Text>
      <Button href={actionUrl}>{strings.viewEvent}</Button>
    </BaseLayout>
  );
}
```

### Pattern 3: Resend Send Call
**What:** Sending email via Resend with React Email template
**When to use:** In the `sendReminderEmail` utility
**Critical detail:** Pass the component as a function call, not JSX
**Example:**
```typescript
// lib/email/send.ts
import { resend } from './resend';
import { EventReminderEmail } from '@/emails/event-reminder';

const { data, error } = await resend.emails.send({
  from: 'BetterR.Me <reminders@betterr.me>',
  to: [userEmail],
  subject: subject,
  react: EventReminderEmail({ eventTitle, eventTime, eventDate, actionUrl, unsubscribeUrl, locale }),
});
```

### Pattern 4: HMAC Unsubscribe Token
**What:** Stateless signed token for unsubscribe links
**When to use:** Token generation (at send time) and verification (at unsubscribe time)
**Example:**
```typescript
// lib/email/unsubscribe.ts
import crypto from 'crypto';

const SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET!;

export function generateUnsubscribeToken(userId: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(userId).digest('hex');
  // Encode userId + signature together
  const payload = Buffer.from(JSON.stringify({ uid: userId, sig: hmac })).toString('base64url');
  return payload;
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const { uid, sig } = JSON.parse(Buffer.from(token, 'base64url').toString());
    const expected = crypto.createHmac('sha256', SECRET).update(uid).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return uid;
  } catch {
    return null;
  }
}
```

### Pattern 5: Template Registry
**What:** Maps `ReminderSourceType` to the correct email template and subject
**When to use:** In `sendReminderEmail()` to select the right template dynamically
**Example:**
```typescript
// lib/email/templates.ts
import { ReminderSourceType } from '@/lib/db/types';
import { EventReminderEmail } from '@/emails/event-reminder';
import { TaskDueEmail } from '@/emails/task-due';
import { HabitNudgeEmail } from '@/emails/habit-nudge';
import { BillDueEmail } from '@/emails/bill-due';

export const EMAIL_TEMPLATES: Record<ReminderSourceType, {
  component: (props: any) => React.ReactElement;
  subjectKey: string;
}> = {
  calendar_event: { component: EventReminderEmail, subjectKey: 'eventReminder' },
  task: { component: TaskDueEmail, subjectKey: 'taskDue' },
  habit: { component: HabitNudgeEmail, subjectKey: 'habitNudge' },
  bill: { component: BillDueEmail, subjectKey: 'billDue' },
};
```

### Pattern 6: Email i18n (Without next-intl)
**What:** Locale-specific strings embedded in each template file
**When to use:** All email templates (they render server-side outside Next.js request context)
**Example:**
```typescript
// Inside each template file
const STRINGS = {
  en: {
    heading: 'Event Reminder',
    body: (title: string, date: string, time: string) =>
      `Your event "${title}" is coming up on ${date} at ${time}.`,
    viewEvent: 'View Event',
    preview: (title: string) => `Reminder: ${title}`,
  },
  zh: {
    heading: '...',
    body: (title: string, date: string, time: string) => `...`,
    viewEvent: '...',
    preview: (title: string) => `...`,
  },
  'zh-TW': {
    heading: '...',
    body: (title: string, date: string, time: string) => `...`,
    viewEvent: '...',
    preview: (title: string) => `...`,
  },
} as const;

function getStrings(locale: string) {
  return STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
}
```

### Anti-Patterns to Avoid
- **Using JSX syntax in `resend.emails.send()`:** Pass templates as function calls: `Template({ ...props })`, not `<Template {...props} />`
- **Using next-intl in email templates:** Emails render outside the Next.js request context; next-intl hooks won't work. Use embedded string maps.
- **Storing unsubscribe state in a separate table:** Stateless HMAC tokens are simpler and don't require a DB lookup on every email send.
- **Using `new Date().toISOString()` for date display:** Use the user's locale and timezone for human-readable dates in email content.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email HTML rendering | Custom HTML string templates | React Email components | Table-based layouts for cross-client compat, especially Outlook |
| Email delivery | Direct SMTP connection | Resend API | Deliverability, bounce handling, SPF/DKIM managed by Resend |
| Token verification timing | Simple string comparison | `crypto.timingSafeEqual()` | Prevents timing attacks on HMAC verification |
| Base64 URL encoding | Manual regex replacement | `Buffer.toString('base64url')` | Node.js built-in, handles URL-safe encoding correctly |

**Key insight:** Email client rendering is notoriously inconsistent (Outlook uses Word's HTML engine). React Email abstracts this pain. Do not write raw HTML for email templates.

## Common Pitfalls

### Pitfall 1: JSX vs Function Call in Resend
**What goes wrong:** Passing `<Template />` JSX to `resend.emails.send({ react: ... })` can cause rendering issues.
**Why it happens:** Resend's `react` property expects a React element, and the documented pattern uses function call syntax.
**How to avoid:** Always use `Template({ ...props })` not `<Template {...props} />`.
**Warning signs:** Emails render as blank or show raw HTML.

### Pitfall 2: Missing RESEND_API_KEY in Production
**What goes wrong:** Email sending silently fails or throws at startup.
**Why it happens:** Environment variable not set in Vercel deployment.
**How to avoid:** Check for the env var at module load time with a clear error message. Add to `.env.example`.
**Warning signs:** 500 errors on email send routes.

### Pitfall 3: Timing Attack on HMAC Verification
**What goes wrong:** An attacker can determine the correct HMAC byte-by-byte.
**Why it happens:** Using `===` for string comparison leaks timing information.
**How to avoid:** Always use `crypto.timingSafeEqual()` for HMAC comparison.
**Warning signs:** Security audit flags.

### Pitfall 4: Missing email_notifications_enabled Check
**What goes wrong:** Emails sent to users who have unsubscribed.
**Why it happens:** The send utility skips the preference check.
**How to avoid:** `sendReminderEmail()` must check `profile.email_notifications_enabled` before sending.
**Warning signs:** User complaints about continued emails after unsubscribing.

### Pitfall 5: Profile Type Mismatch After Migration
**What goes wrong:** TypeScript types don't include `email_notifications_enabled`.
**Why it happens:** Migration adds the column but `Profile` interface in `lib/db/types.ts` isn't updated.
**How to avoid:** Update the TypeScript `Profile` interface and `ProfileUpdate` type alongside the migration.
**Warning signs:** Type errors when accessing `profile.email_notifications_enabled`.

### Pitfall 6: Locale Not on Profile
**What goes wrong:** Template renders in English for all users.
**Why it happens:** The `profiles` table may not have a `locale` column, or it isn't populated.
**How to avoid:** Verify the `profiles` table has a `locale` column. If not, fall back to `'en'`.
**Warning signs:** All emails in English regardless of user locale.

## Code Examples

### Unsubscribe API Route
```typescript
// app/api/email/unsubscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProfilesDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('Invalid link', { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return new NextResponse('Invalid or expired link', { status: 400 });
  }

  // Use admin client to bypass RLS (user is not authenticated)
  const supabase = createAdminClient();
  const profilesDB = new ProfilesDB(supabase);
  await profilesDB.updateProfile(userId, { email_notifications_enabled: false });

  // Return simple HTML confirmation page
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
     <h1>Unsubscribed</h1>
     <p>You have been unsubscribed from BetterR.Me email notifications.</p>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
```

### Database Migration
```sql
-- 20260402000001_add_email_notifications_enabled.sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT false;
```

### Settings Toggle Extension (Email Section)
```typescript
// Added to notification-settings.tsx
// Email notification toggle - uses PATCH /api/profile
const { data: profileData, mutate: mutateProfile } = useSWR('/api/profile', fetcher);
const emailEnabled = profileData?.profile?.email_notifications_enabled ?? false;

const handleEmailToggle = async (checked: boolean) => {
  try {
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_notifications_enabled: checked }),
    });
    mutateProfile();
    toast.success(checked ? t('emailEnabled') : t('emailDisabled'));
  } catch {
    toast.error(t('emailToggleError'));
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nodemailer + EJS templates | Resend + React Email | 2023 | Type-safe, component-based email templates with cross-client testing |
| HTML string concatenation | React Email components | 2023 | Eliminates manual table-based HTML, prevents rendering bugs |
| Database-stored unsubscribe state | HMAC signed tokens | N/A (design choice) | Stateless, no extra DB table, cryptographically secure |

**Note:** `@react-email/components@1.0.11` is a unified package replacing the older individual `@react-email/html`, `@react-email/button`, etc. packages. Use only the unified package.

## Open Questions

1. **Does `profiles` table have a `locale` column?**
   - What we know: CONTEXT.md D-18 says to use `profiles.locale` for email language. The `Profile` TypeScript interface does not include a `locale` field.
   - What's unclear: Whether the column exists in DB but is not typed, or if it needs to be added.
   - Recommendation: Check the actual DB schema. If missing, add `locale` column in the same migration or fall back to `'en'`.

2. **Profile update schema for `email_notifications_enabled`**
   - What we know: The current `profileUpdateSchema` in `lib/validations/profile.ts` accepts `full_name`, `avatar_url`, `preferences`, and `timezone`.
   - What's unclear: N/A -- needs to be extended.
   - Recommendation: Add `email_notifications_enabled: z.boolean().optional()` to `profileUpdateSchema` and handle it in the `PATCH /api/profile` route.

3. **Resend domain verification**
   - What we know: CONTEXT.md D-03 says domain verification is handled outside this phase.
   - What's unclear: Whether `betterr.me` is already verified in Resend.
   - Recommendation: During development, use Resend's test mode (`delivered@resend.dev`). Production verification is out of scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test:run -- --reporter=verbose` |
| Full suite command | `pnpm test:run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAIL-01 | Email toggle updates profile preference | unit | `pnpm test:run tests/components/settings/notification-settings.test.tsx -x` | Wave 0 |
| MAIL-01 | PATCH /api/profile accepts email_notifications_enabled | unit | `pnpm test:run tests/app/api/profile/route.test.ts -x` | Existing (extend) |
| MAIL-02 | sendReminderEmail sends via Resend for each source type | unit | `pnpm test:run tests/lib/email/send.test.ts -x` | Wave 0 |
| MAIL-03 | Unsubscribe token generation and verification | unit | `pnpm test:run tests/lib/email/unsubscribe.test.ts -x` | Wave 0 |
| MAIL-03 | GET /api/email/unsubscribe disables email notifications | unit | `pnpm test:run tests/app/api/email/unsubscribe.test.ts -x` | Wave 0 |
| MAIL-04 | Each template renders without errors with valid props | unit | `pnpm test:run tests/emails/ -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:run -- --reporter=verbose`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/email/send.test.ts` -- covers MAIL-02 (mock Resend, verify template selection)
- [ ] `tests/lib/email/unsubscribe.test.ts` -- covers MAIL-03 (token generation/verification)
- [ ] `tests/app/api/email/unsubscribe.test.ts` -- covers MAIL-03 (API route handler)
- [ ] `tests/emails/` -- covers MAIL-04 (template rendering tests)
- [ ] `tests/components/settings/notification-settings.test.ts` -- covers MAIL-01 (extend existing or create)

## Sources

### Primary (HIGH confidence)
- [Resend - Send with Next.js](https://resend.com/docs/send-with-nextjs) - API pattern, configuration, send call syntax
- [@react-email/components on npm](https://www.npmjs.com/package/@react-email/components) - Version 1.0.11, component list
- [resend on npm](https://www.npmjs.com/package/resend) - Version 6.10.0
- [React Email Components](https://react.email/components) - Available components list

### Secondary (MEDIUM confidence)
- [React Email Templates Guide](https://reactemailtemplates.com/blog/send-react-email-with-resend) - Complete 2026 guide for Resend + React Email + Next.js
- Existing codebase: `components/settings/notification-settings.tsx`, `lib/db/profiles.ts`, `app/api/profile/route.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Resend and React Email are locked decisions, versions verified against npm registry on 2026-04-02
- Architecture: HIGH - Patterns follow existing project conventions (API routes, DB classes, component structure) and official Resend docs
- Pitfalls: HIGH - Based on documented patterns and official API behavior (JSX vs function call, timing-safe comparison)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable libraries, unlikely to change significantly)
