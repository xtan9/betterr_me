---
phase: 35
slug: email-notification-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 35 — Validation Strategy

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
| 35-01-01 | 01 | 1 | MAIL-01 | unit | `pnpm test:run tests/lib/email` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | MAIL-02 | unit | `pnpm test:run tests/lib/email` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | MAIL-04 | unit | `pnpm test:run tests/emails` | ❌ W0 | ⬜ pending |
| 35-03-01 | 03 | 2 | MAIL-03 | unit | `pnpm test:run tests/app/api/email` | ❌ W0 | ⬜ pending |
| 35-04-01 | 04 | 2 | MAIL-01 | unit | `pnpm test:run tests/components/settings` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/email/resend.test.ts` — stubs for Resend client and send utility
- [ ] `tests/lib/email/unsubscribe.test.ts` — stubs for HMAC token generation/verification
- [ ] `tests/emails/templates.test.tsx` — stubs for React Email template rendering
- [ ] `tests/app/api/email/unsubscribe.test.ts` — stubs for unsubscribe API route
- [ ] `tests/components/settings/notification-settings.test.tsx` — already exists, extend for email toggle

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email actually received in inbox | MAIL-02 | Requires Resend API key and real email delivery | Send test email via Resend test mode, verify inbox receipt |
| Unsubscribe link works end-to-end | MAIL-03 | Requires running server and browser interaction | Click unsubscribe link, verify profile updated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
