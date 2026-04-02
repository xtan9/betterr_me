# Phase 35: Email Notification Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 35-email-notification-infrastructure
**Areas discussed:** Email Service Setup, Template Architecture, Unsubscribe Mechanism, Settings Integration
**Mode:** --auto (all decisions auto-selected)

---

## Email Service Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Resend | Modern email API, native React Email support, simple DX | ✓ |
| SendGrid | Established service, more features, heavier SDK | |
| AWS SES | Cheapest at scale, more setup, no React Email integration | |

**User's choice:** [auto] Resend (recommended — design spec default, native React Email support)

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable (RESEND_API_KEY) | Standard pattern, server-only | ✓ |
| Supabase Vault | Encrypted storage, more complex retrieval | |

**User's choice:** [auto] Environment variable (recommended default)

**Notes:** Sender address `reminders@betterr.me` per design spec. Domain verification is an ops task outside this phase.

---

## Template Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Shared base layout + per-type components | Consistent branding, DRY footer/header | ✓ |
| Standalone templates per type | Simpler, but duplicated layout code | |
| Single generic template with conditional content | Less code, but harder to customize per type | |

**User's choice:** [auto] Shared base layout + per-type components (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| `emails/` directory at project root | React Email convention, supports dev preview | ✓ |
| `lib/email/templates/` | Closer to app code, less conventional | |

**User's choice:** [auto] `emails/` directory at project root (recommended — React Email convention)

**Notes:** Templates use BetterR.Me teal branding. Action URLs reuse Phase 34 URL map.

---

## Unsubscribe Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| HMAC-signed token (stateless) | No DB table needed, simple, secure | ✓ |
| Database token table | More flexible, revocable, extra table | |
| JWT token | Standard, but overkill for simple unsubscribe | |

**User's choice:** [auto] HMAC-signed token (recommended — simplest, no extra DB needed)

| Option | Description | Selected |
|--------|-------------|----------|
| Global email off (this phase) | Simple toggle, per-type deferred to Phase 36 | ✓ |
| Per-type unsubscribe immediately | More complex, requires preference UI | |

**User's choice:** [auto] Global email off (recommended — per-type granularity in Phase 36)

**Notes:** Unsubscribe route renders confirmation page, no auth required (token is auth).

---

## Settings Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing NotificationSettings component | Consistent, reuses card layout | ✓ |
| Separate EmailSettings component | More modular, but fragments settings | |

**User's choice:** [auto] Extend existing NotificationSettings (recommended — matches Phase 34 pattern)

**Notes:** Requires new `email_notifications_enabled` column on profiles table.

---

## Claude's Discretion

- Internal structure of email send utility
- React Email component choices
- Template registry pattern
- Test email button behavior
- Email preview dev tooling

## Deferred Ideas

- Per-source-type email preferences → Phase 36
- Email digest/summary → future phase
- HTML email dark mode → nice-to-have
