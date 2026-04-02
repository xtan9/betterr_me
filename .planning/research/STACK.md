# Technology Stack: AI Chat Foundation

**Project:** BetterR.Me v7.0 — AI Chat Foundation
**Researched:** 2026-04-02
**Scope:** Stack ADDITIONS only for chat UI and streaming LLM responses. Existing stack (Next.js 16, React 19, Supabase auth+DB, SWR, shadcn/ui, Tailwind CSS 3, react-hook-form, zod v3, next-intl, etc.) is validated and unchanged.

---

## 1. Vercel AI SDK — Streaming LLM Responses

### Decision: Use `ai` + `@ai-sdk/react` + `@ai-sdk/openai`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `ai` | ^6.0.144 | `streamText`, `convertToModelMessages`, `UIMessage` types, `DefaultChatTransport` | Industry-standard streaming abstraction for Next.js. Handles SSE wire protocol, backpressure, error recovery. Eliminates 200+ lines of hand-rolled streaming code. | HIGH |
| `@ai-sdk/react` | ^3.0.146 | `useChat` hook for chat UI state management | Provides message list, streaming status (`submitted`/`streaming`/`ready`/`error`), send/stop/regenerate, error handling. Same "use an established library" philosophy as the project's use of SWR and react-hook-form. | HIGH |
| `@ai-sdk/openai` | ^3.0.50 | `createOpenAI` with custom `baseURL` for llm.betterr.me proxy | Supports custom `baseURL` natively -- set to `https://llm.betterr.me/v1` and it works. The proxy is OpenAI-compatible, so no custom provider package needed. | HIGH |

**Why AI SDK over raw `fetch` + `ReadableStream`:**

1. **Wire protocol handling:** AI SDK manages the SSE data stream protocol (chunked transfer encoding, event parsing, reconnection). Hand-rolling this means implementing `eventsource-parser`, handling partial chunks, managing abort signals, and dealing with error frames.

2. **React state management:** `useChat` provides `messages`, `status`, `sendMessage`, `stop`, `setMessages`, `error` -- a complete chat state machine. Building this with `useState` + `useEffect` + `AbortController` is 150+ lines of brittle code.

3. **Type safety:** `UIMessage` with `parts` array (text parts, tool calls, etc.) is properly typed. The `convertToModelMessages` function handles the UIMessage-to-model-message conversion.

4. **Consistency with project philosophy:** BetterR.Me uses SWR for data fetching (not raw fetch), react-hook-form for forms (not raw onChange), and shadcn/ui for components (not raw Radix). Using AI SDK for streaming follows the same pattern.

**Why `@ai-sdk/openai` over `@ai-sdk/openai-compatible`:**

`@ai-sdk/openai-compatible` is designed for building reusable provider packages to publish to npm. `@ai-sdk/openai` already supports custom `baseURL` via `createOpenAI({ baseURL: '...' })`, which is exactly what we need for llm.betterr.me. Using the compatible package adds unnecessary abstraction.

---

## 2. Markdown Rendering for LLM Responses

### Decision: Use `react-markdown` + `remark-gfm`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-markdown` | ^10.1.0 | Render LLM markdown responses (headings, lists, code blocks, links, emphasis) | LLM responses contain markdown. Displaying raw text is unacceptable UX. react-markdown is the standard React markdown renderer (5,000+ npm dependents, 13K+ GitHub stars). Peer dep: React >=18 (satisfied). | HIGH |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown (tables, strikethrough, task lists) | LLMs frequently produce tables and task lists. Without this plugin, GFM features render as raw text. Lightweight plugin (~5KB). | HIGH |

**Why react-markdown over alternatives:**

| Option | Verdict | Reason |
|--------|---------|--------|
| `react-markdown` | **CHOSEN** | React component tree integration. Custom renderers map to shadcn/Tailwind classes. Sanitizes by default (no XSS). |
| Raw HTML rendering with `marked` | Rejected | XSS risk without additional sanitization library. No React component integration. Cannot customize code blocks, links, etc. with shadcn components. |
| Tiptap (already installed) | Rejected | Tiptap is an editor, not a renderer. Using it to display read-only markdown is overkill and wrong abstraction. It's used in the journal for editing, not for displaying AI output. |

**Rendering customization with Tailwind:**

```typescript
// components/chat/markdown-renderer.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Map markdown elements to Tailwind-styled elements
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        code: ({ children, className }) =>
          className ? (
            <pre className="rounded-md bg-muted p-3 overflow-x-auto">
              <code className={className}>{children}</code>
            </pre>
          ) : (
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{children}</code>
          ),
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline hover:no-underline">{children}</a>
        ),
      }}
    />
  );
}
```

### Syntax Highlighting: DEFER to Phase 2+

| Technology | Version | Purpose | When to Add |
|------------|---------|---------|-------------|
| `rehype-highlight` | ^7.0.2 | Code block syntax highlighting | Only if users request code assistance features. Adds ~50KB gzipped. Not needed for general chat MVP. |

---

## 3. Peer Dependency Adjustments Required

### React Version Bump (Required)

| Package | Current | Required | Why |
|---------|---------|----------|-----|
| `react` | 19.1.0 | >=19.1.2 | `@ai-sdk/react@^3.0.146` peer dep: `^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1`. React 19.1.0 does NOT satisfy `~19.1.2` (which means >=19.1.2 <19.2.0). |
| `react-dom` | 19.1.0 | >=19.1.2 | Must match react version. |

**Action:** Update package.json `react` and `react-dom` from `^19.0.0` to `^19.1.2`, then `pnpm install`. This resolves to React 19.1.5 (latest stable 19.1.x). This is a patch bump with bug fixes, no breaking changes.

**Alternative (not recommended):** Add `@ai-sdk/react>react` to pnpm `peerDependencyRules.allowedVersions` (project already does this for dnd-kit). But updating React is cleaner -- 19.1.5 has actual bug fixes.

### Zod Version (Lockfile refresh only)

| Current spec | Resolved in lockfile | Required by `ai` |
|-------------|---------------------|-------------------|
| ^3.25.46 | 3.25.46 | ^3.25.76 |

**Action:** Run `pnpm update zod`. The spec `^3.25.46` already covers 3.25.76 (latest 3.25.x). Just needs a lockfile update. No code changes -- zod 3.25.x is fully backward compatible within minor.

---

## 4. Environment Variables

| Variable | Example Value | Where | Purpose |
|----------|-------------|-------|---------|
| `LLM_API_KEY` | (secret) | `.env.local` + Vercel (server-only) | Bearer token for llm.betterr.me proxy. Already noted in STATE.md. |
| `LLM_BASE_URL` | `https://llm.betterr.me/v1` | `.env.local` + Vercel (server-only) | Base URL for OpenAI-compatible proxy. Env var allows switching without redeploy. |
| `LLM_MODEL` | `claude-sonnet-4-20250514` | `.env.local` + Vercel (server-only) | Model identifier passed to the proxy. Env var allows model switching without code change. |

**IMPORTANT:** All `LLM_*` env vars are server-only (no `NEXT_PUBLIC_` prefix). The API key must never reach the client. The Next.js API route acts as a secure proxy between the browser and llm.betterr.me.

---

## 5. Integration Architecture

```
Browser (useChat)  --POST /api/chat-->  Next.js Route Handler  --POST /v1/chat/completions-->  llm.betterr.me
       ^                                      |                                                      |
       |                                 streamText() +                                              |
       |                            createOpenAI({baseURL})                                          |
       +------SSE stream (toUIMessageStreamResponse)--+<-----SSE stream (OpenAI format)--------------+
```

### Server-side Route Handler Pattern

```typescript
// app/api/chat/route.ts
import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';

const llm = createOpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://llm.betterr.me/v1',
  apiKey: process.env.LLM_API_KEY || '',
});

export async function POST(req: Request) {
  // Auth check — reuse existing Supabase server client pattern
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: llm(process.env.LLM_MODEL || 'claude-sonnet-4-20250514'),
    system: 'You are a helpful assistant for BetterR.Me.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### Client-side Hook Pattern

```typescript
'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status, stop, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});
// status: 'submitted' | 'streaming' | 'ready' | 'error'
// messages[].parts[].type === 'text' for rendering
```

---

## 6. What NOT to Add

| Do NOT Add | Why | What to Use Instead |
|------------|-----|---------------------|
| `openai` (npm package) | Raw OpenAI Node SDK. AI SDK wraps it with better streaming, React hooks, and type safety. Using both is redundant. | `@ai-sdk/openai` via AI SDK |
| `@ai-sdk/openai-compatible` | For building reusable provider packages to publish. `@ai-sdk/openai` with `createOpenAI({ baseURL })` handles custom endpoints directly. | `@ai-sdk/openai` |
| `eventsource-parser` | Manual SSE parsing. AI SDK handles this internally via `streamText`. | AI SDK `streamText` |
| `langchain` / `@langchain/core` | Massive orchestration framework for chains, agents, RAG. We need simple chat streaming. LangChain adds 500KB+ for capabilities we don't use. | AI SDK `streamText` |
| `marked` / `markdown-it` | Non-React markdown parsers. Output raw HTML strings. No component customization, require separate sanitization. | `react-markdown` (React component tree, safe by default) |
| `socket.io` / WebSocket libs | SSE (Server-Sent Events) is sufficient for LLM streaming. WebSockets add bidirectional complexity for a unidirectional stream. AI SDK uses SSE by default. | AI SDK SSE transport |
| SWR for chat | Already in the project, but NOT for chat. `useChat` manages its own streaming state. Wrapping chat in SWR would conflict -- it's a streaming interaction, not a fetch-cache pattern. | `useChat` hook |
| Database table for chat history | Out of scope for v7.0. PROJECT.md says "Conversation persists within the session." React state is sufficient. Add Supabase table in a future milestone if persistence needed. | `useChat` in-memory message state |
| `@ai-sdk/anthropic` | Direct Anthropic provider. Not needed because llm.betterr.me exposes an OpenAI-compatible API. Using `@ai-sdk/openai` with custom `baseURL` routes through the proxy correctly. | `@ai-sdk/openai` with custom baseURL |
| `highlight.js` / `prism.js` | Code syntax highlighting. Deferring to Phase 2+ since MVP is general chat, not code assistance. | Defer; add `rehype-highlight` later if needed |

---

## 7. Recommended Stack Additions -- Summary

| Technology | Version | Purpose | Bundle Impact |
|------------|---------|---------|--------------|
| `ai` | ^6.0.144 | Streaming core (`streamText`, `UIMessage`, transport) | ~15KB gzipped (server + shared types) |
| `@ai-sdk/react` | ^3.0.146 | `useChat` hook | ~8KB gzipped (client) |
| `@ai-sdk/openai` | ^3.0.50 | OpenAI-compatible provider with custom baseURL | ~5KB gzipped (server) |
| `react-markdown` | ^10.1.0 | Markdown rendering for LLM responses | ~15KB gzipped (client) |
| `remark-gfm` | ^4.0.1 | GFM tables, strikethrough, task lists | ~5KB gzipped (client) |

**Total new runtime dependencies: 5**
**Total new dev dependencies: 0**
**Estimated client bundle increase: ~28KB gzipped** (react-markdown + remark-gfm + @ai-sdk/react)
**Estimated server bundle increase: ~20KB** (ai + @ai-sdk/openai -- not in client bundle)

### Peer dependency updates (no new packages):

| Package | From | To | Impact |
|---------|------|----|--------|
| `react` | 19.1.0 | 19.1.5 | Patch bump, bug fixes |
| `react-dom` | 19.1.0 | 19.1.5 | Patch bump, bug fixes |
| `zod` | 3.25.46 | 3.25.76 | Lockfile update only |

---

## 8. Installation

```bash
# New dependencies for AI chat
pnpm add ai @ai-sdk/react @ai-sdk/openai react-markdown remark-gfm

# Peer dependency updates
pnpm update react react-dom zod
```

**Environment variables to add to `.env.local`:**
```bash
LLM_API_KEY=<your-api-key>
LLM_BASE_URL=https://llm.betterr.me/v1
LLM_MODEL=claude-sonnet-4-20250514
```

---

## 9. Version Compatibility Matrix

| New Package | React 19.1.2+ | Next.js 16 | TypeScript 5 | Notes |
|-------------|---------------|------------|--------------|-------|
| ai ^6.0.144 | Yes | Yes (App Router) | Types included | Peer dep: zod ^3.25.76 |
| @ai-sdk/react ^3.0.146 | Yes (~19.1.2) | Yes | Types included | Peer dep: react ~19.1.2 |
| @ai-sdk/openai ^3.0.50 | N/A (server) | Yes | Types included | Peer dep: zod ^3.25.76 |
| react-markdown ^10.1.0 | Yes (>=18) | Yes | @types included | No additional peer deps |
| remark-gfm ^4.0.1 | N/A (plugin) | Yes | Types included | Peer dep: react-markdown |

All packages are compatible with: Next.js 16.1.6, React 19.1.2+, TypeScript 5, pnpm 10.11.

---

## 10. Existing Stack Serving AI Chat Features

These technologies are already installed and require NO additions:

| Existing Technology | How It Serves AI Chat |
|---------------------|----------------------|
| **Supabase auth** | Auth-gating the `/api/chat` route. Same `createClient()` + `getUser()` pattern used by all API routes. |
| **shadcn/ui + Radix UI** | Chat UI components: Button (send), Input/Textarea (message input), ScrollArea (message list), Card (message bubbles), Avatar (user/assistant). |
| **Tailwind CSS 3** | Chat layout, message bubble styling, responsive design, dark mode via existing CSS variables. |
| **next-intl** | Chat UI strings (placeholder text, error messages, status indicators) in en/zh/zh-TW. |
| **next-themes** | Dark mode for chat interface via existing class-based system. |
| **lucide-react** | Send, Square (stop), RefreshCw (regenerate), User, Bot, Copy, AlertCircle icons. |
| **sonner** | Toast notifications for chat errors, copy-to-clipboard confirmation. |
| **zod** | Input validation for chat API route (message array schema). |

---

## Sources

### Package Versions (verified via npm registry, 2026-04-02)
- [ai npm v6.0.144](https://www.npmjs.com/package/ai) — Latest AI SDK core
- [@ai-sdk/react npm v3.0.146](https://www.npmjs.com/package/@ai-sdk/react) — React hooks for AI SDK
- [@ai-sdk/openai npm v3.0.50](https://www.npmjs.com/package/@ai-sdk/openai) — OpenAI provider with custom baseURL
- [react-markdown npm v10.1.0](https://www.npmjs.com/package/react-markdown) — React markdown renderer
- [remark-gfm npm v4.0.1](https://www.npmjs.com/package/remark-gfm) — GFM plugin for react-markdown
- [react npm v19.1.5](https://www.npmjs.com/package/react) — Latest stable React 19.1.x
- [zod npm v3.25.76](https://www.npmjs.com/package/zod) — Latest zod 3.x

### Official Documentation (verified 2026-04-02)
- [AI SDK Introduction](https://ai-sdk.dev/docs/introduction) — v6 architecture overview
- [AI SDK useChat](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) — Chat hook API, UIMessage, parts rendering
- [AI SDK streamText](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) — Server-side streaming, toUIMessageStreamResponse
- [AI SDK OpenAI Provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai) — createOpenAI with custom baseURL
- [AI SDK Custom Providers](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers) — @ai-sdk/openai-compatible (evaluated, not needed)

### Project Context
- `.planning/STATE.md` — LLM proxy details (llm.betterr.me, CLIProxyAPI, LLM_API_KEY)
- `.planning/PROJECT.md` — v7.0 scope: session-scoped chat, auth-gated, streaming

---
*Stack research for: BetterR.Me v7.0 AI Chat Foundation*
*Researched: 2026-04-02*
*Scope: Additions only -- existing stack unchanged*
