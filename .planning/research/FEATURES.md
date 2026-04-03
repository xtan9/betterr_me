# Feature Research

**Domain:** AI Chat Interface for Personal Productivity App
**Researched:** 2026-04-02
**Confidence:** HIGH

Research based on analysis of the existing BetterR.Me app (habits, tasks, journal, workouts, money, calendar), the llm.betterr.me proxy (CLIProxyAPI, OpenAI-compatible endpoint), competitive landscape (ChatGPT, Claude.ai, Notion AI, productivity apps with AI chat), and current AI SDK ecosystem (Vercel AI SDK, shadcn-chat components).

---

## Context: What Exists Today

BetterR.Me is a personal productivity + finance web app (77,070+ LOC TypeScript) with:

- **Habits:** Daily/weekdays/weekly/times_per_week/custom frequency tracking, streaks, milestones
- **Tasks:** Work/Personal sections, projects, 4-column kanban, recurring tasks
- **Journal:** Calendar view, mood tracking, entry links
- **Money:** Plaid bank connections, transactions, budgets, bills, savings goals, net worth, contextual AI insights (rule-based)
- **Workouts:** Exercise logging, routines, PRs
- **Calendar:** Month/week/day views, cross-domain aggregation, push notifications, reminders
- **Dashboard:** Unified view of habits, tasks, money summary
- **Infrastructure:** Supabase (Postgres + Auth + Vault + RLS), SWR, next-intl (3 locales), dark mode, design tokens, Vercel deployment

### Key Integration Points for AI Chat

| Existing System | How Chat Touches It |
|---|---|
| **Auth (Supabase SSR)** | Chat is auth-gated. Existing middleware redirects unauthenticated users. No new auth work needed. |
| **LLM Proxy (llm.betterr.me)** | OpenAI-compatible POST /v1/chat/completions endpoint. API key in .env.local as LLM_API_KEY. Stateless -- app manages conversation context. |
| **Profiles (ProfilesDB)** | User name, locale, timezone available for system prompt personalization. |
| **Sidebar navigation** | Add "Chat" nav item. Current: Dashboard, Calendar, Habits, Tasks, Projects, Journal, Workouts, Money. |
| **Design tokens** | Chat UI uses existing tokens for colors, spacing, dark mode. No new design system work. |
| **i18n (3 locales)** | Chat UI chrome (buttons, placeholders, error messages) in en, zh, zh-TW. AI responses are in whatever language the user/model uses. |
| **SWR** | Conversation list fetching follows existing SWR patterns. Chat streaming itself uses AI SDK, not SWR. |
| **Supabase (DB + RLS)** | New tables for conversations and messages with RLS on user_id. Same patterns as all other domains. |

---

## Table Stakes

Features users expect in any AI chat interface in 2026. Missing any of these makes the chat feel broken or unusable.

| Feature | Why Expected | Complexity | Dependencies on Existing App | Notes |
|---------|--------------|------------|------------------------------|-------|
| **Message input with send** | Cannot interact without it. Every chat interface has a text input and send button. | LOW | None. New component. | Textarea (not single-line input) for multi-line messages. Enter to send, Shift+Enter for newline. Disable send while streaming. Auto-focus on page load. |
| **Streaming responses** | Users expect word-by-word output. Waiting for full response feels broken in 2026. Sub-1-second first token is the baseline. | MEDIUM | LLM proxy at llm.betterr.me. | Use Vercel AI SDK `@ai-sdk/openai-compatible` provider with `baseURL: "https://llm.betterr.me/v1"`. Server-side `streamText()` in API route, client-side `useChat` hook handles SSE. |
| **Message history in session** | Users expect to scroll up and see prior messages in the current conversation. | LOW | None. Managed by `useChat` hook state. | Messages array held in React state. Lost on page refresh until persistence is added. |
| **User vs assistant visual distinction** | Must instantly see who said what. Raw text dump is unreadable. | LOW | Existing design tokens for styling. | User messages right-aligned with primary color background. Assistant messages left-aligned with muted background. Avatar/icon differentiation. |
| **Markdown rendering** | Claude produces headers, lists, bold, links, tables. Raw markdown looks broken to non-technical users. | MEDIUM | None. New dependency: `react-markdown` + `remark-gfm`. | Must handle streaming partial markdown gracefully. Use memoized markdown component (AI SDK cookbook pattern) to avoid re-rendering completed paragraphs during streaming. |
| **Code block syntax highlighting** | Claude frequently produces code. Unstyled monospace code blocks are hard to read and feel cheap. | MEDIUM | None. New dependency: syntax highlighting library. | Use `react-syntax-highlighter` or `shiki` via code component override in `react-markdown`. Include copy-to-clipboard button on each code block. Support common languages (JS/TS, Python, SQL, JSON, bash). |
| **Loading/thinking indicator** | Users need feedback that the AI is processing. No indicator = "is it working?" | LOW | None. | Animated dots or pulsing skeleton in assistant bubble position. Show after send, hide when first streaming token arrives. |
| **Error handling with retry** | Network failures, proxy timeouts, rate limits are inevitable. Users need clear feedback and recovery path. | LOW | None. `useChat` hook provides `onError` callback. | Display error message inline below the failed request. "Retry" button re-sends the last message. Handle common errors: 429 (rate limit), 502/503 (proxy down), timeout. |
| **Auth-gated access** | Only logged-in users should access chat. Unauthorized access is a cost and security issue. | LOW | Existing proxy auth middleware handles redirect. | Route at `/chat` protected by existing middleware. Unauthenticated -> `/auth/login`. |
| **Responsive layout** | Must work on desktop and mobile. Chat is inherently a mobile-friendly interaction pattern. | MEDIUM | Existing responsive patterns (sidebar collapse). | Full-width on mobile with no sidebar. Sidebar-compatible on desktop. Input pinned to bottom. Auto-scroll to latest message. Virtual keyboard awareness on mobile. |
| **i18n for UI chrome** | App has 3 locales. Chat UI labels must match. | LOW | Existing next-intl infrastructure. | Add `chat` namespace to en.json, zh.json, zh-TW.json. Strings: placeholder text ("Ask anything..."), send button, error messages, empty state. AI responses stay in model's language. |

---

## Differentiators

Features that set BetterR.Me's chat apart from a generic ChatGPT wrapper. These leverage the existing app context and create unique value.

| Feature | Value Proposition | Complexity | Dependencies on Existing App | Notes |
|---------|-------------------|------------|------------------------------|-------|
| **Conversation persistence (DB)** | Users return and expect to continue or review past conversations. Session-only memory feels disposable. Without persistence, every page refresh loses all context. | MEDIUM | Supabase for storage. Existing RLS patterns for user scoping. | Two new tables: `conversations` (id, user_id, title, created_at, updated_at) and `chat_messages` (id, conversation_id, role, content, created_at). AI SDK `useChat` supports `initialMessages` for loading history. Messages stored after each exchange completes. |
| **Conversation list with management** | Users want to organize multiple conversations, not a single infinite thread. Ability to see past conversations, switch between them, and delete old ones. | MEDIUM | Depends on conversation persistence. | Sidebar panel (desktop) or slide-over (mobile) showing conversation list sorted by updated_at. Each entry shows title + timestamp. Click to load. Swipe/button to delete. |
| **New conversation button** | Users need to start fresh without losing old context. Essential once persistence exists. | LOW | Depends on conversation persistence. | Prominent "New Chat" button. Clears current messages, creates new conversation record. Keyboard shortcut (Cmd+Shift+N or similar). |
| **Auto-generated conversation titles** | Default "New conversation" titles are useless when you have many. Auto-titles help users find past conversations. | LOW | Depends on conversation persistence. | After first assistant response, send a background request to the model: "Summarize this conversation in 5 words or fewer." Or simpler: use first 50 chars of first user message as title. User can rename. |
| **Copy message content** | Users frequently copy AI responses to paste into documents, code editors, or other apps. | LOW | None. | Copy button (clipboard icon) on hover/focus of each assistant message. Copy as raw markdown (preserving code blocks). Toast confirmation "Copied to clipboard." |
| **System prompt with app context** | The AI knows this is BetterR.Me and can give productivity-relevant advice rather than being a generic chatbot. | LOW | ProfilesDB for user name and preferences. | Server-side system prompt injected in API route before user messages. Include: app name, user's display name, locale preference. Do NOT include actual user data (habits, tasks, finances) in v7.0. That is a future milestone with security implications. |
| **Auto-scroll with scroll lock** | Auto-scroll during streaming is expected, but must stop if user scrolls up to read earlier content. Resume when user scrolls back to bottom. | LOW | None. | `useAutoScroll` pattern. Track whether user is at bottom of scroll container. Auto-scroll only when at bottom. Show "scroll to bottom" button when user is scrolled up during streaming. |
| **Dark mode support** | App already has dark mode. Chat must respect it. Inconsistent theming breaks trust. | LOW | Existing design tokens and next-themes. | Use existing CSS custom properties. shadcn/ui components already dark-mode-aware. Message bubbles use semantic tokens (--card, --muted, --primary). |
| **Keyboard shortcuts** | Power users expect keyboard-driven interaction. Focus chat input quickly. | LOW | Existing keyboard shortcut patterns from calendar. | `/` to focus input (when not already focused). `Escape` to blur. Follow existing app conventions. |

---

## Anti-Features

Features to explicitly NOT build in v7.0. Some are appropriate for future milestones; others are fundamentally wrong for BetterR.Me.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Tool use / function calling (read user data)** | "AI should see my habits, tasks, and spending." | Massive security surface. Requires careful data scoping, permission model, and prompt injection defense. CLIProxyAPI may not support tool use protocol. AI hallucinating about financial data is dangerous (PROJECT.md explicitly excludes AI financial advice). The money domain's contextual AI insights use safe, rule-based logic for this reason. | Ship plain conversational chat first. Add read-only data context in a future milestone after establishing trust boundaries and testing prompt injection resistance. |
| **AI-generated actions (create tasks, log habits)** | "AI should create tasks from our conversation." | Blurs the line between suggestion and action. Users may not want AI modifying their data without explicit confirmation. Requires write access from chat context, undo capability, and conflict resolution with existing UI state (SWR cache invalidation). | AI suggests actions as text. User manually acts through existing UI. Consider "Create task from this" quick-action button as a future enhancement (still user-confirmed). |
| **File/image upload** | "Let me upload a screenshot or document." | CLIProxyAPI proxy may not support multimodal inputs. Image processing adds latency and cost. Receipt scanning explicitly out of scope in PROJECT.md. Requires file upload infrastructure, size limits, content-type validation. | Text-only chat. If users need to share content, they paste text. Revisit when proxy supports vision models and the use case is validated. |
| **Voice input/output** | "Talk to the AI hands-free." | Requires speech-to-text + text-to-speech integration, audio recording, mobile microphone permissions, streaming audio playback. High complexity for marginal value in a text-centric productivity app. | Text input only. Browser's built-in dictation (mobile keyboard mic button) works as a zero-cost alternative for voice input. |
| **RAG over user documents/journals** | "Search my journals and give me insights." | Requires embedding pipeline, vector storage (pgvector or external), retrieval logic, chunking strategy. Significant infrastructure investment that belongs in a dedicated milestone. | Defer to "AI Insights" milestone. Current money insights use rule-based approach which is safer and more predictable. |
| **Unlimited conversation length** | "I want a 200-message thread." | Claude's context window is finite. Very long conversations degrade response quality and increase latency/cost. Token counting across the full message history is complex. CLIProxyAPI has usage limits tied to Claude subscription. | Cap conversations at a reasonable length (e.g., 50 user messages). Show warning when approaching limit. Offer "Start new conversation" when limit reached. Store the cap as a constant for easy adjustment. |
| **Model selection UI** | "Let me choose between Claude, GPT, Gemini." | Only one proxy (llm.betterr.me) exists, running Claude. Multi-model adds provider abstraction complexity with zero user value when there is only one option. | Single model (Claude via proxy). Abstract the provider in code (AI SDK's provider pattern makes this easy) so switching later is a config change, not a rewrite. No model picker in UI. |
| **Real-time collaboration / shared chats** | "Chat together with my partner about our finances." | Household feature exists for money, but shared AI conversations add complexity: who sees what, concurrent message sends, shared conversation ownership, billing allocation. | Single-user chat only. Each household member has their own chat. Sharing AI conversations is a separate future feature if demand exists. |
| **Streaming markdown artifacts (Claude-style)** | "Show code in a separate panel like Claude.ai artifacts." | Artifacts require: detecting artifact boundaries in stream, split-pane UI, artifact type detection (code vs document vs diagram), artifact management (save, copy, run). Significant UI complexity for a v7.0 feature. | Render everything inline in the chat. Code blocks have copy buttons. If users need artifacts, they use Claude.ai directly. BetterR.Me's value is context, not competing with Claude.ai's UI. |
| **Chat with structured output / forms** | "AI should fill out forms for me." | Structured output requires careful prompt engineering, response validation, error recovery, and UI for displaying forms. Not needed for general conversational chat. | Plain text conversation. Structured interactions (creating habits, tasks, events) belong in the dedicated domain UIs that already exist. |

---

## Feature Dependencies

```
[Existing infrastructure (Auth, Supabase, Design Tokens, i18n, Sidebar)]
    |
    +--> [API route: POST /api/chat]
    |       |
    |       +--> [@ai-sdk/openai-compatible provider config]
    |       |       |
    |       |       +--> [streamText() with llm.betterr.me proxy]
    |       |
    |       +--> [System prompt injection (server-side)]
    |       |
    |       +--> [Auth check (existing middleware)]
    |
    +--> [Chat page UI: /chat]
    |       |
    |       +--> [useChat hook (client-side)]
    |       |       |
    |       |       +--> [Message list component]
    |       |       |       |
    |       |       |       +--> [User message bubble]
    |       |       |       +--> [Assistant message bubble]
    |       |       |       |       |
    |       |       |       |       +--> [Markdown rendering (react-markdown + remark-gfm)]
    |       |       |       |       |       |
    |       |       |       |       |       +--> [Code syntax highlighting]
    |       |       |       |       |       +--> [Copy code block button]
    |       |       |       |       |
    |       |       |       |       +--> [Copy message button]
    |       |       |       |
    |       |       |       +--> [Loading indicator]
    |       |       |       +--> [Error display + retry button]
    |       |       |       +--> [Auto-scroll with scroll lock]
    |       |       |
    |       |       +--> [Message input + send button]
    |       |
    |       +--> [Empty state ("Start a conversation")]
    |       +--> [Responsive layout (desktop/mobile)]
    |       +--> [Dark mode (existing tokens)]
    |       +--> [i18n labels (3 locales)]
    |
    +--> [Sidebar nav item: "Chat"]
    |
    +--> [Conversation persistence (Phase 2)]
            |
            +--> [Supabase tables: conversations + chat_messages + RLS]
            |       |
            |       +--> [ConversationsDB + ChatMessagesDB classes]
            |       +--> [Zod validation schemas]
            |
            +--> [Save messages to DB after each exchange]
            |
            +--> [Load conversation history (initialMessages)]
            |
            +--> [Conversation list sidebar]
            |       |
            |       +--> [New conversation button]
            |       +--> [Delete conversation]
            |       +--> [Auto-generated titles]
            |
            +--> [Conversation API routes (CRUD)]
```

### Dependency Notes

1. **API route must exist before UI can function.** The `useChat` hook needs a POST endpoint (`/api/chat`) to send messages to. This endpoint handles auth, system prompt injection, and proxying to llm.betterr.me. Build this first.

2. **Markdown rendering is critical for streaming UX.** Partial markdown during streaming causes flicker if the renderer re-parses the entire message on each token. Use the memoized markdown pattern from the AI SDK cookbook: split content into completed blocks (paragraphs, code fences) and only re-render the last in-progress block.

3. **Conversation persistence is independent of the core chat.** The basic chat works without DB storage (messages in React state). Persistence is a separate phase that adds durability. This allows shipping a working chat quickly and adding persistence after.

4. **System prompt is server-only.** Never send the system prompt to the client. It is injected in the API route before forwarding to the proxy. This prevents users from seeing or manipulating it via browser dev tools.

5. **The AI SDK provider pattern makes the proxy integration clean.** `@ai-sdk/openai-compatible` with `baseURL` pointing at llm.betterr.me means the client code is provider-agnostic. Switching to a different model or provider later is a server-side config change.

6. **Auth gate is already solved.** The existing Supabase SSR middleware redirects unauthenticated users. The `/chat` route just needs to be under the protected route group. Zero new auth work.

---

## MVP Definition

### Launch With (v7.0 Phase 1 -- Core Chat)

Minimum viable chat that validates the proxy integration and delivers a usable conversational interface.

- [ ] API route (`POST /api/chat`) proxying to llm.betterr.me with streaming via Vercel AI SDK
- [ ] Chat page at `/chat` with auth gate
- [ ] Message input with Enter-to-send and Shift+Enter for newline
- [ ] Streaming message display (user + assistant bubbles with visual distinction)
- [ ] Markdown rendering with GFM support (headers, lists, bold, links, tables)
- [ ] Code block syntax highlighting with copy-to-clipboard button
- [ ] Loading indicator while AI is processing
- [ ] Error display with retry capability
- [ ] Responsive layout (mobile-friendly)
- [ ] i18n for all UI chrome (3 locales)
- [ ] Dark mode support via existing design tokens
- [ ] Sidebar navigation item for "Chat"
- [ ] Empty state for new users ("Start a conversation")

### Add After Core Works (v7.0 Phase 2 -- Persistence)

Features that require the core chat to be working and stable first.

- [ ] Supabase tables for conversations and chat_messages with RLS
- [ ] DB classes (ConversationsDB, ChatMessagesDB) with unit tests
- [ ] Save messages to DB after each assistant response completes
- [ ] Load conversation history on page load (initialMessages)
- [ ] Conversation list sidebar/panel
- [ ] New conversation button
- [ ] Delete conversation
- [ ] Auto-generated conversation titles (first user message or model summary)
- [ ] Copy message content button
- [ ] System prompt with user context (display name, locale)

### Future Consideration (v8+)

Features to defer until chat foundation is solid and user patterns are understood.

- [ ] Read-only app data in system prompt (habit summary, task list, recent journal mood)
- [ ] "Create task from this" action button on assistant messages
- [ ] Conversation search across all conversations
- [ ] Conversation export (markdown or JSON)
- [ ] Token usage tracking / cost awareness display
- [ ] Multi-model support if additional providers are added
- [ ] Keyboard shortcut (`/`) to focus chat input

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming API route (proxy to llm.betterr.me) | HIGH | MEDIUM | P1 |
| Chat message UI (bubbles, input, layout) | HIGH | LOW | P1 |
| Markdown + code block rendering | HIGH | MEDIUM | P1 |
| Loading/error states with retry | HIGH | LOW | P1 |
| Responsive layout | HIGH | MEDIUM | P1 |
| i18n for UI chrome | MEDIUM | LOW | P1 |
| Sidebar nav item | LOW | LOW | P1 |
| Conversation persistence (DB tables + RLS) | HIGH | MEDIUM | P2 |
| Conversation list/management UI | MEDIUM | MEDIUM | P2 |
| Save/load message history | HIGH | LOW | P2 |
| Auto-title generation | LOW | LOW | P2 |
| Copy message button | MEDIUM | LOW | P2 |
| System prompt with user context | MEDIUM | LOW | P2 |
| New conversation / delete conversation | MEDIUM | LOW | P2 |
| Auto-scroll with scroll lock | MEDIUM | LOW | P2 |
| App data in system prompt | HIGH | HIGH | P3 (future) |
| Action buttons on messages | MEDIUM | HIGH | P3 (future) |
| Conversation search | LOW | MEDIUM | P3 (future) |

**Priority key:**
- P1: Must have for launch -- chat does not function without these
- P2: Should have, add in same milestone after core chat works
- P3: Nice to have, future milestone consideration

---

## Complexity Assessment

| Component | Complexity | Rationale |
|-----------|------------|-----------|
| **API route with AI SDK streaming** | MEDIUM | Provider configuration, system prompt injection, error handling, auth check. Well-documented pattern in AI SDK docs. Main uncertainty: CLIProxyAPI compatibility with AI SDK's streaming protocol. |
| **Chat message UI** | LOW | Message bubbles, input textarea, send button. Standard chat layout. shadcn-chat provides reference components. |
| **Markdown rendering (streaming)** | MEDIUM | `react-markdown` + `remark-gfm` is straightforward. The complexity is in memoizing completed blocks during streaming to avoid flicker. AI SDK cookbook covers this pattern. |
| **Code syntax highlighting** | LOW-MEDIUM | Component override in react-markdown for code blocks. Choose between `react-syntax-highlighter` (simpler, larger bundle) and `shiki` (better output, more setup). Copy button is trivial. |
| **Conversation persistence (DB)** | MEDIUM | Two new tables, RLS policies, DB classes, Zod schemas. Follows existing patterns exactly. The integration point (saving after streaming completes, loading on page mount) needs care to avoid race conditions. |
| **Conversation list UI** | MEDIUM | Sidebar panel with list, click to load, delete button. On mobile: slide-over or top-level navigation. State management for "which conversation is active." |
| **Auto-scroll** | LOW | Track scroll position, conditionally scroll on new content. Well-established pattern. shadcn-chat has a `useAutoScroll` hook. |
| **Responsive layout** | MEDIUM | Desktop: sidebar + chat area. Mobile: full-width chat, conversation list as separate view. Input pinned to bottom. Virtual keyboard handling on mobile. |
| **System prompt** | LOW | String template in API route. Insert user name and preferences. No complex logic. |
| **i18n** | LOW | Add `chat` namespace with ~20 strings to 3 locale files. Standard pattern. |

**Overall estimate:** This milestone is significantly smaller than v4.0 (Money) or v6.0 (Calendar). The core chat (Phase 1) is ~2-3 days of implementation. Persistence (Phase 2) adds ~2-3 more days. The main risk is CLIProxyAPI compatibility with the AI SDK streaming protocol -- if the proxy does not implement SSE correctly, the streaming integration may require custom handling.

---

## Competitor Feature Analysis

| Feature | ChatGPT | Claude.ai | Notion AI | BetterR.Me v7.0 Approach |
|---------|---------|-----------|-----------|--------------------------|
| Streaming responses | Yes | Yes | Yes | Yes -- AI SDK + llm.betterr.me proxy |
| Conversation persistence | Yes, cloud-synced | Yes, cloud-synced | In-page context only | Session first (Phase 1), then Supabase persistence (Phase 2) |
| Markdown rendering | Full + LaTeX | Full + artifacts | Full | Full GFM + code highlighting. No LaTeX (not needed for productivity). |
| Code blocks | Syntax highlighted + copy | Syntax highlighted + artifacts | Basic | Syntax highlighted + copy button |
| Context awareness | Custom GPTs, memory | Projects, MCP tools | Deep workspace search | System prompt with user profile (v7.0). App data context (future). |
| Tool use / actions | Browsing, code exec, DALL-E | MCP, computer use, artifacts | Autonomous agents (20 min) | Not in v7.0. Future milestone. |
| Multi-model | GPT-4o, o3, o4-mini | Claude only | GPT-5.2, Claude, Gemini | Claude only (single proxy). Provider abstraction for future flexibility. |
| File upload | Images, docs, code | Images, docs | Workspace files | Not in v7.0. Text only. |
| Mobile experience | Native iOS/Android app | Responsive web | Native iOS/Android app | Responsive web (same as existing BetterR.Me app) |
| Integration with app data | N/A | Shallow (project files) | Deep (all workspace data) | Shallow in v7.0 (profile only). Deep integration is the long-term differentiator. |
| Pricing | Free tier + $20/mo Pro | Free tier + $20/mo Pro | Bundled in $20/mo Business | Free (no billing in v7.0). Proxy cost is Claude subscription. |

**Key insight:** BetterR.Me's long-term differentiator is NOT building another ChatGPT clone. It is contextual AI that understands the user's habits, tasks, finances, and goals. v7.0 builds the chat plumbing; future milestones make it context-aware. The chat alone is not the product -- the chat connected to user data is the product.

---

## Integration with Existing BetterR.Me Features

### Navigation Structure

Current sidebar (post-v6.0): Dashboard | Calendar | Habits | Tasks | Projects | Journal | Workouts | Money

Recommended addition:
```
Dashboard    (existing)
Calendar     (existing)
Chat         (NEW -- after Calendar, before Habits)
Habits       (existing)
Tasks        (existing)
Projects     (existing)
Journal      (existing)
Workouts     (existing)
Money        (existing)
```

Chat placed high in the nav because it is a cross-cutting feature (like Dashboard and Calendar) rather than a domain-specific one. Users will use it alongside all domains.

### No Dashboard Changes

The dashboard does not need a chat widget or AI summary for v7.0. Chat is a standalone page. Future milestones could add an "Ask AI" shortcut on the dashboard, but that is scope creep for the foundation milestone.

### Shared UI Patterns

| Pattern | Existing Usage | Chat Usage |
|---|---|---|
| SWR + keepPreviousData | All domain data fetching | Conversation list fetching (not for streaming) |
| Zod validation | All POST/PATCH routes | Message input validation, conversation CRUD |
| DB class pattern | HabitsDB, TasksDB, etc. | ConversationsDB, ChatMessagesDB |
| Design tokens | All views | Message bubbles, input area, sidebar |
| i18n message keys | habits.*, tasks.*, calendar.* | chat.* namespace |
| Supabase RLS | All tables scoped by user_id | conversations and chat_messages scoped by user_id |
| shadcn/ui components | All UI | Button, Textarea, ScrollArea, Sheet (mobile sidebar) |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **CLIProxyAPI streaming incompatibility** | MEDIUM | HIGH | Test the proxy endpoint with a simple fetch + SSE reader before building the full UI. If AI SDK's streaming protocol is incompatible, fall back to manual SSE parsing with `fetch` + `ReadableStream`. |
| **Proxy rate limits / downtime** | MEDIUM | MEDIUM | Display clear error messages. Implement retry with backoff. Consider a health check endpoint to show proxy status. The proxy uses a Claude subscription which has usage limits. |
| **Markdown rendering flicker during streaming** | MEDIUM | LOW | Use memoized markdown component pattern from AI SDK cookbook. Split content at paragraph boundaries and only re-render the last block. |
| **Message loss on page refresh (before persistence)** | CERTAIN | MEDIUM | Acceptable for Phase 1. Document that conversations are temporary until persistence is added. Phase 2 resolves this. |
| **Token/context limits** | LOW | MEDIUM | Cap conversation length at 50 messages. Monitor for degraded responses on longer conversations. The proxy may truncate or error on oversized requests. |
| **Cost scaling** | LOW | LOW | Single user (personal app). Claude subscription has generous limits. No per-token API cost since it goes through CLIProxyAPI. Monitor if other users are added. |

---

## Sources

- [Vercel AI SDK - useChat hook reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK - OpenAI Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AI SDK - Custom Provider guide](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers)
- [AI SDK - Getting Started with Next.js App Router](https://ai-sdk.dev/docs/getting-started/nextjs-app-router)
- [AI SDK - Markdown Chatbot with Memoization cookbook](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization)
- [shadcn-chat - Chat UI components for shadcn/ui](https://shadcn-chat.vercel.app/)
- [Vercel AI SDK persistence discussion (GitHub)](https://github.com/vercel/ai/discussions/4845)
- [Notion AI features and agents (2026)](https://www.notion.com/product/ai)
- [Day One User Expectations From AI Copilots in 2026](https://www.harshal-patil.com/post/ai-copilot-expectations-day-one)
- [CLIProxyAPI reference](llm.betterr.me -- internal docs)

---
*Feature research for: AI Chat Foundation (v7.0) in BetterR.Me*
*Researched: 2026-04-02*
