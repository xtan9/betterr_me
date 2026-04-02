# Phase 34: Database, Types & Streaming API - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Supabase database tables for conversations and messages, TypeScript types and Zod validation schemas, AI SDK provider configuration pointing at llm.betterr.me/v1, and a streaming POST /api/chat endpoint with Supabase auth and error handling. No UI in this phase — the API should be testable with curl.

</domain>

<decisions>
## Implementation Decisions

### API Route Design
- **D-01:** Single `POST /api/chat` endpoint using AI SDK `streamText()` with `toDataStreamResponse()`
- **D-02:** Endpoint accepts `{ messages: Message[], conversationId?: string }` — conversationId optional for Phase 34 (persistence wired in Phase 36)
- **D-03:** Auth follows existing pattern: `createClient()` → `supabase.auth.getUser()` → 401 if no user — auth MUST happen before stream constructor (Next.js footgun)
- **D-04:** Route file at `app/api/chat/route.ts`

### DB Schema Design
- **D-05:** `conversations` table: `id (uuid PK)`, `user_id (uuid FK → auth.users)`, `title (text, nullable)`, `model (text, default 'claude-sonnet-4-20250514')`, `created_at`, `updated_at`
- **D-06:** `chat_messages` table: `id (uuid PK)`, `conversation_id (uuid FK → conversations ON DELETE CASCADE)`, `role (text, check in ('user','assistant','system'))`, `content (text)`, `created_at`
- **D-07:** RLS policies using existing IN-subquery pattern: `user_id IN (SELECT auth.uid())`
- **D-08:** DB classes: `ConversationsDB` and `ChatMessagesDB` following existing pattern (constructor takes Supabase client)

### Error Handling Strategy
- **D-09:** Use AI SDK built-in error handling — `streamText()` errors propagate via `toDataStreamResponse()`
- **D-10:** Wrap proxy call in try/catch for network-level failures (proxy down, DNS failure) — return JSON error with status 502
- **D-11:** Set `maxDuration: 60` export on route for Vercel function timeout
- **D-12:** Pass `request.signal` to abort upstream fetch when client disconnects

### AI SDK Provider Config
- **D-13:** Use `@ai-sdk/openai` with `createOpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY })` — NOT `@ai-sdk/openai-compatible`
- **D-14:** Model configurable via `LLM_MODEL` env var, default `claude-sonnet-4-20250514`
- **D-15:** `maxTokens: 4096` default, configurable via `LLM_MAX_TOKENS` env var
- **D-16:** No system prompt in Phase 34 — plain assistant behavior
- **D-17:** Provider config in `lib/ai/provider.ts` — single source of truth

### Streaming Headers
- **D-18:** Set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` on streaming response to prevent Vercel compression buffering

### Package Dependencies
- **D-19:** Install: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `react-markdown`, `remark-gfm`
- **D-20:** Bump React from 19.1.0 to 19.1.2+ (peer dep for @ai-sdk/react)
- **D-21:** Zod lockfile refresh to 3.25.76+ (peer dep for ai package)

### Claude's Discretion
- Migration file naming and numbering
- Exact Zod schema field constraints (max lengths, etc.)
- Unit test structure and mocking approach for streaming

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI SDK Integration
- `.planning/research/STACK.md` — Package versions, peer deps, provider config pattern
- `.planning/research/ARCHITECTURE.md` — System overview, data flow, component boundaries
- `.planning/research/PITFALLS.md` — Streaming buffering, auth ordering, abort handling

### Existing Patterns
- `lib/supabase/server.ts` — Server client creation pattern
- `lib/db/index.ts` — DB class export pattern
- `lib/db/types.ts` — TypeScript type definitions pattern
- `lib/validations/` — Zod schema file pattern
- `app/api/habits/route.ts` — API route auth + error handling pattern
- `supabase/migrations/` — Migration file naming pattern

### Research Summary
- `.planning/research/SUMMARY.md` — Executive summary with roadmap implications and gaps

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase/server.ts` (`createClient`): Server Supabase client with cookie-based auth — use for API route
- `lib/db/` pattern: All DB classes take `SupabaseClient` in constructor, expose typed methods
- `lib/validations/api.ts` (`validateRequestBody`): Shared request validation helper
- `lib/logger.ts`: Logger module for server-side error logging

### Established Patterns
- API routes: `createClient()` → `getUser()` → 401 check → DB class instantiation → try/catch → `NextResponse.json()`
- DB classes: PascalCase + DB suffix, constructor takes Supabase client, methods return typed data
- Zod schemas: One file per domain in `lib/validations/`, export form schema + API schema
- Migrations: Sequential numbering `YYYYMMDD000001_description.sql`
- RLS: IN-subquery pattern `user_id IN (SELECT auth.uid())`

### Integration Points
- `lib/db/index.ts` — New DB classes exported here
- `lib/db/types.ts` — New TypeScript interfaces added here
- `.env.local` — New env vars: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MAX_TOKENS`

</code_context>

<specifics>
## Specific Ideas

- LLM proxy at `https://llm.betterr.me/v1` is OpenAI-compatible (CLIProxyAPI with Claude subscription)
- API key already stored as `LLM_API_KEY` in `.env.local`
- Must verify streaming compatibility with AI SDK before building UI (Phase 35 depends on this working)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-database-types-streaming-api*
*Context gathered: 2026-04-02*
