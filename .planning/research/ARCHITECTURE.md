# Architecture Research

**Domain:** AI Chat Integration into Existing Next.js + Supabase App
**Researched:** 2026-04-02
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client (Browser)                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐    │
│  │  ChatPage     │  │  ChatInput    │  │  MessageList      │    │
│  │  (app/chat)   │  │  (textarea +  │  │  (scrollable,     │    │
│  │              │  │   send btn)   │  │   streaming text) │    │
│  └──────┬───────┘  └───────┬───────┘  └─────────┬─────────┘    │
│         │                  │                    │               │
│  ┌──────┴──────────────────┴────────────────────┴──────────┐    │
│  │            useChat() from @ai-sdk/react                  │    │
│  │  (manages messages[], streaming state, send/stop)        │    │
│  └──────────────────────────┬───────────────────────────────┘    │
├─────────────────────────────┼───────────────────────────────────┤
│                     API Layer                                    │
│  ┌──────────────────────────┴───────────────────────────────┐    │
│  │           POST /api/chat (Route Handler)                  │    │
│  │  1. Auth check (supabase.auth.getUser())                  │    │
│  │  2. Validate request body (Zod)                           │    │
│  │  3. Load/save conversation (ConversationsDB, MessagesDB)  │    │
│  │  4. streamText() via AI SDK -> LLM proxy                  │    │
│  │  5. Return streaming response                             │    │
│  └──────────────────────────┬───────────────────────────────┘    │
├─────────────────────────────┼───────────────────────────────────┤
│                     External Services                            │
│  ┌────────────────┐  ┌──────┴──────────┐                        │
│  │   Supabase     │  │  llm.betterr.me │                        │
│  │  (auth + DB)   │  │  (LLM proxy)    │                        │
│  │  conversations │  │  OpenAI-compat   │                        │
│  │  chat_messages │  │  /v1/chat/comp.  │                        │
│  └────────────────┘  └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Integration with Existing |
|-----------|----------------|--------------------------|
| `app/chat/page.tsx` | Server component, auth gate, load conversation list | Same pattern as `app/dashboard/page.tsx` -- server-side auth + data fetch |
| `app/chat/[id]/page.tsx` | Server component, load specific conversation | Same pattern as other detail pages |
| `components/chat/chat-panel.tsx` | Client component, `useChat()` hook, message rendering, input | New component, no existing equivalent |
| `app/api/chat/route.ts` | POST handler, auth + stream proxy to LLM | Same pattern as all API routes (createClient, getUser, DB class) |
| `lib/db/conversations.ts` | ConversationsDB class -- CRUD for conversations | Same DB class pattern as every other domain |
| `lib/db/chat-messages.ts` | ChatMessagesDB class -- CRUD for messages | Same DB class pattern |
| `lib/ai/provider.ts` | AI SDK provider config for llm.betterr.me | New module, thin config wrapper |
| `lib/validations/chat.ts` | Zod schemas for chat API requests | Same pattern as all other validations |

## New Files vs Modified Files

### New Files

| Path | Purpose |
|------|---------|
| `app/chat/page.tsx` | Chat page (conversation list + new chat) |
| `app/chat/[id]/page.tsx` | Single conversation page |
| `app/chat/layout.tsx` | Wraps `<SidebarShell>` (same as dashboard) |
| `app/api/chat/route.ts` | Streaming chat API route |
| `app/api/chat/conversations/route.ts` | CRUD for conversations list |
| `app/api/chat/conversations/[id]/route.ts` | Single conversation CRUD |
| `components/chat/chat-panel.tsx` | Main chat UI (useChat + messages + input) |
| `components/chat/message-bubble.tsx` | Single message rendering (user vs assistant) |
| `components/chat/message-list.tsx` | Scrollable message container with auto-scroll |
| `components/chat/chat-input.tsx` | Textarea + send button + keyboard handling |
| `components/chat/conversation-list.tsx` | Sidebar/panel listing past conversations |
| `components/chat/markdown-renderer.tsx` | Render assistant markdown responses |
| `lib/ai/provider.ts` | createOpenAICompatible config for llm.betterr.me |
| `lib/db/conversations.ts` | ConversationsDB class |
| `lib/db/chat-messages.ts` | ChatMessagesDB class |
| `lib/validations/chat.ts` | Zod schemas (sendMessage, createConversation) |
| `supabase/migrations/YYYYMMDD_create_chat_tables.sql` | conversations + chat_messages tables |

### Modified Files

| Path | Change | Scope |
|------|--------|-------|
| `components/layouts/app-sidebar.tsx` | Add chat nav item (`MessageSquare` icon, `/chat` route) to `mainNavItems` array | 5 lines added |
| `lib/db/index.ts` | Export ConversationsDB, ChatMessagesDB | 2 lines added |
| `lib/db/types.ts` | Add Conversation, ChatMessage, ConversationInsert, ChatMessageInsert interfaces | ~30 lines added |
| `i18n/messages/en.json` | Add `chat` namespace | ~15 keys |
| `i18n/messages/zh.json` | Add `chat` namespace | ~15 keys |
| `i18n/messages/zh-TW.json` | Add `chat` namespace | ~15 keys |

**No existing API routes, components, or database tables are modified.** The chat feature is entirely additive.

## Recommended Project Structure

```
app/
├── chat/
│   ├── layout.tsx              # SidebarShell wrapper
│   ├── page.tsx                # Conversation list / new chat start
│   └── [id]/
│       └── page.tsx            # Single conversation view
├── api/
│   └── chat/
│       ├── route.ts            # POST: stream chat completion
│       └── conversations/
│           ├── route.ts        # GET: list, POST: create
│           └── [id]/
│               └── route.ts    # GET: single, PATCH: rename, DELETE
components/
├── chat/
│   ├── chat-panel.tsx          # useChat hook + orchestration
│   ├── message-list.tsx        # Scrollable message container
│   ├── message-bubble.tsx      # Single message (user/assistant)
│   ├── chat-input.tsx          # Textarea + send
│   ├── conversation-list.tsx   # Past conversations sidebar
│   └── markdown-renderer.tsx   # Assistant response rendering
lib/
├── ai/
│   └── provider.ts             # AI SDK provider config
├── db/
│   ├── conversations.ts        # ConversationsDB
│   └── chat-messages.ts        # ChatMessagesDB
├── validations/
│   └── chat.ts                 # Zod schemas
```

### Structure Rationale

- **`app/chat/`**: Follows existing domain routing pattern (`app/habits/`, `app/tasks/`, `app/money/`). Each domain gets its own route group.
- **`app/api/chat/`**: Follows existing API route pattern. The main `route.ts` handles streaming; sub-routes handle conversation CRUD.
- **`components/chat/`**: Follows existing pattern (`components/habits/`, `components/money/`). Each domain's components are co-located.
- **`lib/ai/`**: New folder for AI-specific config. Kept separate from `lib/db/` because it configures an external service, not database access.

## Architectural Patterns

### Pattern 1: AI SDK useChat with API Route (Not Server Actions)

**What:** The Vercel AI SDK `useChat()` hook on the client connects to `POST /api/chat` on the server. The API route uses `streamText()` to proxy to the LLM and returns a streaming response via `toUIMessageStreamResponse()`.

**When to use:** This is the standard pattern for AI chat in Next.js. Use API routes (not Server Actions) because chat needs streaming HTTP responses, request/response control for auth, and is conceptually a proxy to an external service.

**Trade-offs:** Slightly more boilerplate than Server Actions (AI SDK 6 supports both), but gives full control over auth checking, rate limiting, and response headers. Server Actions are harder to add middleware to and less battle-tested for long streaming responses.

**Example:**

```typescript
// lib/ai/provider.ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const llmProvider = createOpenAICompatible({
  name: 'betterr-llm',
  baseURL: process.env.LLM_PROXY_URL!, // https://llm.betterr.me/v1
  apiKey: process.env.LLM_API_KEY!,
});

// app/api/chat/route.ts
import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { llmProvider } from '@/lib/ai/provider';
import { createClient } from '@/lib/supabase/server';
import { ChatMessagesDB, ConversationsDB } from '@/lib/db';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages, conversationId } = await req.json();
  // Validate with Zod, save user message to DB, then stream

  const result = streamText({
    model: llmProvider('claude-sonnet-4-20250514'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### Pattern 2: Conversation Persistence via onFinish Callback

**What:** Save messages to Supabase after the stream completes, not during. The `streamText()` `onFinish` callback fires after the full response is generated. Save the user message before streaming starts (optimistic), save the assistant message in `onFinish`.

**When to use:** Always for persistent chat history.

**Trade-offs:** If the user navigates away mid-stream, the partial response is lost from DB (but `useChat()` still has it in memory). Acceptable for v1 -- partial message recovery adds significant complexity.

**Example:**

```typescript
// Save user message BEFORE streaming
const messagesDB = new ChatMessagesDB(supabase);
await messagesDB.createMessage({
  conversation_id: conversationId,
  role: 'user',
  content: userMessageText,
});

const result = streamText({
  model: llmProvider('claude-sonnet-4-20250514'),
  messages: convertToModelMessages(messages),
  onFinish: async ({ text }) => {
    // Save assistant message AFTER stream completes
    await messagesDB.createMessage({
      conversation_id: conversationId,
      role: 'assistant',
      content: text,
    });
    // Update conversation title if first exchange
    // (use first user message or ask LLM to summarize)
  },
});

return result.toUIMessageStreamResponse();
```

### Pattern 3: OpenAI-Compatible Provider with Custom BaseURL

**What:** Use `@ai-sdk/openai-compatible` to create a provider that points to `llm.betterr.me/v1`. The AI SDK handles SSE parsing, streaming protocol, error mapping, and token counting.

**When to use:** When proxying to any OpenAI-compatible API that is not one of the built-in providers (OpenAI, Anthropic, etc.).

**Trade-offs:** The `@ai-sdk/openai-compatible` package is a thin wrapper. If the proxy has quirks (non-standard error formats, custom headers), you may need the `transformRequestBody` option.

**Important:** BaseURL must end in `/v1`, not `/v1/chat/completions`. The SDK appends the path automatically.

### Pattern 4: Fresh Supabase Client Per Request (Existing -- No Change)

**What:** Every API route creates a fresh `createClient()` and instantiates DB classes with it. No singletons, no shared state. This is an existing hard rule in the codebase.

**Example (matches existing codebase exactly):**

```typescript
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversationsDB = new ConversationsDB(supabase);
  const messagesDB = new ChatMessagesDB(supabase);
  // ... use them
}
```

## Data Flow

### Chat Message Flow (Streaming)

```
[User types message, presses Enter]
    |
[useChat().sendMessage({ text })]
    |
[POST /api/chat]  -- auth check (supabase.auth.getUser()) --> 401 if no session
    |
[Validate request body with Zod]
    |
[Save user message to Supabase (chat_messages table)]
    |
[streamText() -> llm.betterr.me/v1/chat/completions]
    |                                           |
[Stream chunks via toUIMessageStreamResponse()]
    |                                           |
[useChat() updates messages[] in real-time]     |
    |                                     [onFinish callback]
[UI re-renders with each chunk]                 |
                                    [Save assistant message to Supabase]
```

### Conversation List Flow

```
[User navigates to /chat]
    |
[Server component: createClient -> getUser -> ConversationsDB.list()]
    |
[Pass conversations as props to client component]
    |
[User clicks conversation -> navigate to /chat/[id]]
    |
[Server component: ChatMessagesDB.getByConversation()]
    |
[Pass messages as initialMessages to useChat()]
```

### New Conversation Flow

```
[User sends first message on /chat page (no conversationId yet)]
    |
[POST /api/chat { messages, conversationId: null }]
    |
[API creates conversation row -> gets conversationId]
[API saves user message with conversationId]
[API streams response, saves assistant in onFinish]
    |
[Response headers include X-Conversation-Id (or in stream metadata)]
    |
[Client reads conversationId -> router.replace('/chat/[id]')]
```

### Key Data Flows Summary

1. **New conversation:** User sends first message -> API creates conversation + user message -> streams response -> saves assistant message -> returns conversationId -> URL updates to `/chat/[id]`
2. **Continue conversation:** User visits `/chat/[id]` -> server loads messages -> `useChat` initializes with history -> subsequent messages append to existing conversation
3. **Conversation list:** SWR on `/api/chat/conversations` (no date in key -- conversations are not date-scoped)

## Database Schema

```sql
-- conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies (matching existing IN-subquery pattern from money tables)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own conversations"
  ON conversations FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see messages in own conversations"
  ON chat_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(conversation_id, created_at);
```

### Schema Rationale

- **`conversations`** separates metadata from messages, enabling fast conversation list queries without loading all messages.
- **`chat_messages`** uses the IN-subquery RLS pattern matching the existing money tables (99.78% faster than JOIN-based RLS per project docs).
- **ON DELETE CASCADE** on conversation_id means deleting a conversation cleans up all its messages automatically.
- **`model` column** on conversations allows future multi-model support without migration.
- **No `tokens_used` column in v1** -- the LLM proxy tracks usage. Add later if billing needs it.
- **`updated_at` index** -- conversations list sorted by most recently active, needs efficient ordering.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| llm.betterr.me | `@ai-sdk/openai-compatible` with `createOpenAICompatible({ baseURL, apiKey })` | OpenAI-compatible API. `LLM_API_KEY` in `.env.local`. BaseURL ends in `/v1`. |
| Supabase Auth | `createClient()` + `getUser()` on every request | No changes to auth flow. Chat routes protected identically to all other routes. |
| Supabase DB | ConversationsDB + ChatMessagesDB classes with RLS | New tables, same access pattern as all other DB classes. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Chat UI <-> API | `useChat()` hook auto-manages fetch to `/api/chat` | AI SDK handles streaming protocol, retry, abort |
| API route <-> LLM proxy | `streamText()` via AI SDK provider | SDK handles SSE parsing, error mapping |
| API route <-> Supabase | DB classes (same as all other routes) | Fresh client per request, no singletons |
| Sidebar <-> Chat page | Navigation link in `app-sidebar.tsx` | Add entry to `mainNavItems` array |

### Environment Variables Required

| Variable | Where | Purpose |
|----------|-------|---------|
| `LLM_PROXY_URL` | Server only | `https://llm.betterr.me/v1` (base URL for AI SDK provider) |
| `LLM_API_KEY` | Server only | API key for llm.betterr.me proxy (already exists in `.env.local`) |

No new public environment variables needed. No VAPID keys, no email keys -- chat is server-proxied only.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 users (current) | Single API route, no rate limiting, store all messages. Sufficient. |
| 10-100 users | Add per-user rate limiting (e.g., 20 messages/minute) in API route. Conversation message limit (100 messages -> suggest new conversation). |
| 100+ users | Token usage tracking per user. Message pagination for long conversations. Consider streaming response timeout (Vercel function timeout = 60s on Pro). |

### Scaling Priorities

1. **First bottleneck:** LLM proxy capacity / API key rate limits. Mitigate with per-user rate limiting in the chat API route.
2. **Second bottleneck:** Long conversations consuming excessive context tokens. Mitigate with message windowing (send last N messages to LLM, even if full history is in DB).

## Anti-Patterns

### Anti-Pattern 1: Saving Messages During Stream

**What people do:** Write each streaming chunk to the database as it arrives.
**Why it's wrong:** Creates hundreds of DB writes per response. Supabase connections exhaust. Partial saves create inconsistent state.
**Do this instead:** Save user message before streaming, save complete assistant message in `onFinish` callback.

### Anti-Pattern 2: Exposing LLM API Key to Client

**What people do:** Call the LLM proxy directly from the browser to skip the API route.
**Why it's wrong:** API key is exposed in browser network tab. Anyone can use your key.
**Do this instead:** Always proxy through the server-side API route. `LLM_API_KEY` stays in `.env.local`.

### Anti-Pattern 3: Using Server Actions for Streaming Chat

**What people do:** AI SDK 6 supports Server Actions with `useChat`, so devs skip API routes entirely.
**Why it's wrong:** Server Actions make it harder to add auth middleware, rate limiting, and request logging. Chat is fundamentally an API call to an external service, not a form mutation.
**Do this instead:** Use a standard API route handler (`app/api/chat/route.ts`).

### Anti-Pattern 4: Loading Full History from DB on Every Send

**What people do:** Fetch all messages from DB on every chat request to build context.
**Why it's wrong:** The client already has messages in `useChat()` state. Double-fetching wastes queries.
**Do this instead:** Client sends messages array with request (AI SDK does this automatically). Server reads from DB only for initial page load.

### Anti-Pattern 5: Storing Raw Streaming Chunks

**What people do:** Store SSE chunks or intermediate streaming state in the database.
**Why it's wrong:** Chunks are transport-layer artifacts, not semantic content. They fragment the message.
**Do this instead:** Store only the final, complete message text.

## Build Order (Dependency-Aware)

The following order respects component dependencies and enables incremental testing:

### Phase 1: Database + Types + DB Classes
**Dependencies:** None
**Deliverables:**
- Supabase migration: `conversations`, `chat_messages` tables with RLS
- TypeScript types in `lib/db/types.ts`
- `ConversationsDB` class (`lib/db/conversations.ts`)
- `ChatMessagesDB` class (`lib/db/chat-messages.ts`)
- Exports in `lib/db/index.ts`
- Zod validation schemas (`lib/validations/chat.ts`)
- Unit tests for both DB classes

**Why first:** Everything else depends on the data layer.

### Phase 2: AI Provider + Streaming API Route
**Dependencies:** Phase 1
**Deliverables:**
- `lib/ai/provider.ts` (createOpenAICompatible config)
- `app/api/chat/route.ts` (POST: auth, validate, stream, persist)
- Can test with curl before any UI exists

**Why second:** API must exist before UI can connect to it.

### Phase 3: Chat UI Components
**Dependencies:** Phase 2
**Deliverables:**
- `components/chat/message-bubble.tsx`
- `components/chat/message-list.tsx`
- `components/chat/chat-input.tsx`
- `components/chat/markdown-renderer.tsx`
- `components/chat/chat-panel.tsx` (orchestrates useChat + sub-components)
- `app/chat/layout.tsx` (SidebarShell wrapper)
- `app/chat/page.tsx` (new chat entry point)
- Component tests

**Why third:** Build UI components bottom-up (bubble -> list -> input -> panel).

### Phase 4: Conversation Persistence + Multi-Conversation
**Dependencies:** Phase 3
**Deliverables:**
- `app/api/chat/conversations/route.ts` (GET list, POST create)
- `app/api/chat/conversations/[id]/route.ts` (GET, PATCH rename, DELETE)
- `components/chat/conversation-list.tsx`
- `app/chat/[id]/page.tsx` (load existing conversation)
- Auto-title generation for conversations
- API + component tests

**Why fourth:** Single-conversation chat must work before adding multi-conversation support.

### Phase 5: Navigation + i18n + Polish
**Dependencies:** Phase 4
**Deliverables:**
- Sidebar nav item in `app-sidebar.tsx` (MessageSquare icon)
- i18n strings in all three locale files (`chat` namespace)
- Loading states, error states, empty states
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- Stop generation button
- Final integration testing

**Why last:** Navigation and polish only make sense when the feature is complete.

## Sources

- [AI SDK Official Docs](https://ai-sdk.dev/docs/introduction) -- HIGH confidence
- [AI SDK Next.js App Router Getting Started](https://ai-sdk.dev/docs/getting-started/nextjs-app-router) -- HIGH confidence
- [AI SDK OpenAI-Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers) -- HIGH confidence
- [AI SDK Custom Provider Docs](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers) -- HIGH confidence
- [@ai-sdk/openai-compatible npm](https://www.npmjs.com/package/@ai-sdk/openai-compatible) -- HIGH confidence
- [AI SDK Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) -- HIGH confidence
- Existing BetterR.Me codebase patterns (DB classes, API routes, SWR, Zod, sidebar) -- HIGH confidence (direct code inspection)

---
*Architecture research for: AI Chat Foundation integration into BetterR.Me (v7.0)*
*Researched: 2026-04-02*
