---
phase: 34
slug: push-notification-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 34-01-01 | 01 | 1 | PUSH-05 | unit | `pnpm test:run tests/lib/push/vapid.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | PUSH-04 | unit | `pnpm test:run tests/api/push/subscribe.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 1 | PUSH-04 | unit | `pnpm test:run tests/api/push/unsubscribe.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 2 | PUSH-01 | unit | `pnpm test:run tests/hooks/use-push-notifications.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 2 | PUSH-01 | unit | `pnpm test:run tests/components/settings/notification-settings.test.ts` | ❌ W0 | ⬜ pending |
| 34-03-01 | 03 | 2 | PUSH-02, PUSH-03 | manual | Browser push test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/push/vapid.test.ts` — stubs for PUSH-05 (VAPID config)
- [ ] `tests/api/push/subscribe.test.ts` — stubs for PUSH-04 (subscribe API)
- [ ] `tests/api/push/unsubscribe.test.ts` — stubs for PUSH-04 (unsubscribe API)
- [ ] `tests/hooks/use-push-notifications.test.ts` — stubs for PUSH-01 (permission flow hook)
- [ ] `tests/components/settings/notification-settings.test.ts` — stubs for PUSH-01 (settings UI)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser permission prompt appears on toggle | PUSH-01 | Requires real browser Notification API | Enable push in settings, verify browser prompt |
| Service worker receives push and shows notification | PUSH-02 | Requires real push delivery | Use test notification button, verify native notification appears |
| Notification click navigates to correct page | PUSH-03 | Requires real notification interaction | Click notification, verify navigation to target URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
