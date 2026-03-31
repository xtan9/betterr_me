---
phase: 29
slug: database-schema-infrastructure-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test:run --reporter=verbose` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:run --reporter=verbose`
- **After every plan wave:** Run `pnpm test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | INFR-01 | migration | `supabase db diff` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | INFR-02 | migration | `supabase db diff` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | INFR-03 | unit | `pnpm test:run tests/lib/db/calendar-events.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 1 | INFR-04 | unit | `pnpm test:run tests/lib/db/reminders.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-03 | 02 | 1 | INFR-05 | unit | `pnpm test:run tests/lib/db/push-subscriptions.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-04 | 02 | 1 | INFR-06 | unit | `pnpm test:run tests/lib/db/reminder-defaults.test.ts` | ❌ W0 | ⬜ pending |
| 29-03-01 | 03 | 2 | INFR-07 | unit | `pnpm test:run tests/lib/validations/calendar-events.test.ts` | ❌ W0 | ⬜ pending |
| 29-03-02 | 03 | 2 | INFR-07 | unit | `pnpm test:run tests/lib/validations/reminders.test.ts` | ❌ W0 | ⬜ pending |
| 29-04-01 | 04 | 2 | INFR-08 | unit | `pnpm test:run tests/lib/service-worker.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/db/calendar-events.test.ts` — stubs for CalendarEventsDB CRUD
- [ ] `tests/lib/db/reminders.test.ts` — stubs for RemindersDB CRUD
- [ ] `tests/lib/db/push-subscriptions.test.ts` — stubs for PushSubscriptionsDB CRUD
- [ ] `tests/lib/db/reminder-defaults.test.ts` — stubs for ReminderDefaultsDB CRUD
- [ ] `tests/lib/validations/calendar-events.test.ts` — stubs for event validation
- [ ] `tests/lib/validations/reminders.test.ts` — stubs for reminder validation

*Existing infrastructure covers framework setup — only test file stubs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Service worker registers | INFR-08 | Browser API required | Open dev console → Application → Service Workers → verify sw.js registered |
| Timezone auto-detection | INFR-01 | Browser Intl API required | Clear profile timezone → reload → verify timezone populated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
