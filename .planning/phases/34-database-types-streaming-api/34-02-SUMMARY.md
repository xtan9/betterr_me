---
phase: 34-database-types-streaming-api
plan: 02
subsystem: api
tags: [ai-sdk, openai, zod, streaming, react-markdown]

# Dependency graph
requires: []
provides:
  - "LLM provider config (lib/ai/provider.ts) pointing at llm.betterr.me/v1"
  - "Chat Zod validation schemas (lib/validations/chat.ts)"
  - "AI SDK packages (ai, @ai-sdk/openai, @ai-sdk/react)"
  - "Markdown rendering packages (react-markdown, remark-gfm)"
affects: [34-03-streaming-api, 35-chat-ui]

# Tech tracking
tech-stack:
  added: [ai@6.0.144, "@ai-sdk/openai@3.0.50", "@ai-sdk/react@3.0.146", react-markdown@10.1.0, remark-gfm@4.0.1]
  patterns: [createOpenAI-provider-config, chat-message-zod-schema]

key-files:
  created: [lib/ai/provider.ts, lib/validations/chat.ts, tests/lib/validations/chat.test.ts]
  modified: [package.json, pnpm-lock.yaml]

key-decisions:
  - "React bumped to 19.2.4 (exceeds 19.1.2+ requirement for @ai-sdk/react peer dep)"
  - "Empty string fallback for LLM_API_KEY to avoid undefined crashes at import time"

patterns-established:
  - "LLM provider: createOpenAI with env-based baseURL and apiKey"
  - "Chat validation: chatMessageSchema for individual messages, sendChatSchema for API input"

requirements-completed: [CHAT-01, CHAT-04]

# Metrics
duration: 4min
completed: 2026-04-02
---

# Phase 34 Plan 02: AI SDK Packages & Provider Config Summary

**Installed AI SDK + markdown packages, configured OpenAI-compatible LLM provider for llm.betterr.me/v1, and created Zod chat validation schemas with 13 tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-02T21:52:44Z
- **Completed:** 2026-04-02T21:56:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed ai, @ai-sdk/openai, @ai-sdk/react, react-markdown, remark-gfm
- Bumped React/react-dom to 19.2.4 and Zod to 3.25.76
- Created LLM provider config pointing at llm.betterr.me/v1
- Created Zod schemas (chatMessageSchema, sendChatSchema) with role validation, content limits, message count limits, and optional UUID conversationId
- 13 validation tests all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages and bump React** - `0439b5f` (chore)
2. **Task 2 RED: Failing tests for chat validation** - `a1d1d94` (test)
3. **Task 2 GREEN: LLM provider config and chat schemas** - `641e17f` (feat)

## Files Created/Modified
- `package.json` - Added 5 new dependencies, bumped react/react-dom/zod
- `pnpm-lock.yaml` - Lock file updated
- `lib/ai/provider.ts` - createOpenAI provider config with env-based baseURL and apiKey
- `lib/validations/chat.ts` - chatMessageSchema, sendChatSchema, SendChatInput type
- `tests/lib/validations/chat.test.ts` - 13 tests covering all validation cases

## Decisions Made
- React bumped to 19.2.4 (latest available, exceeds 19.1.2+ minimum for @ai-sdk/react)
- Empty string fallback for LLM_API_KEY avoids undefined crashes; actual key required at runtime

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm build` fails due to missing Supabase env vars in this worktree -- pre-existing issue not caused by our changes (verified by testing build before and after package changes). Not a regression.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- lib/ai/provider.ts ready for import by streaming API route (Plan 03)
- lib/validations/chat.ts ready for request validation in API route
- react-markdown and @ai-sdk/react ready for Phase 35 chat UI

## Self-Check: PASSED

All files created exist. All commit hashes verified in git log.

---
*Phase: 34-database-types-streaming-api*
*Completed: 2026-04-02*
