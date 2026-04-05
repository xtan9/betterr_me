# Phase 36: Conversation Persistence & Management - Research

**Researched:** 2026-04-03
**Domain:** Chat conversation persistence, list UI, auto-title generation
**Confidence:** HIGH

## Summary

Phase 36 builds on the streaming chat UI (Phase 35) and DB classes (Phase 34) to add conversation persistence, a conversation list sidebar, and auto-title generation. The foundation is solid: `ConversationsDB` and `ChatMessagesDB` already provide full CRUD, the `useChat` hook from `@ai-sdk/react` supports an `id` prop for managing multiple chat instances, and `setMessages` allows loading persisted messages. The `generateText` function from the `ai` package handles non-streaming title generation.

The primary integration point is `components/chat/chat-content.tsx`, which currently has zero conversation awareness. It needs to accept a `conversationId`, load messages from DB on mount, persist messages during the chat lifecycle, and coordinate with a new sidebar component. New API routes follow the established pattern (auth + DB class + error handling) already used by habits, tasks, and every other domain.

**Primary recommendation:** Use SWR for the conversation list (consistent with all other data fetching in the app), query params (`/chat?id=<uuid>`) for conversation routing (simpler than dynamic routes, avoids new page files), and client-side persistence via separate API calls after streaming completes (keeps the chat API route focused on streaming).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Conversation list appears as a left sidebar panel within the chat page
- D-02: Sidebar shows conversation titles sorted by `updated_at` descending (most recent first)
- D-03: Active conversation highlighted in the list; clicking another conversation switches to it
- D-04: User message saved to DB before sending to LLM -- prevents data loss if user navigates away mid-stream
- D-05: Assistant message saved to DB after stream completes -- ensures only complete responses are persisted
- D-06: On page load with a conversation selected, messages loaded from DB via `ChatMessagesDB.getMessagesByConversation()`
- D-07: After the first assistant response completes, send a separate LLM request to generate a short title (5-8 words)
- D-08: Title generation is fire-and-forget -- doesn't block the UI; title updates in the sidebar when ready
- D-09: Title request uses the same LLM provider/proxy configured in `lib/ai/provider.ts`
- D-10: "New chat" button in the conversation sidebar -- clears current chat and starts fresh
- D-11: Conversation record auto-created in DB on first message send if no conversation is selected
- D-12: URL reflects active conversation: `/chat` for new/empty, `/chat?id=<uuid>` or `/chat/<uuid>` for existing
- D-13: New API routes needed: `GET /api/conversations`, `POST /api/conversations`, `DELETE /api/conversations/[id]`, `GET /api/conversations/[id]/messages`
- D-14: Existing `POST /api/chat` extended to accept `conversationId` and persist messages -- or persistence handled client-side via separate API calls
- D-15: Title generation endpoint: `POST /api/conversations/[id]/title` or inline in chat response handler

### Claude's Discretion
- URL strategy for conversation routing (`/chat?id=` vs `/chat/[id]`)
- Whether message persistence happens in the chat API route or via separate client-side API calls after streaming
- Whether title generation uses a dedicated endpoint or is triggered client-side
- Conversation delete confirmation UX (if any)
- SWR vs direct fetch for conversation list data fetching
- Component file organization for new conversation list components

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | User can create a new conversation | D-10, D-11: "New chat" button + auto-create on first message. `ConversationsDB.createConversation()` already exists. `POST /api/conversations` route needed. |
| CONV-02 | User can switch between multiple conversations via a conversation list | D-01 through D-03: Sidebar panel with SWR-fetched list. `useChat` `id` prop + `setMessages` for switching. `GET /api/conversations` route needed. |
| CONV-03 | Messages and responses persist in the database across page refreshes | D-04 through D-06: Save user message before LLM call, assistant message after stream. Load from `ChatMessagesDB.getMessagesByConversation()` on mount. |
| CONV-04 | Conversation gets an auto-generated title after the first exchange | D-07 through D-09: `generateText` with short prompt after first assistant response. Fire-and-forget, updates sidebar via SWR mutate. |

</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `ai` | 6.0.144 | `generateText` for title generation, `UIMessage` types | Already used for `streamText` in chat route |
| `@ai-sdk/react` | 3.0.146 | `useChat` hook with `id`, `messages`, `setMessages`, `onFinish` | Already used in `ChatContent` |
| `@ai-sdk/openai` | 3.0.50 | `createOpenAI` for LLM provider | Already used via `lib/ai/provider.ts` |
| `swr` | 2.4.1 | Data fetching for conversation list | Project standard for all client data fetching |
| `zod` | (installed) | Request validation for new API routes | Project standard for API boundaries |

### Supporting (already installed)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `lucide-react` | Icons for sidebar (Plus, MessageSquare, Trash2, etc.) | Conversation list UI |
| `shadcn/ui` | Button, ScrollArea, Sheet (mobile sidebar) | Sidebar panel components |
| `next-intl` | i18n for all new strings | All new UI strings in en/zh/zh-TW |

**No new packages needed.** Everything required is already installed.

## Architecture Patterns

### Recommended Component Structure
```
components/chat/
  chat-content.tsx          # MODIFY: Add conversation state, persistence, sidebar toggle
  chat-input.tsx            # EXISTING: No changes needed
  message-list.tsx          # EXISTING: No changes needed
  chat-empty-state.tsx      # EXISTING: No changes needed
  markdown-renderer.tsx     # EXISTING: No changes needed
  conversation-sidebar.tsx  # NEW: Sidebar panel with conversation list
  conversation-item.tsx     # NEW: Single conversation row in sidebar

app/chat/
  page.tsx                  # MODIFY: Pass conversationId from searchParams

app/api/conversations/
  route.ts                  # NEW: GET (list) + POST (create)
  [id]/
    route.ts                # NEW: DELETE
    messages/
      route.ts              # NEW: GET (load messages)
    title/
      route.ts              # NEW: POST (generate title)
```

### Pattern 1: URL Strategy -- Query Params (`/chat?id=<uuid>`)
**What:** Use query params instead of dynamic route segments for conversation routing.
**Why chosen over `/chat/[id]`:**
- Avoids creating a new page file (`app/chat/[id]/page.tsx`) that would duplicate auth logic
- The chat page is a single-page-app style UI -- the sidebar and chat area are one view
- Query params work naturally with `useSearchParams()` on the client
- `/chat` (no param) = new conversation, `/chat?id=abc` = load existing
- Simpler: one `page.tsx`, one `ChatContent` component that reads the param

**Example:**
```typescript
// app/chat/page.tsx
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { id } = await searchParams;
  return <ChatContent conversationId={id} />;
}
```

### Pattern 2: Client-Side Message Persistence
**What:** Persist messages via separate API calls from the client, not inside the streaming route.
**Why:**
- The `POST /api/chat` streaming route uses `streamText` which returns a streaming response -- it cannot do DB writes after the stream ends without complex callback wiring
- Client has full control over timing: save user message before `sendMessage()`, save assistant message in `onFinish` callback
- Keeps the streaming route clean and focused on proxying to LLM
- Matches D-04 (user message before LLM) and D-05 (assistant message after stream)

**Data flow:**
```
1. User types message, clicks send
2. Client: POST /api/conversations (if no conversationId yet) -> get new conversationId
3. Client: POST /api/conversations/{id}/messages with user message (D-04: save before LLM)
4. Client: sendMessage() via useChat -> streams response from /api/chat
5. Client: onFinish callback -> POST /api/conversations/{id}/messages with assistant message (D-05: save after stream)
6. Client: If first exchange -> POST /api/conversations/{id}/title (fire-and-forget, D-07/D-08)
7. Client: mutate('/api/conversations') to refresh sidebar list
```

### Pattern 3: `useChat` with `id` and `setMessages` for Conversation Switching
**What:** Use the `id` prop on `useChat` to scope chat state per conversation, and `setMessages` to hydrate from DB.
**Why:** The `id` prop gives each conversation its own message state in the `useChat` hook. When switching conversations, load messages from the API and call `setMessages()`.

**Example:**
```typescript
const { messages, sendMessage, setMessages, stop, status, error } = useChat({
  id: conversationId ?? "new",
  transport,
});

// Load messages when conversationId changes
useEffect(() => {
  if (!conversationId) {
    setMessages([]);
    return;
  }
  fetch(`/api/conversations/${conversationId}/messages`)
    .then(res => res.json())
    .then(data => {
      // Convert DB ChatMessage[] to UIMessage[] format
      const uiMessages = data.messages.map(dbMessageToUIMessage);
      setMessages(uiMessages);
    });
}, [conversationId, setMessages]);
```

### Pattern 4: SWR for Conversation List
**What:** Use SWR to fetch and cache the conversation list, with `mutate` for optimistic updates.
**Why:** Every other list in the app uses SWR. Consistent pattern, automatic caching, easy `mutate()` after creates/deletes.

**Example:**
```typescript
const { data, mutate } = useSWR<{ conversations: Conversation[] }>(
  "/api/conversations",
  fetcher
);
```

### Pattern 5: Title Generation via `generateText`
**What:** Server-side endpoint using `generateText` (not `streamText`) for short title generation.
**Why:** Title is 5-8 words, no streaming needed. `generateText` returns a simple string.

**Example (API route):**
```typescript
// app/api/conversations/[id]/title/route.ts
import { generateText } from "ai";
import { llmProvider } from "@/lib/ai/provider";

const { text } = await generateText({
  model: llmProvider(process.env.LLM_MODEL || "claude-sonnet-4-20250514"),
  prompt: `Summarize this conversation in 5-8 words as a title. Return ONLY the title, no quotes or punctuation.\n\nUser: ${userMessage}\nAssistant: ${assistantMessage}`,
  maxTokens: 30,
});

// Update conversation title
await conversationsDB.updateConversation(id, userId, { title: text.trim() });
```

### Anti-Patterns to Avoid
- **Persisting messages inside the streaming route:** The stream response is already being sent to the client. Adding DB writes to `onFinish` in `streamText` is possible but couples streaming with persistence and makes error handling harder. Keep them separate.
- **Using `initialMessages` prop on useChat re-mount:** Don't unmount/remount `useChat` to switch conversations. Use `setMessages()` instead to avoid losing streaming state and creating new hook instances.
- **Saving partial assistant messages:** Only save the complete assistant response (D-05). Saving partial streamed text would create inconsistent state if the user navigates away mid-stream.
- **Blocking UI on title generation:** Title gen is fire-and-forget (D-08). Don't `await` it in the main flow. Use a separate `fetch` call without awaiting, then mutate the SWR cache when it returns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat state management | Custom useState/useReducer for messages, status, streaming | `useChat` from `@ai-sdk/react` | Already handles message lifecycle, streaming status, abort, error recovery |
| Non-streaming LLM call | Raw fetch to LLM proxy for title generation | `generateText` from `ai` | Handles auth, retries, response parsing, type safety |
| Conversation list caching | Custom state + manual refetching | SWR | Automatic caching, revalidation, optimistic updates -- project standard |
| UUID generation | `crypto.randomUUID()` in client | Let Supabase generate IDs on insert | Default `gen_random_uuid()` in the DB, consistent with all other tables |

## Common Pitfalls

### Pitfall 1: UIMessage vs DB ChatMessage Format Mismatch
**What goes wrong:** The `useChat` hook works with `UIMessage` objects (which have `parts: Array<{ type: 'text', text: string }>` structure), but the DB stores flat `ChatMessage` objects with a `content` string field. Loading from DB without proper conversion causes rendering failures.
**Why it happens:** AI SDK v6 uses a `parts`-based message format internally, not the simple `{ role, content }` format.
**How to avoid:** Create a `dbMessageToUIMessage` converter function and a `uiMessageToDbMessage` converter. Test both directions.
**Warning signs:** Messages loaded from DB render as empty or `[object Object]`.

### Pitfall 2: Race Condition on First Message Send
**What goes wrong:** User sends first message -> conversation creation and user message save must both complete before `sendMessage()` is called. If `sendMessage()` fires before the conversation is created, there's no `conversationId` to associate messages with.
**Why it happens:** The create-conversation + save-user-message + send-to-LLM sequence has async dependencies.
**How to avoid:** Use `await` chain: create conversation -> save user message -> then `sendMessage()`. Store the new `conversationId` in state and update the URL.
**Warning signs:** Messages saved without `conversation_id`, or conversation created but first message missing.

### Pitfall 3: Stale Sidebar After Conversation Operations
**What goes wrong:** Creating a new conversation or deleting one doesn't update the sidebar list.
**Why it happens:** SWR cache is stale. Must explicitly call `mutate('/api/conversations')` after any mutation.
**How to avoid:** Always `mutate` the conversation list SWR key after create, delete, or title update operations.
**Warning signs:** User creates conversation but doesn't see it in sidebar until page refresh.

### Pitfall 4: `useChat` `id` Change Without Message Reset
**What goes wrong:** Switching conversations by changing the `id` prop doesn't automatically clear the previous conversation's messages if the hook reuses state.
**Why it happens:** The `id` prop scopes the internal cache, but if messages were set via `setMessages`, switching `id` without resetting may show stale messages briefly.
**How to avoid:** When `conversationId` changes, immediately call `setMessages([])` before fetching the new conversation's messages. Show a loading state during fetch.
**Warning signs:** Previous conversation's messages flash briefly when switching.

### Pitfall 5: Missing i18n Strings
**What goes wrong:** Build fails or shows raw keys because new UI strings aren't added to all three locale files (en.json, zh.json, zh-TW.json).
**Why it happens:** Easy to add English strings and forget the other two locales.
**How to avoid:** Add strings to all three files simultaneously. The project has an `i18n-key-parity.test.ts` test that catches mismatches.
**Warning signs:** `i18n-key-parity` test failure.

### Pitfall 6: Title Generation Failing Silently
**What goes wrong:** Title generation fails (LLM timeout, rate limit) but since it's fire-and-forget, no one knows. Conversations remain untitled forever.
**Why it happens:** Fire-and-forget means no error propagation to UI.
**How to avoid:** Log errors server-side. Show "New conversation" as fallback title in UI when title is null. Consider adding a manual "rename" option in a future phase.
**Warning signs:** Many conversations in sidebar showing default/null title.

## Code Examples

### DB Message to UIMessage Conversion
```typescript
// lib/chat/message-utils.ts
import type { ChatMessage } from "@/lib/db/types";
import type { UIMessage } from "ai";

export function dbMessageToUIMessage(msg: ChatMessage): UIMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: [{ type: "text", text: msg.content }],
    createdAt: new Date(msg.created_at),
  };
}

export function uiMessageToDbInsert(
  msg: UIMessage,
  conversationId: string
): { conversation_id: string; role: string; content: string } {
  const textPart = msg.parts.find((p) => p.type === "text");
  return {
    conversation_id: conversationId,
    role: msg.role,
    content: textPart?.type === "text" ? textPart.text : "",
  };
}
```

### API Route Pattern (Conversations List)
```typescript
// app/api/conversations/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const conversationsDB = new ConversationsDB(supabase);
    const conversations = await conversationsDB.getUserConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    log.error("GET /api/conversations error", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.createConversation({ user_id: user.id });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    log.error("POST /api/conversations error", error);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
```

### Conversation Messages API Route
```typescript
// app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ChatMessagesDB, ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify conversation belongs to user
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.getConversation(id);
    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const chatMessagesDB = new ChatMessagesDB(supabase);
    const messages = await chatMessagesDB.getMessagesByConversation(id);
    return NextResponse.json({ messages });
  } catch (error) {
    log.error("GET /api/conversations/[id]/messages error", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
```

### Save Message API (for client-side persistence)
```typescript
// POST handler added to app/api/conversations/[id]/messages/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.getConversation(id);
    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    // Validate: { role: "user"|"assistant", content: string }
    const chatMessagesDB = new ChatMessagesDB(supabase);
    const message = await chatMessagesDB.createMessage({
      conversation_id: id,
      role: body.role,
      content: body.content,
    });

    // Update conversation updated_at
    await conversationsDB.updateConversation(id, user.id, {});

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    log.error("POST /api/conversations/[id]/messages error", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useChat` with `initialMessages` prop | `useChat` with `setMessages()` for hydration | AI SDK v6 | `setMessages` is the correct way to load persisted messages into an existing chat instance |
| `toDataStreamResponse()` | `toTextStreamResponse()` | Phase 34 decision | Project uses text stream, not data stream protocol |
| Dynamic route `/chat/[id]` | Query param `/chat?id=` | Phase 36 decision | Simpler single-page architecture for chat UI |

## Open Questions

1. **`updateConversation` with empty updates to bump `updated_at`**
   - What we know: The `updateConversation` method runs a Supabase `.update()`. Passing empty `{}` may not trigger an `updated_at` refresh if there's no DB trigger.
   - What's unclear: Whether the `conversations` table has an `updated_at` trigger or if it needs an explicit timestamp.
   - Recommendation: Check if there's a DB trigger. If not, pass `{ title: conversation.title }` as a no-op update, or add explicit `updated_at: new Date().toISOString()` to the update payload. Alternatively, add `updated_at` to `ConversationUpdate` type.

2. **Conversation ownership verification on message save**
   - What we know: RLS policies should enforce that users can only access their own conversations. The API route also checks ownership.
   - What's unclear: Whether existing RLS policies cover the `chat_messages` table via the `conversation_id` FK.
   - Recommendation: Verify RLS policies exist for `chat_messages`. If not, the API-level ownership check is sufficient but RLS should be added as defense-in-depth.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (jsdom) |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test:run` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | Create new conversation via API + UI button | unit | `pnpm vitest run tests/app/api/conversations/route.test.ts -t "POST"` | No - Wave 0 |
| CONV-02 | List conversations + switch between them | unit | `pnpm vitest run tests/components/chat/conversation-sidebar.test.tsx` | No - Wave 0 |
| CONV-03 | Messages persist and load from DB | unit | `pnpm vitest run tests/app/api/conversations/ -t "messages"` | No - Wave 0 |
| CONV-04 | Auto-generate title after first exchange | unit | `pnpm vitest run tests/app/api/conversations/ -t "title"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run tests/app/api/conversations/ tests/components/chat/`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `tests/app/api/conversations/route.test.ts` -- covers CONV-01 (create), CONV-02 (list)
- [ ] `tests/app/api/conversations/[id]/route.test.ts` -- covers delete
- [ ] `tests/app/api/conversations/[id]/messages/route.test.ts` -- covers CONV-03
- [ ] `tests/app/api/conversations/[id]/title/route.test.ts` -- covers CONV-04
- [ ] `tests/components/chat/conversation-sidebar.test.tsx` -- covers CONV-02 UI
- [ ] `tests/components/chat/chat-content.test.tsx` -- UPDATE existing to cover persistence logic

## Project Constraints (from CLAUDE.md)

- **Git workflow:** Create feature branch + PR, never push to main
- **Testing:** Always add tests with PRs
- **i18n:** All new strings in en, zh, zh-TW (parity test enforced by `i18n-key-parity.test.ts`)
- **API pattern:** `createClient()` -> `getUser()` -> 401 check -> DB class -> try/catch -> `NextResponse.json()`
- **File naming:** kebab-case for files, PascalCase for components
- **No editing `components/ui/`:** shadcn/ui managed
- **Path alias:** `@/` for imports
- **Lint:** Run lint after code changes
- **Zod validation:** At API boundaries

## Sources

### Primary (HIGH confidence)
- `@ai-sdk/react` v3.0.146 type definitions (`node_modules/@ai-sdk/react/dist/index.d.ts`) -- `useChat` accepts `ChatInit` with `id`, `messages`, `onFinish` props
- `ai` v6.0.144 type definitions (`node_modules/ai/dist/index.d.ts`) -- `ChatInit` interface, `generateText` export, `UIMessage` type with `parts` array
- Existing codebase: `lib/db/conversations.ts`, `lib/db/chat-messages.ts`, `lib/db/types.ts` -- full CRUD already implemented
- Existing codebase: `components/chat/chat-content.tsx` -- current integration point, `useChat` already in use
- Existing codebase: `app/api/habits/route.ts`, `app/api/habits/[id]/route.ts` -- canonical API route patterns
- `.planning/research/STACK.md` -- AI SDK version decisions and rationale

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- system architecture diagram, component responsibility mapping

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed and in use, versions verified against npm registry
- Architecture: HIGH -- patterns follow existing codebase conventions, all integration points inspected
- Pitfalls: HIGH -- derived from actual code inspection (UIMessage parts format, async flow analysis)

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days -- stable stack, no fast-moving dependencies)
