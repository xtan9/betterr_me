---
phase: 36
slug: conversation-persistence-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.1 + Testing Library |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test:run --reporter=verbose` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:run --reporter=verbose`
- **After every plan wave:** Run `pnpm test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | CONV-01, CONV-03 | unit | `pnpm test:run tests/api/conversations.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | CONV-03 | unit | `pnpm test:run tests/api/chat-messages.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 2 | CONV-02, CONV-03 | unit | `pnpm test:run tests/components/chat/` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 2 | CONV-04 | unit | `pnpm test:run tests/api/title-generation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green �� ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/api/conversations.test.ts` — stubs for CONV-01, CONV-03 (conversation CRUD API)
- [ ] `tests/api/chat-messages.test.ts` — stubs for CONV-03 (message persistence API)
- [ ] `tests/components/chat/` — stubs for CONV-02 (conversation list UI)

*Existing test infrastructure (Vitest + Testing Library + setup.ts with Supabase mocks) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conversation persists across page refresh | CONV-03 | Requires full browser session | 1. Send message 2. Refresh page 3. Verify messages still visible |
| Auto-title appears in sidebar | CONV-04 | Requires LLM proxy response | 1. Start new conversation 2. Send message 3. Wait for response 4. Verify title in sidebar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
