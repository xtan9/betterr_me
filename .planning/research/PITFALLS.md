# Pitfalls Research

**Domain:** AI Chat Foundation in existing Next.js 16 + Supabase app (BetterR.Me v7.0)
**Researched:** 2026-04-02
**Confidence:** HIGH

**Scope note:** This document focuses on **integration-specific pitfalls** -- mistakes that arise from adding AI chat with streaming to the *existing* BetterR.Me codebase. General chatbot pitfalls are only covered where they intersect with BetterR.Me-specific concerns (Next.js 16 App Router, Vercel deployment, Supabase auth, existing SWR patterns, the llm.betterr.me proxy).

## Critical Pitfalls

### Pitfall 1: LLM Proxy API Key Leaking to the Client

**What goes wrong:**
The API key for llm.betterr.me ends up in client-side JavaScript bundles or is visible in browser network requests. Even though this is a personal app, a leaked key means anyone who finds it can run up usage on the Claude subscription backing the proxy. API keys leaked in client code get scraped by automated bots scanning GitHub and browser source maps.

**Why it happens:**
Next.js environment variables prefixed with `NEXT_PUBLIC_` are bundled into client code. Developers accidentally use `NEXT_PUBLIC_LLM_API_KEY` or hard-code the key in a client component. Another vector: the browser makes requests directly to llm.betterr.me instead of routing through the Next.js API route, exposing the key in request headers visible in DevTools.

**How to avoid:**
- Store the LLM proxy key in a server-only env var (no `NEXT_PUBLIC_` prefix), e.g., `LLM_PROXY_API_KEY`
- All LLM calls go through a Next.js API route (`/api/chat`) that adds the key server-side
- The browser only ever talks to `/api/chat`, never directly to llm.betterr.me
- Add the key to `.env.local` and verify it is in `.gitignore`
- Never import the env var in any file that could be a client component

**Warning signs:**
- Any `fetch("https://llm.betterr.me")` call in a file under `app/` or `components/` (client territory)
- Env var name starts with `NEXT_PUBLIC_LLM` or `NEXT_PUBLIC_AI`
- Browser DevTools Network tab shows requests to llm.betterr.me instead of `/api/chat`

**Phase to address:**
Phase 1 (API route setup) -- establish the server-side proxy pattern from the very start.

---

### Pitfall 2: Streaming Response Buffered by Compression or Caching

**What goes wrong:**
The AI response streams token-by-token from the LLM proxy, but the user sees nothing for 5-30 seconds, then the entire response appears at once. The streaming is technically happening server-side but something between the API route and the browser is buffering the output.

**Why it happens:**
Three independent buffering layers can each silently kill streaming:
1. **Next.js gzip compression** -- middleware applies `Content-Encoding: gzip` which buffers data to compress efficiently before sending
2. **Vercel response caching** -- without `export const dynamic = "force-dynamic"`, Vercel may cache or buffer the route response
3. **Reverse proxy buffering** -- Nginx or CDN layers (including Vercel's edge network) buffer SSE unless explicitly told not to

This is the most commonly reported streaming issue in Next.js (see [Discussion #48427](https://github.com/vercel/next.js/discussions/48427)).

**How to avoid:**
- Set these headers on every streaming response:
  ```
  Content-Type: text/event-stream
  Cache-Control: no-cache, no-transform
  X-Accel-Buffering: no
  Connection: keep-alive
  ```
- Add `export const dynamic = "force-dynamic"` to the route handler file
- Use `Content-Encoding: none` to explicitly disable compression on the streaming route
- **Test streaming on Vercel preview deploys, not just `pnpm dev`** -- local dev does not reproduce proxy buffering. This is the #1 "works locally but not in production" issue.

**Warning signs:**
- Works locally but "batches" in production
- First token latency > 3 seconds in production when the LLM itself responds faster
- Response arrives all at once after the full generation completes
- Headers in response include `Content-Encoding: gzip` (should be `none` or absent)

**Phase to address:**
Phase 1 (API route setup) -- these headers must be present from the first streaming implementation. Must be verified on a Vercel preview deploy, not just local.

---

### Pitfall 3: Vercel Function Timeout Kills Long Responses

**What goes wrong:**
Claude generates a detailed, multi-paragraph response that takes 45-90 seconds. The Vercel serverless function times out and the stream is cut off mid-sentence. The user sees a truncated response with no error message -- the text just stops.

**Why it happens:**
Vercel Hobby plan: 60s max for serverless functions. Even with streaming (the function stays alive while piping tokens to the client), the function must remain running for the entire generation. Long or complex Claude responses, especially with reasoning/thinking, can exceed 60 seconds. The timeout kills the function silently -- no error event is sent to the client, the stream just closes.

**How to avoid:**
- Set `export const maxDuration = 60` explicitly in the route handler (documents the constraint even if it matches the default)
- Set `max_tokens` on the LLM API request to cap response length (e.g., 2048-4096 tokens keeps most responses under 30s)
- Implement client-side timeout detection: if the stream stops for > 10 seconds without a `[DONE]` event, show a "Response may have been cut off" indicator
- If responses are regularly getting cut off, consider upgrading to Vercel Pro (300s with Fluid Compute) or self-hosting on Hetzner alongside the LLM proxy
- Avoid system prompts that encourage extremely long responses

**Warning signs:**
- Responses end mid-sentence with no error
- Longer prompts (which tend to generate longer responses) fail more often than short ones
- Works in development (no timeout) but fails in production
- Vercel function logs show `FUNCTION_INVOCATION_TIMEOUT`

**Phase to address:**
Phase 1 (API route) for the `maxDuration` and `max_tokens` guard. Phase 2 (chat UI) for client-side truncation detection UI.

---

### Pitfall 4: No Abort/Cancel Handling Causes Resource Leaks and Wasted Tokens

**What goes wrong:**
User navigates away from the chat page or clicks "Stop generating" but the server-side function keeps streaming from the LLM proxy, consuming tokens and occupying the Vercel function slot until the full response completes. On rapid navigation, multiple orphaned streams pile up.

**Why it happens:**
The API route creates a `ReadableStream` piping data from the LLM proxy to the client but never listens for the client's `AbortSignal`. When the browser aborts the fetch (page navigation, component unmount, explicit cancel), the upstream fetch to llm.betterr.me continues because nothing propagated the cancellation signal.

**How to avoid:**
- Pass `request.signal` (the `AbortSignal` from the incoming Next.js request) to the upstream `fetch()` call to llm.betterr.me:
  ```typescript
  const upstream = await fetch(llmUrl, { ...options, signal: request.signal });
  ```
- In the `ReadableStream` controller's `cancel()` callback, abort the upstream reader
- On the client side, use `AbortController` and call `.abort()` on component unmount and on stop button click
- Handle the `AbortError` gracefully on both server and client -- do not log it as an error

**Warning signs:**
- Vercel function duration logs show functions running 30-60s even for short interactions where the user navigated away
- Token usage is higher than expected (orphaned streams complete server-side)
- `ResponseAborted` unhandled rejection errors in Vercel logs (see [Discussion #61972](https://github.com/vercel/next.js/discussions/61972))
- `TypeError: ReadableStream is already closed` errors

**Phase to address:**
Phase 1 (API route) -- abort propagation must be built in from the start, not retrofitted.

---

### Pitfall 5: Supabase Auth Check Inside the Streaming Callback

**What goes wrong:**
Developer places the `supabase.auth.getUser()` call inside the `ReadableStream` controller's `start()` callback instead of before creating the stream. The `cookies()` function from `next/headers` is not available inside a `ReadableStream` controller callback, causing the auth check to fail with a cryptic error or silently return null.

**Why it happens:**
The natural thought is "validate auth, then start streaming, all in one flow." But Next.js route handlers have a specific execution context -- `cookies()` and `headers()` must be called synchronously in the top-level handler function, not inside async callbacks or stream controllers. The existing BetterR.Me pattern (create client, getUser, check null, proceed) works fine for request/response routes but the streaming pattern is subtly different.

**How to avoid:**
- **Auth check FIRST, stream SECOND.** The correct pattern:
  ```typescript
  export async function POST(request: NextRequest) {
    // 1. Auth check (cookies() available here)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Validate request body
    const body = await request.json();

    // 3. NOW create and return the stream
    const stream = new ReadableStream({ ... });
    return new Response(stream, { headers: { ... } });
  }
  ```
- Follow the exact same auth pattern as existing routes (`/api/habits`, `/api/tasks`) -- the only difference is the response type (stream instead of JSON)

**Warning signs:**
- `cookies()` or `createClient()` called inside `new ReadableStream({ start: async (controller) => { ... } })`
- Auth errors that only happen on the streaming route but not on regular API routes
- 500 errors on the chat endpoint with no clear cause

**Phase to address:**
Phase 1 (API route) -- the route handler structure must follow auth-then-stream ordering.

---

### Pitfall 6: SSE Parsing Errors from OpenAI-Compatible Stream Format

**What goes wrong:**
The chat UI shows raw JSON chunks, displays `[DONE]` as visible text in the chat, or crashes when it receives an unexpected event format. Partial JSON objects cause parse errors that break the entire stream reader.

**Why it happens:**
OpenAI-compatible streaming uses SSE with `data: {json}\n\n` format. Common parsing mistakes:
1. Splitting on `\n\n` without handling partial chunks (a single network packet may contain half a JSON object)
2. Not handling the `data: [DONE]` sentinel (it is NOT valid JSON -- parsing it throws `SyntaxError`)
3. Not stripping the `data: ` prefix correctly (some chunks may have `data:` without a space)
4. Assuming each chunk from `reader.read()` contains exactly one complete SSE event (it may contain multiple or partial events)

**How to avoid:**
- Use the `eventsource-parser` npm package instead of manual string splitting -- it handles all edge cases
- Handle `[DONE]` explicitly before attempting `JSON.parse()`
- Buffer incoming data and split on `\n\n` boundaries, not on individual `read()` calls
- Extract the content delta from `choices[0].delta.content` -- it may be `null` or `undefined` on some chunks (role-only chunks, finish_reason chunks)
- Test with the actual llm.betterr.me proxy early -- do not develop against a mock and swap later, as the proxy may have subtle format differences

**Warning signs:**
- `SyntaxError: Unexpected token` in browser console during streaming
- `[DONE]` appearing as text in the chat
- Chinese/CJK characters garbled or split across chunks
- Occasional "missing" words in streamed output (lost partial chunks)
- `choices[0].delta.content` is undefined errors

**Phase to address:**
Phase 2 (chat UI) -- the client-side stream consumer must handle the SSE format correctly from the first implementation.

---

### Pitfall 7: Unbounded Conversation Context Blows Token Limits or Gets Expensive

**What goes wrong:**
After 10-15 messages, the conversation context sent with every request exceeds practical limits. Either the LLM proxy returns a 400 error (context too long), response quality degrades (model struggles with very long context), or costs become disproportionate (sending 20K+ tokens of history with every short question).

**Why it happens:**
Naive implementations send the entire conversation history with every request. Each user+assistant message pair is 200-2000 tokens. After 15 exchanges, the context payload is 10K+ tokens per request. With Claude's large context window the technical limit is high, but costs scale linearly with input tokens and response latency increases with context size.

**How to avoid:**
- Implement a message window: send only the last N messages (e.g., last 20 messages) with each request
- For v7.0 (personal app, session-only persistence): keep full conversation in React state for display, but only send the windowed subset to the LLM API
- Count tokens approximately before sending (1 token ~ 4 chars for English, ~1.5 chars for Chinese/CJK) and warn/truncate before hitting proxy limits
- Include the system prompt in the token budget calculation
- For future: store full history in Supabase but always send a windowed subset to the LLM

**Warning signs:**
- Response latency increases linearly with conversation length
- LLM API returns 400/413 errors after long conversations
- Token usage in proxy logs grows quadratically over a conversation's lifetime

**Phase to address:**
Phase 2 (chat UI/state management) -- implement the message window when building the conversation state hook.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store messages in React state only (no DB) | No schema, fast to implement | Conversations lost on refresh, no history | v7.0 MVP only -- plan DB schema for next milestone |
| Skip token counting | No complexity | Silent failures on long conversations, no cost awareness | v7.0 MVP -- add approximate counting in Phase 2 |
| Hardcode system prompt in API route | Simple, one location | Cannot customize per context (habits vs money vs general chat) | v7.0 only -- future milestones need context-aware prompts |
| No rate limiting on `/api/chat` | One user, minimal abuse risk | If auth is compromised, unlimited LLM calls | Acceptable for personal app; add if ever multi-user |
| Inline streaming logic in route handler | Quick to implement | Hard to test, hard to swap providers or add features | Never -- extract to a service module (`lib/llm/stream.ts`) from day one |
| No message persistence | No DB migration needed | Cannot resume conversations, no search, no analytics | v7.0 MVP -- acceptable since scope says session-only |

## Integration Gotchas

Common mistakes when connecting to the LLM proxy and existing BetterR.Me systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| llm.betterr.me proxy | Assuming response format is identical to OpenAI API -- the CLIProxyAPI may have differences in error responses, rate limit headers, or streaming chunk boundaries | Test with the actual proxy in Phase 1 before building the UI. Verify error response format, streaming chunk format, and `[DONE]` handling against real responses. |
| Supabase auth in streaming route | Using `supabase.auth.getSession()` instead of `supabase.auth.getUser()` -- `getSession()` reads cookies without server validation | Always use `getUser()` which validates the JWT with Supabase. The existing codebase already does this correctly in every route (e.g., `/api/habits`). Copy the pattern exactly. |
| Supabase auth + ReadableStream | Creating the Supabase client inside the stream controller -- `cookies()` unavailable in that context | Create Supabase client and validate auth BEFORE constructing the ReadableStream. Auth check first, stream second. See Critical Pitfall #5. |
| Next.js runtime selection | Using `export const runtime = 'edge'` for the chat route because "streaming is faster on edge" | Use Node.js runtime (the default). The Supabase SSR client uses `cookies()` from `next/headers` which works in Node.js runtime. Edge has API limitations that break Supabase SSR. The existing codebase uses Node.js runtime for all routes. |
| SWR for chat data | Trying to use SWR for the streaming endpoint because "we use SWR for everything" | SWR is for request/response patterns, not streaming. Use raw `fetch()` with `response.body.getReader()` for the streaming endpoint. SWR can be used later for loading persisted conversation history, but not for the live stream. |
| Existing middleware/proxy.ts | Forgetting to handle `/api/chat` in the auth middleware or adding it to a redirect list | Verify that `/api/chat` POST is not intercepted by the existing proxy middleware. It should pass through to the route handler like all other `/api/` routes. |

## Performance Traps

Patterns that work at small scale but degrade as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering entire message list on each streamed token | UI freezes during streaming, dropped frames, high CPU | Memoize individual `<Message>` components with `React.memo`. Only the currently-streaming message should re-render. The message list itself should not re-render. | Noticeable at > 10 messages in conversation |
| String concatenation for accumulating streamed tokens | Quadratic memory growth, GC pressure spikes | Accumulate chunks in an array, `.join('')` only for display. Or use a ref and flush to state on a debounced interval (every 50-100ms). | Noticeable at > 2000 tokens in a single response |
| Not cleaning up fetch/reader on unmount | Memory leaks, orphaned network connections, zombie streams | `AbortController` in `useEffect` cleanup. Abort on unmount AND on new message send (cancel previous stream before starting new one). | After 3-5 navigations away from and back to the chat page |
| Sending rendered markdown/HTML back as LLM context | Inflated token count, wasted proxy costs | Store raw text content in the messages array sent to the LLM. Render markdown only for display. The LLM should never see HTML tags or markdown syntax from previous responses. | Noticeable when assistant responses contain code blocks or formatted lists |

## Security Mistakes

Domain-specific security issues for AI chat in a personal productivity app.

| Mistake | Risk | Prevention |
|---------|------|------------|
| API key in `NEXT_PUBLIC_` env var or client code | Anyone viewing source can use your Claude subscription | Server-only env var (`LLM_PROXY_API_KEY`), all calls through `/api/chat` route |
| No auth check on `/api/chat` | Unauthenticated requests trigger LLM calls | `supabase.auth.getUser()` at the top of the route handler, return 401 if no user. Follow existing `/api/habits` pattern exactly. |
| User input interpolated into system prompt | Prompt injection -- user crafts input that overrides system instructions | System prompt is a constant string defined server-side. User input goes ONLY in `messages[].content` with role `user`. Never use template literals to embed user content in the system prompt. |
| No input length validation | Enormous input causes expensive/slow LLM calls | Validate with Zod at the API boundary: max 10,000 characters per message, max 50 messages per request. Follow existing Zod validation pattern from `lib/validations/`. |
| Logging full conversation content to Vercel | PII in server logs, subject to Vercel log retention | Log metadata only: message count, approximate token count, response time, error codes. Never log message content in production. Use existing `log` module. |

## UX Pitfalls

Common user experience mistakes in AI chat interfaces.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading indicator before first token arrives | User thinks nothing happened, clicks send again (duplicate requests) | Show a pulsing "thinking" indicator immediately on send. Disable the send button and input during generation. |
| No way to stop generation | Stuck watching a wrong/irrelevant response stream for 30+ seconds | Add a "Stop generating" button that aborts the fetch via AbortController and keeps the partial response visible. |
| Raw API errors shown to user | "500 Internal Server Error" or `{"error":"rate_limited"}` confuses users | Catch all errors, show friendly messages: "Could not reach the AI. Please try again." with a retry button. Map common error codes to human messages. |
| Empty state is a blank white/dark box | New users don't know what the chat can do or how to start | Show 2-3 clickable example prompts and a brief welcome message explaining capabilities. Match the existing BetterR.Me design language. |
| Markdown responses rendered as raw text | Code blocks, lists, bold text, and formatting appear as plain text with `**` and `` ``` `` | Use `react-markdown` (or similar) to render assistant messages. Sanitize HTML output. Style code blocks for dark mode. |
| Enter key handling wrong on mobile | Mobile users cannot send messages, or Enter always sends instead of creating newlines | Desktop: Enter sends, Shift+Enter for newline. Mobile: Enter creates newline, explicit send button is primary. Detect with touch/pointer queries. |
| No conversation limits communicated | User writes 50 messages, then gets a cryptic error from token limit | Show subtle message count or "long conversation" indicator. Offer "Start new conversation" when approaching the window limit. |
| Chat input hidden by mobile keyboard | On mobile, the virtual keyboard covers the input field | Use `visualViewport` API or CSS `dvh` units to keep input visible above keyboard. Test on actual mobile devices. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Streaming works:** Often missing abort handling -- verify navigating away stops the upstream LLM call (check Vercel function duration logs, should terminate shortly after client disconnects)
- [ ] **Auth is checked:** Often missing the `getSession()` vs `getUser()` distinction -- verify auth uses `getUser()` which validates the JWT server-side, not just reads cookies
- [ ] **Error handling:** Often missing timeout and network errors -- verify behavior when llm.betterr.me is unreachable (test with wrong URL in env var)
- [ ] **Mobile layout:** Often missing keyboard handling -- verify the input field stays visible above the mobile virtual keyboard and chat scrolls correctly
- [ ] **i18n:** Often missing translations for chat UI -- verify all three locales (en, zh, zh-TW) have chat-related strings for buttons, placeholders, error messages, and empty state
- [ ] **Dark mode:** Often missing contrast on chat bubbles -- verify both user and assistant message bubbles are readable in dark mode (4.5:1 contrast ratio minimum)
- [ ] **Empty state:** Often missing entirely -- verify what new users see before sending their first message
- [ ] **Long messages:** Often missing overflow handling -- verify a very long single response (2000+ words) does not break the chat layout or cause horizontal scroll
- [ ] **Concurrent sends:** Often missing -- verify rapid-fire sends do not create duplicate or interleaved streams (previous stream should be aborted when a new message is sent)
- [ ] **Production streaming:** Often missing -- verify on a Vercel preview deploy that tokens arrive incrementally, not all at once (catches compression buffering)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| API key leaked in client code | LOW | Rotate the key on llm.betterr.me immediately. Move to server-only env var. No user data at risk (personal app). Verify no commits with the key in git history. |
| Streaming buffered in production | LOW | Add missing headers (`no-cache`, `no-transform`, `X-Accel-Buffering: no`, `Content-Encoding: none`). Redeploy. No data loss. |
| Function timeout truncating responses | LOW | Add `max_tokens` limit to LLM request. Set `maxDuration` in route handler. Reduce system prompt length. |
| Conversation context too large | LOW | Implement message windowing (last N messages). No migration since v7.0 stores in React state. |
| SSE parsing errors | MEDIUM | Adopt `eventsource-parser` library. Requires refactoring the client-side stream consumer but localized to one hook/utility. |
| Auth inside stream controller | LOW | Move auth check above the stream constructor. Single file change, no behavior difference. |
| Scroll jank during streaming | MEDIUM | Refactor to debounced state updates, memoized message components, and conditional auto-scroll. Requires reworking the message list component. |
| No abort handling (resource leaks) | MEDIUM | Add `signal` propagation to upstream fetch and `AbortController` on client. Touches both API route and chat hook but isolated changes. |
| Prompt injection via system prompt | LOW | Move user content out of system prompt into messages array. Single file change in the API route. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| API key leak (#1) | Phase 1 (API route) | `grep -r "NEXT_PUBLIC_LLM\|NEXT_PUBLIC_AI" app/ components/ lib/` returns zero results. Browser DevTools shows no requests to llm.betterr.me. |
| Streaming buffered (#2) | Phase 1 (API route) | Deploy to Vercel preview. First token appears within 2s of send. Tokens arrive incrementally. Response headers do NOT contain `Content-Encoding: gzip`. |
| Function timeout (#3) | Phase 1 (API route) | `maxDuration` exported from route file. `max_tokens` set in LLM request body. Test with a prompt requesting a long story -- should complete or show truncation warning. |
| No abort handling (#4) | Phase 1 (API route) | Navigate away during streaming. Vercel function logs show function terminated shortly after, not running to completion of the LLM response. |
| Auth inside stream (#5) | Phase 1 (API route) | `createClient()` and `getUser()` are called BEFORE `new ReadableStream()` in the route handler code. Automated test: POST without auth returns 401. |
| SSE parsing (#6) | Phase 2 (chat UI) | Stream a response containing CJK characters, code blocks, and markdown. No parse errors in console. All content displays correctly. `[DONE]` never appears as text. |
| Unbounded context (#7) | Phase 2 (chat UI) | Send 25+ messages in a row. No API errors. Response quality stays consistent. Messages array sent to API is capped at window size. |
| i18n missing | Phase 2 (chat UI) | Switch locale to zh-TW. All chat UI strings (placeholder, buttons, errors, empty state) display in Chinese. No English fallbacks visible. |
| Dark mode contrast | Phase 2 (chat UI) | Toggle dark mode. Message bubbles pass WCAG AA contrast check (4.5:1). |
| Mobile keyboard | Phase 2 (chat UI) | Open in responsive mode (375px width). Input visible above keyboard simulation. Send button works. |
| Production streaming | Phase 1+2 verification | Deploy to Vercel preview before merging. Tokens stream incrementally on the deployed version, not just localhost. |

## Sources

- [Next.js SSE Discussion #48427](https://github.com/vercel/next.js/discussions/48427) -- streaming buffering issues, compression gotchas, and header solutions
- [Vercel AI SDK: Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams) -- abort handling and `consumeStream` patterns
- [Vercel Function Limits](https://vercel.com/docs/functions/limitations) -- timeout limits, maxDuration, Hobby vs Pro plan differences
- [Next.js ResponseAborted Discussion #61972](https://github.com/vercel/next.js/discussions/61972) -- unhandled rejection when client disconnects during streaming
- [Next.js ReadableStream Closed Discussion #55027](https://github.com/vercel/next.js/discussions/55027) -- TypeError when writing to a closed/aborted stream
- [Vercel Edge Runtime Duration Limits](https://vercel.com/changelog/new-execution-duration-limit-for-edge-functions) -- 300s edge limit, 25s first-byte requirement, why Node.js runtime is safer
- [Smashing Magazine: Protect API Key in Next.js](https://www.smashingmagazine.com/2021/12/protect-api-key-production-nextjs-api-route/) -- server-side proxy pattern
- [Upstash: SSE Streaming LLM in Next.js](https://upstash.com/blog/sse-streaming-llm-responses) -- SSE implementation patterns and header requirements
- [Netguru: Chatbot UX Tips 2025](https://www.netguru.com/blog/chatbot-ux-tips) -- UX best practices for chat interfaces
- [MindTheProduct: UX for AI Chatbots](https://www.mindtheproduct.com/deep-dive-ux-best-practices-for-ai-chatbots/) -- error handling, user control, capability communication
- [Lobe Chat maxDuration Discussion](https://github.com/lobehub/lobe-chat/discussions/9155) -- real-world Vercel timeout issues with AI chat

---
*Pitfalls research for: AI Chat Foundation (v7.0) in BetterR.Me*
*Researched: 2026-04-02*
