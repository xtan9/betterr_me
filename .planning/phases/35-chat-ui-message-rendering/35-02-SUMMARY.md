---
phase: 35-chat-ui-message-rendering
plan: 02
subsystem: ui
tags: [react, chat, ai-sdk, streaming, useChat, i18n, next-intl, auth]

# Dependency graph
requires:
  - phase: 35-chat-ui-message-rendering
    plan: 01
    provides: Leaf components (MessageList, ChatInput, ChatEmptyState, MessageBubble, MarkdownRenderer)
  - phase: 34-ai-chat-foundation
    provides: /api/chat streaming endpoint, AI SDK types
provides:
  - ChatContent orchestrator component
  - Chat page with auth guard
  - Chat layout with SidebarShell
affects:
  - app/chat/ route (new)
  - components/chat/ (new orchestrator)

# Tech stack
added: []
patterns:
  - useChat hook with TextStreamChatTransport for streaming
  - useMemo for transport instance stability
  - Server component auth guard with redirect
  - i18n via useTranslations for all user-visible strings

# Key files
created:
  - components/chat/chat-content.tsx
  - app/chat/page.tsx
  - app/chat/layout.tsx
  - tests/components/chat/chat-content.test.tsx
modified: []

# Decisions
key-decisions:
  - Always show translated error.generic instead of raw error.message for consistent UX
  - Retry sends last user message text (not re-send the request object)
  - isStreaming covers both submitted and streaming statuses

# Metrics
duration_seconds: 205
completed: "2026-04-03T20:57:28Z"
tasks_completed: 1
tasks_total: 1
test_count: 9
files_created: 4
files_modified: 0
---

# Phase 35 Plan 02: ChatContent Orchestrator, Chat Page & Layout Summary

ChatContent orchestrator wiring useChat with TextStreamChatTransport to /api/chat, auth-gated server page, SidebarShell layout, and 9 integration tests covering streaming, stop, error, retry, and empty state flows.

## What Was Built

### ChatContent Orchestrator (`components/chat/chat-content.tsx`)
- Client component using `useChat` from `@ai-sdk/react` with `TextStreamChatTransport` from `ai`
- Transport created via `useMemo` to prevent re-instantiation on re-renders (Pitfall 2 from research)
- Conditionally renders `ChatEmptyState` when no messages, `MessageList` when messages exist (D-13/D-14)
- Error banner with translated `error.generic` message and `error.retry` button using `useTranslations('chat')`
- Retry sends the last user message text via `sendMessage({ text })`
- `isStreaming` derived from `status === 'submitted' || status === 'streaming'`
- Passes `onSend`, `onStop`, `isStreaming` to `ChatInput`

### Chat Page (`app/chat/page.tsx`)
- Server component (no "use client") following dashboard page pattern
- Auth guard: checks `supabase.auth.getUser()`, redirects to `/auth/login` if unauthenticated
- Renders `<ChatContent />` for authenticated users

### Chat Layout (`app/chat/layout.tsx`)
- Server component wrapping children in `SidebarShell` for consistent navigation

### Integration Tests (`tests/components/chat/chat-content.test.tsx`)
- 9 tests covering: empty state rendering, message list rendering, sendMessage calls, isStreaming prop forwarding (streaming + submitted statuses), stop() calls, error state with translated text, retry button functionality
- Mocks: `useChat` via `vi.hoisted`, leaf components with data-testid divs, `next-intl` returning keys

## TDD Execution

- **RED:** 9 failing tests committed (component did not exist)
- **GREEN:** Implementation created, all 9 tests pass
- **REFACTOR:** No refactoring needed -- code is clean

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| bbd3b16 | test | Add failing tests for ChatContent orchestrator (RED) |
| 31a0d4d | feat | Implement ChatContent orchestrator, ChatPage, and ChatLayout (GREEN) |

## Verification

- `pnpm vitest run tests/components/chat/chat-content.test.tsx` -- 9/9 pass
- `pnpm lint` -- 0 errors (17 pre-existing warnings)
- All acceptance criteria verified via grep checks

## Known Stubs

None -- all components are fully wired with real data sources.

## Self-Check: PASSED
