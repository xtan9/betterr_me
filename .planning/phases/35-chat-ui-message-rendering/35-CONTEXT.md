# Phase 35: Chat UI & Message Rendering - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A chat page at `app/chat/page.tsx` with message bubbles, streaming markdown rendering via `react-markdown` + `remark-gfm`, a stop button, keyboard shortcuts (Enter to send, Shift+Enter for newline, Escape to stop), and dark mode support using existing design tokens. Connects to the `POST /api/chat` endpoint built in Phase 34. No conversation persistence in this phase (that's Phase 36) — messages live in client state only.

</domain>

<decisions>
## Implementation Decisions

### Message Layout
- **D-01:** User messages right-aligned with primary-tinted background, assistant messages left-aligned with muted background — clear visual differentiation without avatars
- **D-02:** No avatars or icons — keep the layout clean and simple for v7.0
- **D-03:** Messages displayed in a scrollable container that auto-scrolls to the latest message during streaming

### Markdown Rendering
- **D-04:** Use `react-markdown` with `remark-gfm` plugin for full GitHub Flavored Markdown — bold, italic, lists, blockquotes, tables, inline code, and fenced code blocks
- **D-05:** No syntax highlighting for code blocks in v7.0 — render with monospace font and muted background only
- **D-06:** Markdown components should use existing design tokens for colors, spacing, and typography

### Streaming UX
- **D-07:** Blinking cursor (CSS animation) appended at the end of assistant's streaming text
- **D-08:** Stop button visible only during active streaming — clicking it or pressing Escape aborts the generation
- **D-09:** After stopping, the partial response remains visible (not discarded)

### Input Area
- **D-10:** Auto-resizing textarea that grows up to ~6 lines (approximately 150px), then scrolls internally
- **D-11:** Send button on the right side of the input area — disabled while streaming or when input is empty
- **D-12:** Enter sends the message, Shift+Enter inserts a newline, Escape stops generation (when streaming)

### Empty/Initial State
- **D-13:** Centered greeting message ("How can I help?") before first message — minimal, no suggested prompts
- **D-14:** Empty state disappears once the first message is sent

### AI SDK Client Integration
- **D-15:** Use `useChat` hook from `@ai-sdk/react` with `streamProtocol: 'text'` — required because Phase 34's API route uses `toTextStreamResponse()` (not `toDataStreamResponse()`)
- **D-16:** `useChat` configured with `api: '/api/chat'` — browser never talks directly to llm.betterr.me
- **D-17:** Error handling: display error message from `useChat`'s `error` state with a retry button (reuses Phase 34's error response format)

### Dark Mode
- **D-18:** All chat UI colors use existing BetterR.Me semantic design tokens (bg-background, text-foreground, bg-muted, bg-primary, etc.)
- **D-19:** No new CSS custom properties needed — leverage existing token system

### Claude's Discretion
- Exact pixel values for message bubble padding, border-radius, and max-width
- Textarea placeholder text
- Animation timing for blinking cursor
- Component file organization within `components/chat/`
- Whether to use a layout.tsx for the chat route

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI SDK Integration
- `.planning/research/STACK.md` — Package versions, `useChat` hook usage, streaming protocol options
- `.planning/research/ARCHITECTURE.md` — System overview, client-server data flow
- `.planning/research/PITFALLS.md` — Streaming buffering, auth ordering, abort handling

### Phase 34 Foundation (built code)
- `app/api/chat/route.ts` — Streaming API endpoint (uses `toTextStreamResponse()`)
- `lib/ai/provider.ts` — LLM provider configuration
- `lib/validations/chat.ts` — Zod schema for chat messages

### Existing Patterns
- `components/layouts/` — App layout pattern (sidebar, content area)
- `components/ui/` — shadcn/ui primitives (Button, Textarea, Card, etc.)
- `app/dashboard/page.tsx` — Example page with client components and dark mode
- `lib/utils.ts` — `cn()` utility for conditional classnames

### Design System
- `.planning/codebase/CONVENTIONS.md` — Naming, file structure, import organization
- `tailwind.config.ts` — Design tokens, color palette, spacing scale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/button.tsx`: shadcn Button — use for send/stop buttons
- `components/ui/textarea.tsx`: shadcn Textarea — base for auto-resizing input (may need wrapper)
- `lib/utils.ts` (`cn()`): Tailwind class merging utility — used everywhere
- `components/layouts/`: Sidebar + content layout — chat page fits within existing layout shell
- `@ai-sdk/react` (`useChat`): Already installed in Phase 34 — manages messages, streaming state, abort

### Established Patterns
- Client components: `"use client"` directive, SWR for data fetching (but useChat replaces SWR for chat)
- Dark mode: `next-themes` class strategy, all colors via CSS custom properties in design tokens
- Page structure: `app/{domain}/page.tsx` with domain-specific components in `components/{domain}/`
- Keyboard shortcuts: Used in calendar (Phase 32) — can reference pattern but chat shortcuts are simpler (just input handlers)

### Integration Points
- `app/chat/page.tsx` — New page route (no existing chat directory)
- `components/chat/` — New component directory for chat-specific components
- Sidebar navigation — Phase 37 adds the nav link; Phase 35 just needs the page accessible via URL

</code_context>

<specifics>
## Specific Ideas

- The API route uses `toTextStreamResponse()` which means `useChat` MUST use `streamProtocol: 'text'` — this is a critical integration detail
- No conversation persistence in this phase — `useChat` manages messages in React state only
- Phase 36 will add persistence, so component structure should make it easy to add `id` (conversationId) to `useChat` later
- Keep the UI simple and focused — this is a personal app, not a commercial chat product

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-chat-ui-message-rendering*
*Context gathered: 2026-04-03*
