# Phase 34: Database, Types & Streaming API - Research

**Researched:** 2026-04-02
**Domain:** Supabase schema, TypeScript types, Zod validation, AI SDK streaming API route
**Confidence:** HIGH

## Summary

Phase 34 establishes the data layer and streaming API for the AI chat feature. It creates two Supabase tables (`conversations`, `chat_messages`) with RLS policies, TypeScript types and Zod validation schemas, DB classes following existing project patterns, an AI SDK provider configuration pointing at the `llm.betterr.me` proxy, and a `POST /api/chat` streaming endpoint. No UI is built in this phase -- the API should be testable with curl.

The existing codebase provides strong patterns to follow: DB classes with constructor-injected Supabase client, Zod validation schemas per domain, API route auth via `createClient()` + `getUser()`, and migration files with sequential naming. The AI SDK v6 (`ai` package) provides `streamText()` and `toDataStreamResponse()` for the streaming endpoint. The `@ai-sdk/openai` package connects to the `llm.betterr.me` proxy via `createOpenAI({ baseURL })`.

**Primary recommendation:** Follow existing codebase patterns exactly for DB classes, types, validations, and API route auth. Use AI SDK `streamText()` for the streaming endpoint. Auth check MUST happen before the stream constructor (Next.js footgun). Set streaming-specific headers (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`) on the response.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Single `POST /api/chat` endpoint using AI SDK `streamText()` with `toDataStreamResponse()`
- **D-02:** Endpoint accepts `{ messages: Message[], conversationId?: string }` -- conversationId optional for Phase 34
- **D-03:** Auth follows existing pattern: `createClient()` -> `supabase.auth.getUser()` -> 401 if no user -- auth MUST happen before stream constructor
- **D-04:** Route file at `app/api/chat/route.ts`
- **D-05:** `conversations` table: `id (uuid PK)`, `user_id (uuid FK -> auth.users)`, `title (text, nullable)`, `model (text, default 'claude-sonnet-4-20250514')`, `created_at`, `updated_at`
- **D-06:** `chat_messages` table: `id (uuid PK)`, `conversation_id (uuid FK -> conversations ON DELETE CASCADE)`, `role (text, check in ('user','assistant','system'))`, `content (text)`, `created_at`
- **D-07:** RLS policies using existing IN-subquery pattern: `user_id IN (SELECT auth.uid())`
- **D-08:** DB classes: `ConversationsDB` and `ChatMessagesDB` following existing pattern
- **D-09:** Use AI SDK built-in error handling -- `streamText()` errors propagate via `toDataStreamResponse()`
- **D-10:** Wrap proxy call in try/catch for network-level failures -- return JSON error with status 502
- **D-11:** Set `maxDuration: 60` export on route for Vercel function timeout
- **D-12:** Pass `request.signal` to abort upstream fetch when client disconnects
- **D-13:** Use `@ai-sdk/openai` with `createOpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY })` -- NOT `@ai-sdk/openai-compatible`
- **D-14:** Model configurable via `LLM_MODEL` env var, default `claude-sonnet-4-20250514`
- **D-15:** `maxTokens: 4096` default, configurable via `LLM_MAX_TOKENS` env var
- **D-16:** No system prompt in Phase 34 -- plain assistant behavior
- **D-17:** Provider config in `lib/ai/provider.ts` -- single source of truth
- **D-18:** Set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` on streaming response
- **D-19:** Install: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `react-markdown`, `remark-gfm`
- **D-20:** Bump React from 19.1.0 to 19.1.2+ (peer dep for @ai-sdk/react)
- **D-21:** Zod lockfile refresh to 3.25.76+ (peer dep for ai package)

### Claude's Discretion
- Migration file naming and numbering
- Exact Zod schema field constraints (max lengths, etc.)
- Unit test structure and mocking approach for streaming

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User can send a message and receive a streaming response from Claude | AI SDK `streamText()` + `toDataStreamResponse()` in `POST /api/chat` route, provider config via `createOpenAI({ baseURL })` pointing at llm.betterr.me |
| CHAT-04 | User sees an error message with retry button when the LLM proxy fails | Network-level try/catch returning 502 JSON error for proxy failures; AI SDK propagates LLM errors via stream; descriptive error messages for common failure modes |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Git workflow:** Create feature branch and PR, never push to main
- **Testing:** Always add tests. DB classes and API route need unit tests
- **Documentation lookup:** Use context7-plugin first for library docs
- **Files:** kebab-case. Components: PascalCase. DB classes: PascalCase + DB suffix
- **API error handling:** try/catch -> console.error -> NextResponse.json({ error }, { status })
- **Validation:** Zod schemas at API boundaries (lib/validations/)
- **Path alias:** `@/` maps to project root
- **Testing config:** Vitest + jsdom, setup file at tests/setup.ts, coverage threshold 50%
- **Supabase client:** Fresh server client per request, no singletons

## Standard Stack

### Core (New Packages for Phase 34)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.144 | `streamText`, `convertToModelMessages`, `UIMessage` types | Industry-standard streaming abstraction; handles SSE protocol, backpressure, error recovery |
| `@ai-sdk/openai` | ^3.0.50 | `createOpenAI` with custom baseURL for llm.betterr.me | Supports custom baseURL natively, no need for @ai-sdk/openai-compatible |
| `@ai-sdk/react` | ^3.0.146 | `useChat` hook (not used in Phase 34, but installed for Phase 35) | Peer dep of `ai`, needed for Phase 35 UI |
| `react-markdown` | ^10.1.0 | Markdown rendering (not used in Phase 34, installed for Phase 35) | Standard React markdown renderer |
| `remark-gfm` | ^4.0.1 | GFM support (not used in Phase 34, installed for Phase 35) | GFM tables, task lists, strikethrough |

### Peer Dependency Updates (Existing Packages)

| Package | Current | Target | Reason |
|---------|---------|--------|--------|
| `react` | 19.1.0 (spec: ^19.0.0) | 19.1.5 (spec: ^19.1.2) | `@ai-sdk/react` peer dep requires ~19.1.2 |
| `react-dom` | 19.1.0 | 19.1.5 | Must match react version |
| `zod` | 3.25.46 (spec: ^3.25.46) | 3.25.76+ | `ai` peer dep requires ^3.25.76; lockfile refresh only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@ai-sdk/openai` | `@ai-sdk/openai-compatible` | Compatible is for building reusable provider packages. `@ai-sdk/openai` with `createOpenAI({ baseURL })` is simpler for a single custom endpoint |
| AI SDK `streamText` | Raw `fetch` + `ReadableStream` + `eventsource-parser` | 200+ lines of hand-rolled streaming code vs. 5 lines with AI SDK. No type safety, no error protocol, no abort handling built-in |

**Installation:**
```bash
pnpm add ai @ai-sdk/react @ai-sdk/openai react-markdown remark-gfm
pnpm update react react-dom zod
```

**Version verification:** All versions confirmed via `npm view` on 2026-04-02. `ai@6.0.144`, `@ai-sdk/openai@3.0.50`, `@ai-sdk/react@3.0.146`, `react-markdown@10.1.0`, `remark-gfm@4.0.1`.

## Architecture Patterns

### Recommended Project Structure (Phase 34 scope only)
```
app/
  api/
    chat/
      route.ts            # POST: streaming chat completion
lib/
  ai/
    provider.ts           # createOpenAI config for llm.betterr.me
  db/
    conversations.ts      # ConversationsDB class
    chat-messages.ts      # ChatMessagesDB class
    types.ts              # +Conversation, ChatMessage, insert/update types
    index.ts              # +export ConversationsDB, ChatMessagesDB
  validations/
    chat.ts               # Zod schemas for chat API
supabase/
  migrations/
    20260402000001_create_chat_tables.sql  # conversations + chat_messages
tests/
  lib/db/
    conversations.test.ts
    chat-messages.test.ts
  app/api/chat/
    route.test.ts
```

### Pattern 1: DB Class (Existing Pattern -- Follow Exactly)

**What:** Each domain has a DB class that takes a `SupabaseClient` in its constructor and exposes typed async methods. This is the universal pattern across all 20+ existing DB classes.

**Example:**
```typescript
// lib/db/conversations.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, ConversationInsert } from './types';

export class ConversationsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async createConversation(conversation: ConversationInsert): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .insert(conversation)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  // ... more methods
}
```

### Pattern 2: API Route Auth-Then-Stream

**What:** Auth check happens BEFORE the stream constructor. This is critical because `cookies()` from `next/headers` is not available inside a `ReadableStream` controller callback.

**Example:**
```typescript
// app/api/chat/route.ts
import { streamText, UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { llmProvider } from '@/lib/ai/provider';

export const maxDuration = 60;

export async function POST(req: Request) {
  // 1. Auth FIRST (cookies() available here)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse + validate request
  const { messages } = await req.json();

  // 3. Stream (try/catch for network-level proxy failures)
  try {
    const result = streamText({
      model: llmProvider(process.env.LLM_MODEL || 'claude-sonnet-4-20250514'),
      messages,
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
      abortSignal: req.signal,
    });

    return result.toDataStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to reach AI service. Please try again.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Pattern 3: AI SDK Provider Config

**What:** Single-file provider configuration wrapping `createOpenAI` with env-var-driven settings.

**Example:**
```typescript
// lib/ai/provider.ts
import { createOpenAI } from '@ai-sdk/openai';

export const llmProvider = createOpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://llm.betterr.me/v1',
  apiKey: process.env.LLM_API_KEY || '',
});
```

### Pattern 4: Zod Validation Schema (Existing Pattern)

**What:** One validation file per domain in `lib/validations/`. Schemas define API input shape and constraints.

**Example:**
```typescript
// lib/validations/chat.ts
import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message cannot be empty').max(32000, 'Message too long'),
});

export const sendChatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message required').max(100, 'Too many messages'),
  conversationId: z.string().uuid().optional(),
});

export type SendChatInput = z.infer<typeof sendChatSchema>;
```

### Anti-Patterns to Avoid

- **Auth inside stream controller:** `cookies()` is not available inside `ReadableStream` callbacks. Always check auth before constructing the stream.
- **Singleton DB class instances:** The codebase requires fresh `createClient()` per request. Never create DB class instances at module level.
- **`NEXT_PUBLIC_` prefix on LLM env vars:** API key must stay server-only. The browser talks only to `/api/chat`, never to `llm.betterr.me` directly.
- **`export const runtime = 'edge'`:** Supabase SSR client uses `cookies()` which requires Node.js runtime. All existing routes use Node.js runtime (the default).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming protocol | Custom `ReadableStream` + `eventsource-parser` | AI SDK `streamText()` + `toDataStreamResponse()` | Handles chunked encoding, event parsing, backpressure, abort signals, error frames |
| Chat request validation | Manual field checks | Zod schema via `validateRequestBody()` from `lib/validations/api.ts` | Project-standard pattern, consistent error format, type inference |
| OpenAI-compatible API client | Raw `fetch` to llm.betterr.me | `@ai-sdk/openai` `createOpenAI({ baseURL })` | Handles auth headers, streaming, model params, error mapping |
| UUID generation for DB | `crypto.randomUUID()` in app code | Supabase `gen_random_uuid()` default | Database handles ID generation consistently |

## Common Pitfalls

### Pitfall 1: Auth Check Inside Stream Constructor
**What goes wrong:** `cookies()` unavailable in `ReadableStream` callback, auth silently fails
**Why it happens:** Developer puts all logic inside the stream start callback for "clean flow"
**How to avoid:** Auth-then-stream pattern (D-03). Check user before constructing any stream.
**Warning signs:** 500 errors only on chat route, not on other API routes

### Pitfall 2: Streaming Response Buffered in Production
**What goes wrong:** Tokens arrive all at once instead of incrementally on Vercel
**Why it happens:** Compression/caching layers buffer SSE responses
**How to avoid:** Set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` headers (D-18)
**Warning signs:** Works locally but batches in production

### Pitfall 3: Missing Abort Signal Propagation
**What goes wrong:** Server-side stream continues consuming tokens after client disconnects
**Why it happens:** `req.signal` not passed to `streamText()`
**How to avoid:** Pass `abortSignal: req.signal` to streamText options (D-12)
**Warning signs:** Vercel function duration logs show long-running functions after user navigates away

### Pitfall 4: Proxy Network Failure Not Caught
**What goes wrong:** If llm.betterr.me is unreachable, the error bubbles as an unhandled rejection
**Why it happens:** `streamText()` throws on DNS/TCP failures before the stream starts
**How to avoid:** Wrap streamText in try/catch, return 502 with descriptive error (D-10)
**Warning signs:** 500 Internal Server Error when proxy is down

### Pitfall 5: RLS Policy on chat_messages Using Direct auth.uid()
**What goes wrong:** Policy checks `auth.uid()` on `chat_messages` but the table has no `user_id` column
**Why it happens:** Copy-paste from other table policies without adapting to FK relationship
**How to avoid:** Use IN-subquery pattern: `conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())` (D-07)
**Warning signs:** RLS policy returns zero rows for messages in own conversations

### Pitfall 6: toUIMessageStreamResponse vs toDataStreamResponse
**What goes wrong:** Using `toUIMessageStreamResponse()` when `useChat` on the client expects the data stream protocol
**Why it happens:** AI SDK v6 has two stream response methods with different wire protocols
**How to avoid:** Use `toDataStreamResponse()` (D-01) -- this is the standard protocol that `useChat()` consumes via `DefaultChatTransport`
**Warning signs:** Client receives garbled/unparseable stream data

## Code Examples

### Migration SQL
```sql
-- supabase/migrations/20260402000001_create_chat_tables.sql

-- conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations"
  ON conversations FOR ALL
  USING (user_id IN (SELECT auth.uid()));

-- chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_conv_created ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage messages in own conversations"
  ON chat_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id IN (SELECT auth.uid())
  ));

-- Trigger: update conversations.updated_at when messages are inserted
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_message_update_conversation
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
```

### TypeScript Types (matches existing pattern in lib/db/types.ts)
```typescript
// Add to lib/db/types.ts

// =============================================================================
// CONVERSATIONS
// =============================================================================

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}

export type ConversationInsert = {
  user_id: string;
  title?: string | null;
  model?: string;
};

export type ConversationUpdate = Partial<Pick<Conversation, 'title' | 'model'>>;

// =============================================================================
// CHAT MESSAGES
// =============================================================================

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export type ChatMessageInsert = {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};
```

### DB Class Test Pattern (matches existing tests/app/api/habits/route.test.ts)
```typescript
// tests/app/api/chat/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/chat/route';

const { mockStreamText } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
}));

vi.mock('ai', () => ({
  streamText: mockStreamText,
}));

vi.mock('@/lib/ai/provider', () => ({
  llmProvider: vi.fn(() => 'mock-model'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123' } },
      })),
    },
  })),
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 for unauthenticated requests', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    });
    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it('should call streamText with correct params', async () => {
    const mockResponse = new Response('streamed data');
    mockStreamText.mockReturnValue({
      toDataStreamResponse: vi.fn(() => mockResponse),
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const response = await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.anything(),
        messages: expect.any(Array),
      })
    );
    expect(response).toBe(mockResponse);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `toUIMessageStreamResponse()` | `toDataStreamResponse()` | AI SDK v6 | Data stream is the default protocol; UIMessage stream is for advanced multi-part usage |
| `@ai-sdk/openai-compatible` for custom endpoints | `@ai-sdk/openai` with `createOpenAI({ baseURL })` | AI SDK v6 | `@ai-sdk/openai` supports custom baseURL directly, no need for compatible wrapper |
| Manual SSE parsing | AI SDK handles internally | AI SDK v6 | `streamText()` manages the full SSE lifecycle |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (jsdom) |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test:run` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | Streaming response from Claude via API | unit | `pnpm vitest run tests/app/api/chat/route.test.ts` | Wave 0 |
| CHAT-01 | DB classes create/read conversations and messages | unit | `pnpm vitest run tests/lib/db/conversations.test.ts tests/lib/db/chat-messages.test.ts` | Wave 0 |
| CHAT-01 | Zod schemas validate chat input correctly | unit | `pnpm vitest run tests/lib/validations/chat.test.ts` | Wave 0 |
| CHAT-04 | API returns 502 with error message when proxy unreachable | unit | `pnpm vitest run tests/app/api/chat/route.test.ts` | Wave 0 |
| CHAT-04 | API returns 401 for unauthenticated requests | unit | `pnpm vitest run tests/app/api/chat/route.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run tests/app/api/chat/ tests/lib/db/conversations.test.ts tests/lib/db/chat-messages.test.ts`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `tests/lib/db/conversations.test.ts` -- covers ConversationsDB CRUD
- [ ] `tests/lib/db/chat-messages.test.ts` -- covers ChatMessagesDB CRUD
- [ ] `tests/app/api/chat/route.test.ts` -- covers auth, streaming, error handling
- [ ] `tests/lib/validations/chat.test.ts` -- covers Zod schema validation

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Package installation | Needs verify | 10.11 expected | npm |
| Supabase CLI | Migration application | Needs verify | -- | Manual SQL in Supabase dashboard |
| llm.betterr.me | Streaming API endpoint | External service | -- | Test with mock; verify live in integration test |
| LLM_API_KEY | API authentication | .env.local | -- | Must be present; no fallback |
| LLM_BASE_URL | Provider config | .env.local | -- | Defaults to https://llm.betterr.me/v1 |

**Missing dependencies with no fallback:**
- `LLM_API_KEY` must exist in `.env.local` for the streaming endpoint to function

**Missing dependencies with fallback:**
- Supabase CLI (migration can be applied via dashboard if CLI unavailable)

## Open Questions

1. **`toDataStreamResponse` header injection**
   - What we know: D-18 requires `Cache-Control` and `X-Accel-Buffering` headers on the streaming response
   - What's unclear: Whether `toDataStreamResponse()` accepts a `headers` option or if headers must be set on a custom `Response` wrapper
   - Recommendation: Check AI SDK docs at implementation time. The STACK.md research shows `toDataStreamResponse({ headers: {...} })` pattern but this needs verification against the actual API

2. **`streamText` try/catch scope for network errors**
   - What we know: D-10 says wrap in try/catch for network-level failures
   - What's unclear: Whether `streamText()` throws synchronously on DNS/TCP failures or if errors propagate through the stream
   - Recommendation: The try/catch around the entire `streamText()` + `toDataStreamResponse()` call covers both cases. Test with an intentionally wrong `LLM_BASE_URL` value.

## Sources

### Primary (HIGH confidence)
- Existing codebase inspection: `lib/db/tasks.ts`, `app/api/habits/route.ts`, `tests/app/api/habits/route.test.ts`, `lib/validations/habit.ts`, `lib/validations/api.ts` -- established patterns
- `.planning/research/STACK.md` -- verified package versions and provider config
- `.planning/research/ARCHITECTURE.md` -- system overview and data flow
- `.planning/research/PITFALLS.md` -- streaming, auth, abort handling pitfalls
- npm registry (2026-04-02): `ai@6.0.144`, `@ai-sdk/openai@3.0.50`, `@ai-sdk/react@3.0.146`

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` -- executive summary with roadmap structure
- AI SDK official docs at ai-sdk.dev -- streamText, toDataStreamResponse, createOpenAI

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- versions verified against npm registry, peer deps documented
- Architecture: HIGH -- follows existing codebase patterns exactly, no novel patterns
- Pitfalls: HIGH -- well-documented in prior research, all addressable with known mitigations
- Test structure: HIGH -- follows existing test file patterns and mock setup

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, 30-day validity)
