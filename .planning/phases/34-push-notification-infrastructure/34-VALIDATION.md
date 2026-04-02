---
phase: 34
slug: push-notification-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
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
| 34-01-00 | 01 | 1 | ALL | stub | `pnpm test:run tests/lib/push/ tests/lib/validations/push.test.ts tests/app/api/push/ tests/components/settings/notification-settings.test.tsx` | ✅ W0 | ⬜ pending |
| 34-01-01 | 01 | 1 | PUSH-05 | unit | `pnpm test:run tests/lib/push/vapid.test.ts` | ✅ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | PUSH-04 | unit | `pnpm test:run tests/lib/validations/push.test.ts` | ✅ W0 | ⬜ pending |
| 34-01-03 | 01 | 1 | PUSH-03 | unit | `pnpm test:run tests/lib/push/notification-urls.test.ts` | ✅ W0 | ⬜ pending |
| 34-02-01 | 02 | 2 | PUSH-04 | unit | `pnpm test:run tests/app/api/push/subscribe.test.ts` | ✅ W0 | ⬜ pending |
| 34-02-02 | 02 | 2 | PUSH-04 | unit | `pnpm test:run tests/app/api/push/unsubscribe.test.ts` | ✅ W0 | ⬜ pending |
| 34-02-03 | 02 | 2 | PUSH-01, D-15 | unit | `pnpm test:run tests/app/api/push/subscriptions.test.ts` | ✅ W0 (via 34-06) | ⬜ pending |
| 34-03-01 | 03 | 2 | PUSH-01, PUSH-02 | manual | Browser push test | N/A | ⬜ pending |
| 34-04-01 | 04 | 3 | PUSH-01 | lint | `pnpm lint` | N/A | ⬜ pending |
| 34-04-02 | 04 | 3 | PUSH-01, D-15 | unit | `pnpm test:run tests/components/settings/notification-settings.test.tsx` | ✅ W0 | ⬜ pending |
| 34-04-03 | 04 | 3 | PUSH-01 | lint | `pnpm lint` | N/A | ⬜ pending |
| 34-05-01 | 05 | 4 | PUSH-05 | unit | `pnpm test:run tests/lib/push/vapid.test.ts` | ✅ W0 | ⬜ pending |
| 34-05-02 | 05 | 4 | PUSH-03 | unit | `pnpm test:run tests/lib/push/notification-urls.test.ts` | ✅ W0 | ⬜ pending |
| 34-05-03 | 05 | 4 | PUSH-04 | unit | `pnpm test:run tests/lib/validations/push.test.ts` | ✅ W0 | ⬜ pending |
| 34-06-01 | 06 | 4 | PUSH-04 | unit | `pnpm test:run tests/app/api/push/subscribe.test.ts` | ✅ W0 | ⬜ pending |
| 34-06-02 | 06 | 4 | PUSH-04, D-15 | unit | `pnpm test:run tests/app/api/push/unsubscribe.test.ts tests/app/api/push/subscriptions.test.ts` | ✅ W0 | ⬜ pending |
| 34-06-03 | 06 | 4 | PUSH-01, PUSH-02 | unit | `pnpm test:run tests/components/settings/notification-settings.test.tsx` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 stubs are created in task 34-01-00 (Plan 34-01, first task):

- [x] `tests/lib/push/vapid.test.ts` — stubs for PUSH-05 (VAPID config)
- [x] `tests/lib/push/notification-urls.test.ts` — stubs for PUSH-03 (notification URLs)
- [x] `tests/lib/validations/push.test.ts` — stubs for PUSH-04 (Zod schemas)
- [x] `tests/app/api/push/subscribe.test.ts` — stubs for PUSH-04 (subscribe API)
- [x] `tests/app/api/push/unsubscribe.test.ts` — stubs for PUSH-04 (unsubscribe API)
- [x] `tests/components/settings/notification-settings.test.tsx` — stubs for PUSH-01 (settings UI)

Note: `tests/app/api/push/subscriptions.test.ts` (device count GET route) is created in Plan 34-06 since the route itself is in Plan 34-02.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser permission prompt appears on toggle | PUSH-01 | Requires real browser Notification API | Enable push in settings, verify browser prompt |
| Service worker receives push and shows notification | PUSH-02 | Requires real push delivery | Use test notification button, verify native notification appears |
| Notification click navigates to correct page | PUSH-03 | Requires real notification interaction | Click notification, verify navigation to target URL |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
