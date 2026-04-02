---
phase: 34
slug: database-types-streaming-api
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
| **Framework** | vitest (jsdom, globals) |
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
| 34-01-01 | 01 | 1 | CHAT-01 | unit | `pnpm test:run tests/lib/db/conversations.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | CHAT-01 | unit | `pnpm test:run tests/lib/db/chat-messages.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 2 | CHAT-01 | unit | `pnpm test:run tests/lib/validations/chat.test.ts` | ❌ W0 | ⬜ pending |
| 34-03-01 | 03 | 3 | CHAT-01, CHAT-04 | unit | `pnpm test:run tests/app/api/chat/route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/db/conversations.test.ts` — stubs for ConversationsDB
- [ ] `tests/lib/db/chat-messages.test.ts` — stubs for ChatMessagesDB
- [ ] `tests/lib/validations/chat.test.ts` — stubs for chat Zod schemas
- [ ] `tests/app/api/chat/route.test.ts` — stubs for streaming API route

*Existing test infrastructure covers all framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Streaming response displays token-by-token | CHAT-01 | Requires browser for SSE rendering | POST to /api/chat with curl --no-buffer, verify chunks arrive incrementally |
| Vercel production streaming (no buffering) | CHAT-01 | Requires Vercel preview deploy | Deploy to preview, verify streaming works without compression buffering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
