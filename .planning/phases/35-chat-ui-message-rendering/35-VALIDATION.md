---
phase: 35
slug: chat-ui-message-rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + Testing Library (jsdom) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test:run -- tests/components/chat/` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:run -- tests/components/chat/`
- **After every plan wave:** Run `pnpm test:run && pnpm lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | CHAT-02 | unit | `pnpm test:run -- tests/components/chat/markdown-renderer.test.tsx` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | INTG-03 | unit | `pnpm test:run -- tests/components/chat/message-bubble.test.tsx` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | CHAT-03 | unit | `pnpm test:run -- tests/components/chat/chat-content.test.tsx` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 1 | INTG-04 | unit | `pnpm test:run -- tests/components/chat/chat-input.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/components/chat/markdown-renderer.test.tsx` — stubs for CHAT-02
- [ ] `tests/components/chat/chat-content.test.tsx` — stubs for CHAT-03
- [ ] `tests/components/chat/message-bubble.test.tsx` — stubs for INTG-03
- [ ] `tests/components/chat/chat-input.test.tsx` — stubs for INTG-04
- [ ] `tests/components/chat/chat-empty-state.test.tsx` — covers empty state rendering

*Existing infrastructure covers test framework — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dark mode visual correctness | INTG-03 | Token usage verified in unit tests, but visual rendering needs human eye | Toggle dark mode, verify chat bubbles/input/empty state look correct |
| IME composition (CJK input) | INTG-04 | isComposing behavior varies by browser/OS | Type CJK characters, verify Enter during composition does NOT send |
| Streaming cursor animation | CHAT-02 | CSS animation timing is visual | Send a message, verify blinking cursor appears during streaming |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
