# Phase 34: Push Notification Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 34-push-notification-infrastructure
**Areas discussed:** Permission UX Flow, Subscription API Design, Settings Integration, Navigation on Click
**Mode:** --auto (all defaults auto-selected)

---

## Permission UX Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle in settings with explainer text | Inline explainer in settings card before browser prompt | ✓ |
| Modal explainer before prompt | Separate modal dialog explaining benefits before requesting permission | |
| Banner/toast on first visit | Passive prompt that appears on dashboard | |

**User's choice:** [auto] Toggle in settings page with explainer text (recommended default)
**Notes:** Matches design spec flow: user enables in settings → browser prompt. Lightweight, non-intrusive approach.

---

## Subscription API Design

| Option | Description | Selected |
|--------|-------------|----------|
| Separate subscribe/unsubscribe routes | `POST /api/push/subscribe` and `POST /api/push/unsubscribe` | ✓ |
| Single endpoint with action param | `POST /api/push/subscription` with action in body | |

**User's choice:** [auto] Separate routes (recommended default)
**Notes:** Matches design spec's explicit route listing. Clearer intent per endpoint.

---

## Settings Integration

| Option | Description | Selected |
|--------|-------------|----------|
| New section in existing settings page | Add "Notifications" section to current settings | ✓ |
| Separate notifications page | New route at `/dashboard/notifications/settings` | |

**User's choice:** [auto] New section in existing settings page (recommended default)
**Notes:** Keeps all user preferences consolidated in one place.

---

## Navigation on Click

| Option | Description | Selected |
|--------|-------------|----------|
| Source-type URL map | events→/calendar, tasks→/tasks, habits→/habits, bills→/money/bills | ✓ |
| Deep link to specific item | Direct link to item detail page/modal | |

**User's choice:** [auto] Source-type URL map (recommended default)
**Notes:** Uses existing app routes. Deep linking can be added later when item detail views support direct URL access.

---

## Claude's Discretion

- Internal structure of `use-push-notifications` hook
- Device labeling via user_agent in subscriptions
- Test notification payload format

## Deferred Ideas

None — discussion stayed within phase scope
