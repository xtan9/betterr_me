---
phase: 29
slug: database-schema-infrastructure-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| 29-01-01 | 01 | 1 | INFR-01 | migration | `[ $(grep -c "CREATE TABLE" supabase/migrations/20260331000001_create_calendar_events.sql) -eq 4 ] && echo PASS` | shell | ⬜ pending |
| 29-01-02 | 01 | 1 | INFR-02 | migration | `grep -q "timezone" lib/db/types.ts && echo PASS` | shell | ⬜ pending |
| 29-02-01 | 02 | 1 | INFR-03 | unit | `pnpm test:run tests/lib/db/calendar-events.test.ts` | TDD | ⬜ pending |
| 29-02-02 | 02 | 1 | INFR-04 | unit | `pnpm test:run tests/lib/db/reminders.test.ts` | TDD | ⬜ pending |
| 29-02-03 | 02 | 1 | INFR-05 | unit | `pnpm test:run tests/lib/db/push-subscriptions.test.ts` | TDD | ⬜ pending |
| 29-02-04 | 02 | 1 | INFR-06 | unit | `pnpm test:run tests/lib/db/reminder-defaults.test.ts` | TDD | ⬜ pending |
| 29-03-01 | 03 | 2 | INFR-07 | unit | `pnpm test:run tests/lib/validations/calendar-events.test.ts` | TDD | ⬜ pending |
| 29-03-02 | 03 | 2 | INFR-07 | unit | `pnpm test:run tests/lib/validations/reminders.test.ts` | TDD | ⬜ pending |
| 29-04-01 | 04 | 2 | INFR-08 | shell | `test -f public/sw.js && grep -q "addEventListener.*push" public/sw.js && echo PASS` | shell | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — all test files are created inline by TDD tasks in Plans 02, 03. Shell-based verify commands are used for Plans 01 and 04 (migration and service worker tasks).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Service worker registers | INFR-08 | Browser API required | Open dev console → Application → Service Workers → verify sw.js registered |
| Timezone auto-detection | INFR-01 | Browser Intl API required | Clear profile timezone → reload → verify timezone populated |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or shell-based verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not needed — TDD tasks self-create test files, others use shell verify
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-30
