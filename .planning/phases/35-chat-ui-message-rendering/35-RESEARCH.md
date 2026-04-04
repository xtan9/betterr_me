# Phase 35: Chat UI & Message Rendering - Research

**Researched:** 2026-04-03
**Domain:** React chat UI with streaming markdown rendering (AI SDK + react-markdown)
**Confidence:** HIGH

## Summary

This phase builds the client-side chat interface that connects to the Phase 34 streaming API. The core integration uses `useChat` from `@ai-sdk/react` with `TextStreamChatTransport` from `ai` (matching the server's `toTextStreamResponse()`), and `react-markdown` + `remark-gfm` for rendering Claude's formatted responses. All three packages are already installed.

The key technical decisions are well-constrained by CONTEXT.md. The `useChat` hook manages message state, streaming status (`submitted` | `streaming` | `ready` | `error`), and abort via `stop()`. Messages use the `UIMessage` type with `parts` arrays where each `TextUIPart` has a `state` property (`'streaming'` | `'done'`) that enables the blinking cursor effect. The chat page fits into the existing `SidebarShell` layout pattern used by all other app pages.

Testing follows established project patterns: mock `@ai-sdk/react`'s `useChat` hook with `vi.mock`, render components with Testing Library, verify keyboard handlers and conditional rendering. No new dev dependencies needed.

**Primary recommendation:** Use `TextStreamChatTransport` (not `DefaultChatTransport`) for the `useChat` transport since the API route uses `toTextStreamResponse()`. Structure components as `ChatPage` (server) -> `ChatContent` (client, useChat) -> `MessageList` + `ChatInput` + `MarkdownRenderer`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** User messages right-aligned with primary-tinted background, assistant messages left-aligned with muted background -- clear visual differentiation without avatars
- **D-02:** No avatars or icons -- keep the layout clean and simple for v7.0
- **D-03:** Messages displayed in a scrollable container that auto-scrolls to the latest message during streaming
- **D-04:** Use `react-markdown` with `remark-gfm` plugin for full GitHub Flavored Markdown
- **D-05:** No syntax highlighting for code blocks in v7.0 -- render with monospace font and muted background only
- **D-06:** Markdown components should use existing design tokens for colors, spacing, and typography
- **D-07:** Blinking cursor (CSS animation) appended at the end of assistant's streaming text
- **D-08:** Stop button visible only during active streaming -- clicking it or pressing Escape aborts the generation
- **D-09:** After stopping, the partial response remains visible (not discarded)
- **D-10:** Auto-resizing textarea that grows up to ~6 lines (~150px), then scrolls internally
- **D-11:** Send button on the right side of the input area -- disabled while streaming or when input is empty
- **D-12:** Enter sends the message, Shift+Enter inserts a newline, Escape stops generation (when streaming)
- **D-13:** Centered greeting message ("How can I help?") before first message -- minimal, no suggested prompts
- **D-14:** Empty state disappears once the first message is sent
- **D-15:** Use `useChat` hook from `@ai-sdk/react` with `streamProtocol: 'text'` -- required because Phase 34's API route uses `toTextStreamResponse()` (not `toDataStreamResponse()`)
- **D-16:** `useChat` configured with `api: '/api/chat'` -- browser never talks directly to llm.betterr.me
- **D-17:** Error handling: display error message from `useChat`'s `error` state with a retry button
- **D-18:** All chat UI colors use existing BetterR.Me semantic design tokens
- **D-19:** No new CSS custom properties needed -- leverage existing token system

### Claude's Discretion
- Exact pixel values for message bubble padding, border-radius, and max-width
- Textarea placeholder text
- Animation timing for blinking cursor
- Component file organization within `components/chat/`
- Whether to use a layout.tsx for the chat route

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-02 | User can see Claude's response rendered as formatted markdown (bold, lists, code blocks) | `react-markdown` + `remark-gfm` with custom Tailwind-styled components; render `message.parts` where `part.type === 'text'` |
| CHAT-03 | User can stop Claude's response mid-generation | `useChat`'s `stop()` method + `status` state; stop button visible when `status === 'streaming'`; partial response preserved (D-09) |
| INTG-03 | Chat UI respects dark mode using existing design tokens | All colors via semantic tokens (bg-background, bg-muted, bg-primary, text-foreground, etc.); no new CSS custom properties |
| INTG-04 | User can send with Enter, newline with Shift+Enter, stop with Escape | `onKeyDown` handler on textarea: Enter without Shift calls `sendMessage()`, Shift+Enter default behavior, Escape calls `stop()` when streaming |

</phase_requirements>

## Standard Stack

### Core (already installed)

| Library | Installed | Latest | Purpose | Why Standard |
|---------|-----------|--------|---------|--------------|
| `@ai-sdk/react` | 3.0.146 | 3.0.147 | `useChat` hook for chat state management | Manages messages, streaming status, send/stop/regenerate -- eliminates 150+ lines of manual state |
| `ai` | 6.0.144 | 6.0.145 | `TextStreamChatTransport`, `UIMessage` types | Transport layer matching server's `toTextStreamResponse()` |
| `react-markdown` | 10.1.0 | 10.1.0 | Render markdown in assistant messages | Standard React markdown renderer, sanitizes by default, supports custom components |
| `remark-gfm` | 4.0.1 | 4.0.1 | GFM tables, strikethrough, task lists | Extends react-markdown with GitHub Flavored Markdown |

**No new packages to install.** All dependencies were added in Phase 34.

### Supporting (already in project)

| Library | Purpose | How Used in Chat |
|---------|---------|-----------------|
| `lucide-react` | Icons | Send icon, Square/StopCircle for stop button |
| `shadcn/ui Button` | Send/stop/retry buttons | Existing component, no modifications |
| `shadcn/ui Textarea` | Message input base | Wrap with auto-resize logic |
| `next-themes` | Dark mode detection | Existing class-based system, no chat-specific code needed |
| `cn()` from `lib/utils` | Conditional classes | Message bubble alignment, streaming state styles |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `TextStreamChatTransport` | `DefaultChatTransport` | DefaultChatTransport expects data stream protocol (`toDataStreamResponse`); our API uses `toTextStreamResponse` so TextStreamChatTransport is required |
| `react-markdown` | `marked` + raw HTML insertion | XSS risk without sanitization library, no React component integration, can't use Tailwind classes on markdown elements |
| Custom streaming state | `useChat` hook | useChat already manages messages[], status, stop(), error -- building custom is 150+ lines of fragile code |

## Architecture Patterns

### Recommended Component Structure

```
app/
  chat/
    layout.tsx          # SidebarShell wrapper (same pattern as dashboard)
    page.tsx            # Server component: auth check, render ChatContent
components/
  chat/
    chat-content.tsx    # "use client" -- useChat hook, orchestrates all chat UI
    message-list.tsx    # Scrollable message container with auto-scroll
    message-bubble.tsx  # Single message: user (right) or assistant (left)
    markdown-renderer.tsx  # react-markdown with custom Tailwind components
    chat-input.tsx      # Auto-resizing textarea + send/stop buttons + keyboard
    chat-empty-state.tsx   # "How can I help?" centered greeting
```

### Pattern 1: useChat with TextStreamChatTransport

**What:** Connect the client to the Phase 34 text stream API endpoint
**When to use:** Always -- this is the only transport that works with `toTextStreamResponse()`

```typescript
// components/chat/chat-content.tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';

export function ChatContent() {
  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport: new TextStreamChatTransport({ api: '/api/chat' }),
  });

  const isStreaming = status === 'submitted' || status === 'streaming';

  // sendMessage({ text: inputValue }) to send
  // stop() to abort streaming
}
```

**CRITICAL:** CONTEXT.md says `streamProtocol: 'text'` but in AI SDK v6, the `useChat` hook uses a `transport` object instead of `streamProtocol` string. `TextStreamChatTransport` is the v6 equivalent of `streamProtocol: 'text'`. The STACK.md research confirms `DefaultChatTransport` is for the data stream protocol.

### Pattern 2: Message Rendering with Parts

**What:** Render UIMessage using the `parts` array (not a top-level `content` string)
**When to use:** For all message rendering

```typescript
// components/chat/message-bubble.tsx
import type { UIMessage } from 'ai';

function MessageBubble({ message }: { message: UIMessage }) {
  return (
    <div className={cn(
      'max-w-[80%] rounded-2xl px-4 py-3',
      message.role === 'user'
        ? 'ml-auto bg-primary text-primary-foreground'
        : 'mr-auto bg-muted text-foreground'
    )}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return message.role === 'assistant' ? (
            <MarkdownRenderer key={i} content={part.text} />
          ) : (
            <p key={i} className="whitespace-pre-wrap">{part.text}</p>
          );
        }
        return null;
      })}
      {/* Blinking cursor for streaming assistant messages */}
      {message.role === 'assistant' &&
        message.parts.some(p => p.type === 'text' && p.state === 'streaming') && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-foreground animate-pulse" />
      )}
    </div>
  );
}
```

### Pattern 3: Auto-Scroll During Streaming

**What:** Scroll to bottom when new content arrives during streaming
**When to use:** In the message list container

```typescript
// components/chat/message-list.tsx
const scrollRef = useRef<HTMLDivElement>(null);
const [autoScroll, setAutoScroll] = useState(true);

useEffect(() => {
  if (autoScroll && scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }
}, [messages, autoScroll]);

// Disable auto-scroll if user scrolls up
const handleScroll = () => {
  if (!scrollRef.current) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
  setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
};
```

### Pattern 4: Auto-Resizing Textarea

**What:** Textarea grows to ~6 lines then scrolls internally
**When to use:** Chat input area

```typescript
// components/chat/chat-input.tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);

const adjustHeight = () => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
};

const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (inputValue.trim() && !isStreaming) {
      handleSend();
    }
  }
  if (e.key === 'Escape' && isStreaming) {
    stop();
  }
};
```

### Pattern 5: Page Structure (matches existing app pattern)

**What:** Server component page with auth check, client component for interactivity

```typescript
// app/chat/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatContent } from "@/components/chat/chat-content";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return <ChatContent />;
}

// app/chat/layout.tsx
import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function ChatLayout({
  children,
}: { children: React.ReactNode }) {
  return <SidebarShell>{children}</SidebarShell>;
}
```

### Anti-Patterns to Avoid

- **Using `DefaultChatTransport` with `toTextStreamResponse()`:** Will silently fail or produce garbled output. The server uses text stream protocol, so the client MUST use `TextStreamChatTransport`.
- **Accessing `message.content` instead of `message.parts`:** AI SDK v6 `UIMessage` uses `parts` array. There is no top-level `content` string.
- **Creating a new `TextStreamChatTransport` on every render:** Instantiate transport outside the component or use `useMemo` to avoid reconnection on every re-render.
- **Using SWR for chat data:** `useChat` manages its own state. Wrapping it in SWR conflicts with the streaming interaction model.
- **Importing `useChat` from `ai` instead of `@ai-sdk/react`:** The hook is in `@ai-sdk/react`, not the core `ai` package.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat state management | useState + useEffect + AbortController | `useChat` hook | 150+ lines, error-prone abort handling, race conditions |
| Streaming text accumulation | Manual ReadableStream parsing | `TextStreamChatTransport` | Handles SSE parsing, chunk assembly, abort signal forwarding |
| Markdown rendering | regex-based parser or raw HTML injection | `react-markdown` + `remark-gfm` | XSS-safe by default, React component tree, custom element styling |
| Auto-scroll detection | Manual scroll position tracking (complex) | Simple scrollHeight check with threshold | Only need a ~50px threshold check, not a library |
| Textarea auto-resize | Library like `react-textarea-autosize` | 5 lines of scrollHeight logic | Simple enough; adding a dependency for 5 lines is overkill |

**Key insight:** The AI SDK + react-markdown combination handles all the complex parts (streaming protocol, state machine, safe markdown parsing). The custom code is limited to layout, styling, and keyboard shortcuts.

## Common Pitfalls

### Pitfall 1: Transport Protocol Mismatch
**What goes wrong:** Chat sends messages but receives no response, or response is garbled/appears all at once
**Why it happens:** Using `DefaultChatTransport` (data stream) with a server that returns `toTextStreamResponse()` (text stream). The protocols are incompatible.
**How to avoid:** Use `TextStreamChatTransport` from `ai` package. Verify in browser DevTools Network tab that the response Content-Type is `text/plain; charset=utf-8`.
**Warning signs:** Empty messages, JSON parse errors in console, response appears all at once instead of streaming

### Pitfall 2: Transport Re-instantiation on Every Render
**What goes wrong:** Chat reconnects or drops messages on every keystroke/re-render
**Why it happens:** `new TextStreamChatTransport(...)` inside the component body creates a new instance each render, which useChat treats as a transport change.
**How to avoid:** Create the transport as a module-level constant or use `useMemo`:
```typescript
const transport = useMemo(() => new TextStreamChatTransport({ api: '/api/chat' }), []);
```
**Warning signs:** Multiple network requests in DevTools, messages disappearing

### Pitfall 3: Markdown Rendered in User Messages
**What goes wrong:** User messages with `**bold**` or `*italic*` get rendered as formatted markdown, making the user's exact input invisible
**Why it happens:** Applying react-markdown to all messages instead of just assistant messages
**How to avoid:** Only use `MarkdownRenderer` for `role === 'assistant'` messages. User messages render as plain `whitespace-pre-wrap` text.
**Warning signs:** User messages look different from what was typed

### Pitfall 4: Enter Key Sends Empty Messages
**What goes wrong:** Pressing Enter on an empty input sends an empty message or causes an error
**Why it happens:** Missing guard in the keyDown handler
**How to avoid:** Check `inputValue.trim()` before calling `sendMessage()`. Also disable the send button when input is empty (D-11).
**Warning signs:** Empty message bubbles, 400 errors from API validation

### Pitfall 5: Auto-Scroll Fights User Scrolling
**What goes wrong:** User scrolls up to read earlier messages, but the view keeps snapping to the bottom during streaming
**Why it happens:** Auto-scroll runs unconditionally on every message update
**How to avoid:** Track whether user has scrolled up (scrollHeight - scrollTop - clientHeight > threshold). Only auto-scroll when user is near the bottom.
**Warning signs:** Impossible to read earlier messages during streaming

### Pitfall 6: Blinking Cursor Persists After Streaming Ends
**What goes wrong:** The blinking cursor remains visible after the response is complete
**Why it happens:** Checking `status === 'streaming'` globally instead of checking the `state` property on individual text parts
**How to avoid:** Use `part.state === 'streaming'` on the last text part of the message, not the global chat status. When the stream finishes, parts transition to `state: 'done'`.
**Warning signs:** Cursor visible on completed messages

## Code Examples

### Complete MarkdownRenderer with Tailwind Design Tokens

```typescript
// components/chat/markdown-renderer.tsx
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className={cn('prose-sm break-words', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        code: ({ children, className: codeClassName }) => {
          // Fenced code blocks have a className like "language-js"
          const isBlock = codeClassName?.startsWith('language-');
          if (isBlock) {
            return (
              <pre className="rounded-md bg-muted/50 p-3 my-2 overflow-x-auto text-sm">
                <code className="font-mono">{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-muted/50 px-1.5 py-0.5 text-sm font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,  // Prevent double <pre> wrapping
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border px-2 py-1">{children}</td>
        ),
      }}
    />
  );
}
```

### Keyboard Shortcut Handler

```typescript
// In chat-input.tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    if (inputValue.trim() && !isStreaming) {
      handleSend();
    }
  }
  if (e.key === 'Escape' && isStreaming) {
    e.preventDefault();
    stop();
  }
};
```

**Note:** The `isComposing` check prevents sending while typing CJK characters with an IME (important for zh/zh-TW locales).

### Blinking Cursor CSS

```css
/* In globals.css or as a Tailwind @layer component */
@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.animate-blink-cursor {
  animation: blink-cursor 1s step-end infinite;
}
```

Or use Tailwind's built-in `animate-pulse` for a simpler fade effect (slower, less sharp than a true cursor blink).

### Testing Pattern: Mock useChat

```typescript
// tests/components/chat/chat-content.test.tsx
const { mockSendMessage, mockStop, mockUseChat } = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockStop = vi.fn();
  const mockUseChat = vi.fn(() => ({
    messages: [],
    sendMessage: mockSendMessage,
    stop: mockStop,
    status: 'ready' as const,
    error: undefined,
    clearError: vi.fn(),
    setMessages: vi.fn(),
    id: 'test-chat',
    regenerate: vi.fn(),
    resumeStream: vi.fn(),
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: vi.fn(),
  }));
  return { mockSendMessage, mockStop, mockUseChat };
});

vi.mock('@ai-sdk/react', () => ({
  useChat: mockUseChat,
}));

// In tests:
mockUseChat.mockReturnValue({
  ...mockUseChat(),
  messages: [
    { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    { id: '2', role: 'assistant', parts: [{ type: 'text', text: '**Hi!**', state: 'done' }] },
  ],
  status: 'ready',
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useChat` with `streamProtocol: 'text'` option | `useChat` with `transport: new TextStreamChatTransport()` | AI SDK v6 (late 2025) | Transport objects replace string protocol option; more extensible |
| `message.content` (string) | `message.parts` (array of typed parts) | AI SDK v6 | Parts enable mixed content (text + tool calls + files); must iterate parts for rendering |
| `useChat` returns `handleSubmit`/`handleInputChange` | `useChat` returns `sendMessage`/`stop`/`status` | AI SDK v6 | v6 useChat has no built-in input management; manage input state separately |
| `isLoading` boolean | `status: 'submitted' \| 'streaming' \| 'ready' \| 'error'` | AI SDK v6 | More granular status; `submitted` = request sent but no tokens yet, `streaming` = tokens arriving |

**Important v6 change:** `useChat` no longer provides `input`, `setInput`, `handleInputChange`, or `handleSubmit`. These were removed in v6. The component must manage its own textarea state with `useState` and call `sendMessage({ text })` manually. This is actually simpler for our use case since we need custom keyboard handling anyway.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + Testing Library |
| Config file | `vitest.config.ts` (jsdom, globals, setup: `tests/setup.ts`) |
| Quick run command | `pnpm test:run -- tests/components/chat/` |
| Full suite command | `pnpm test:run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-02 | Markdown renders bold, lists, code blocks | unit | `pnpm test:run -- tests/components/chat/markdown-renderer.test.tsx -x` | Wave 0 |
| CHAT-03 | Stop button halts streaming | unit | `pnpm test:run -- tests/components/chat/chat-content.test.tsx -x` | Wave 0 |
| INTG-03 | Dark mode design tokens applied | unit | `pnpm test:run -- tests/components/chat/message-bubble.test.tsx -x` | Wave 0 |
| INTG-04 | Enter sends, Shift+Enter newline, Escape stops | unit | `pnpm test:run -- tests/components/chat/chat-input.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:run -- tests/components/chat/`
- **Per wave merge:** `pnpm test:run && pnpm lint`
- **Phase gate:** Full suite green + lint clean before verification

### Wave 0 Gaps
- [ ] `tests/components/chat/markdown-renderer.test.tsx` -- covers CHAT-02
- [ ] `tests/components/chat/chat-content.test.tsx` -- covers CHAT-03
- [ ] `tests/components/chat/message-bubble.test.tsx` -- covers INTG-03
- [ ] `tests/components/chat/chat-input.test.tsx` -- covers INTG-04
- [ ] `tests/components/chat/chat-empty-state.test.tsx` -- covers empty state rendering

## Project Constraints (from CLAUDE.md)

- **Git workflow:** Create feature branch and PR, never push to main
- **Testing:** Always add tests when creating a PR
- **i18n:** When adding new strings, add to all three locale files (en, zh, zh-TW) -- note: Phase 37 handles i18n for chat, but any user-visible strings in this phase should still be translatable
- **Files:** kebab-case filenames, PascalCase components
- **Client components:** `"use client"` only when needed
- **API error handling:** `try/catch` -> `console.error` -> `NextResponse.json({ error }, { status })`
- **UI primitives:** Do not edit `components/ui/` directly
- **Path alias:** `@/` maps to project root

## Open Questions

1. **IME composition handling**
   - What we know: CJK input uses IME; Enter during composition should NOT send the message
   - What's unclear: Whether `e.nativeEvent.isComposing` is sufficient or if `compositionstart/compositionend` events are needed
   - Recommendation: Use `isComposing` check (simpler), test with CJK input in E2E

2. **react-markdown code block detection**
   - What we know: react-markdown passes `className` to the `code` component for fenced blocks (e.g., `language-typescript`)
   - What's unclear: Whether inline code vs. fenced code is reliably distinguishable via `className` alone in react-markdown v10
   - Recommendation: Check for `className` starting with `language-` and also wrap `code` components that are direct children of `pre` elements

## Sources

### Primary (HIGH confidence)
- `@ai-sdk/react` v3.0.146 types -- read directly from `node_modules` dist/index.d.ts
- `ai` v6.0.144 types -- read directly from `node_modules` dist/index.d.ts (`TextStreamChatTransport`, `UIMessage`, `ChatInit`, `ChatStatus`, `TextUIPart`)
- `app/api/chat/route.ts` -- Phase 34 implementation uses `toTextStreamResponse()`
- `.planning/research/STACK.md` -- verified stack decisions and code patterns
- `.planning/research/PITFALLS.md` -- streaming buffering and abort handling pitfalls

### Secondary (MEDIUM confidence)
- npm registry versions verified 2026-04-03: react-markdown 10.1.0, remark-gfm 4.0.1, @ai-sdk/react 3.0.147, ai 6.0.145 (minor patch ahead of installed)
- Existing project patterns: sidebar-layout, dashboard page structure, component test mocking

### Tertiary (LOW confidence)
- IME `isComposing` behavior across browsers -- needs E2E validation with actual CJK input

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified in node_modules, types read directly
- Architecture: HIGH -- follows established project patterns (dashboard, layouts), AI SDK types confirm API surface
- Pitfalls: HIGH -- transport mismatch verified by reading actual type definitions; other pitfalls from PITFALLS.md research

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable; AI SDK minor updates unlikely to break transport pattern)
