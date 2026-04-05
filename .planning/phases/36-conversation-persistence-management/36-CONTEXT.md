# Phase 36: Conversation Persistence & Management - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Save and load messages to/from the database, add a conversation list sidebar panel within the chat page, enable creating and switching between conversations, and auto-generate conversation titles via the LLM after the first exchange. Uses the `conversations` and `chat_messages` tables and DB classes built in Phase 34.

</domain>

<decisions>
## Implementation Decisions

### Conversation List UI
- **D-01:** Conversation list appears as a left sidebar panel within the chat page — standard chat UX pattern (similar to ChatGPT/Claude.ai)
- **D-02:** Sidebar shows conversation titles sorted by `updated_at` descending (most recent first) — matches existing `ConversationsDB.getUserConversations()` sort order
- **D-03:** Active conversation highlighted in the list; clicking another conversation switches to it

### Message Persistence Timing
- **D-04:** User message saved to DB before sending to LLM — prevents data loss if user navigates away mid-stream
- **D-05:** Assistant message saved to DB after stream completes — ensures only complete responses are persisted
- **D-06:** On page load with a conversation selected, messages loaded from DB via `ChatMessagesDB.getMessagesByConversation()`

### Auto-Title Generation
- **D-07:** After the first assistant response completes, send a separate LLM request to generate a short title (5-8 words) summarizing the conversation topic
- **D-08:** Title generation is fire-and-forget — doesn't block the UI; title updates in the sidebar when ready
- **D-09:** Title request uses the same LLM provider/proxy configured in `lib/ai/provider.ts`

### New Conversation Flow
- **D-10:** "New chat" button in the conversation sidebar — clears current chat and starts fresh
- **D-11:** Conversation record auto-created in DB on first message send if no conversation is selected (handles initial empty state)
- **D-12:** URL reflects active conversation: `/chat` for new/empty, `/chat?id=<uuid>` or `/chat/<uuid>` for existing — Claude's discretion on URL strategy

### API Routes
- **D-13:** New API routes needed: `GET /api/conversations` (list), `POST /api/conversations` (create), `DELETE /api/conversations/[id]` (delete), `GET /api/conversations/[id]/messages` (load messages)
- **D-14:** Existing `POST /api/chat` extended to accept `conversationId` and persist messages — or persistence handled client-side via separate API calls (Claude's discretion on where persistence logic lives)
- **D-15:** Title generation endpoint: `POST /api/conversations/[id]/title` or inline in chat response handler — Claude's discretion

### Claude's Discretion
- URL strategy for conversation routing (`/chat?id=` vs `/chat/[id]`)
- Whether message persistence happens in the chat API route or via separate client-side API calls after streaming
- Whether title generation uses a dedicated endpoint or is triggered client-side
- Conversation delete confirmation UX (if any)
- SWR vs direct fetch for conversation list data fetching
- Component file organization for new conversation list components

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 34 Foundation (built code)
- `app/api/chat/route.ts` — Streaming API endpoint, currently accepts `{ messages }` without conversationId
- `lib/ai/provider.ts` — LLM provider config (reuse for title generation)
- `lib/db/conversations.ts` — `ConversationsDB` class with CRUD methods
- `lib/db/chat-messages.ts` — `ChatMessagesDB` class with message CRUD and bulk create
- `lib/db/types.ts` — `Conversation`, `ChatMessage`, insert/update types
- `lib/validations/chat.ts` — Zod schema for chat messages

### Phase 35 Foundation (built code)
- `app/chat/page.tsx` — Server component with auth guard, renders `ChatContent`
- `components/chat/chat-content.tsx` — Client component using `useChat` with `TextStreamChatTransport`
- `components/chat/chat-input.tsx` — Input textarea with send/stop buttons
- `components/chat/message-list.tsx` — Message display component
- `components/chat/chat-empty-state.tsx` — Empty state greeting
- `components/chat/markdown-renderer.tsx` — Markdown rendering for assistant messages

### Existing Patterns
- `app/api/habits/route.ts` — API route pattern (auth + DB class + error handling)
- `lib/supabase/server.ts` — Server client creation
- `lib/db/index.ts` — DB class export pattern
- `supabase/migrations/` — Migration file naming (if schema changes needed)

### AI SDK
- `.planning/research/STACK.md` — Package versions, `useChat` hook config options
- `.planning/research/ARCHITECTURE.md` — System overview, data flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConversationsDB`: Full CRUD — `getUserConversations()`, `getConversation()`, `createConversation()`, `updateConversation()`, `deleteConversation()`
- `ChatMessagesDB`: `getMessagesByConversation()`, `createMessage()`, `createMessages()` (bulk), `deleteMessagesByConversation()`
- `useChat` hook from `@ai-sdk/react`: Already configured with `TextStreamChatTransport` — needs `id` prop for conversation-specific state
- `llmProvider` from `lib/ai/provider.ts`: Reusable for title generation requests
- `streamText` / `generateText` from `ai` package: `generateText` can be used for non-streaming title generation

### Established Patterns
- API routes: `createClient()` → `getUser()` → 401 check → DB class → try/catch → `NextResponse.json()`
- Data fetching: SWR on client side with `keepPreviousData: true` when key contains date
- Client components: `"use client"` directive, `useTranslations()` for i18n
- Page structure: `app/{domain}/page.tsx` server component → client component in `components/{domain}/`

### Integration Points
- `components/chat/chat-content.tsx` — Main integration point: needs conversation state, sidebar, persistence logic
- `app/chat/page.tsx` — May need route params or query params for conversation ID
- `app/api/` — New conversation API routes
- `lib/db/index.ts` — DB classes already exported from Phase 34

</code_context>

<specifics>
## Specific Ideas

- `useChat` hook supports an `id` prop for managing multiple chat instances — key for conversation switching
- `ChatMessagesDB.createMessages()` supports bulk insert — useful for saving user+assistant message pairs
- Phase 35's `ChatContent` currently has no conversation awareness — will need significant refactoring to accept conversationId and manage persistence
- Title generation should be lightweight — a short prompt like "Summarize this conversation in 5 words" with `maxTokens: 20`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 36-conversation-persistence-management*
*Context gathered: 2026-04-03*
