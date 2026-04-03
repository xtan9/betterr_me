# Research Summary: AI Chat Foundation

**Domain:** AI chat interface with streaming LLM responses
**Researched:** 2026-04-02
**Overall confidence:** HIGH

## Executive Summary

Adding an AI chat interface to BetterR.Me is a well-scoped, low-to-medium complexity addition. The existing codebase provides all foundational infrastructure (auth, Supabase DB, design tokens, i18n, sidebar navigation, responsive layout), and the Vercel AI SDK v6 provides a battle-tested abstraction for streaming chat with an OpenAI-compatible proxy. Only 5 new npm packages are needed, with an estimated client bundle increase of ~28KB gzipped.

The recommended approach uses the Vercel AI SDK (`ai` + `@ai-sdk/react` + `@ai-sdk/openai`) for the streaming pipeline. The `@ai-sdk/openai` package supports custom `baseURL` natively via `createOpenAI({ baseURL: 'https://llm.betterr.me/v1' })`, making it the simplest integration path. On the client, the `useChat` hook from `@ai-sdk/react` manages message state, streaming status, send/stop/regenerate -- eliminating 200+ lines of custom streaming code. For rendering LLM markdown responses, `react-markdown` + `remark-gfm` is the standard choice.

The main risks are: (1) streaming response buffering in Vercel production (compression/caching layers silently killing SSE), (2) Vercel function timeout for long Claude responses (60s on Hobby plan), and (3) the LLM proxy's compatibility with the AI SDK's streaming protocol (must verify with actual proxy before building UI). All three are addressable with known mitigation strategies documented in PITFALLS.md.

A peer dependency update is required: React must be bumped from 19.1.0 to 19.1.2+ (latest 19.1.5) to satisfy `@ai-sdk/react`'s peer dep, and zod's lockfile entry needs refreshing to 3.25.76 for the `ai` package. Both are patch-level changes with no breaking impact.

## Key Findings

**Stack:** 5 new packages (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `react-markdown`, `remark-gfm`) + React/zod version bumps. See [STACK.md](STACK.md).

**Architecture:** Server-side API route proxies to llm.betterr.me via AI SDK `streamText()`. Client uses `useChat()` hook. Auth-gated with existing Supabase pattern. Chat is entirely additive -- no existing files need significant modification. See [ARCHITECTURE.md](ARCHITECTURE.md).

**Critical pitfall:** Streaming responses buffered by Vercel compression/caching layers -- must test on Vercel preview deploys, not just local dev. Set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` headers. See [PITFALLS.md](PITFALLS.md).

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Database + Types + AI Provider** - Foundation layer
   - Addresses: Supabase tables (conversations, chat_messages), DB classes, Zod schemas, AI SDK provider config
   - Avoids: Pitfall #1 (API key leak) by establishing server-only proxy pattern from the start
   - Avoids: Pitfall #5 (auth inside stream) by establishing auth-then-stream pattern

2. **Streaming API Route** - Backend that can be tested with curl
   - Addresses: POST /api/chat with auth, streamText, response headers
   - Avoids: Pitfall #2 (buffering) by setting correct SSE headers immediately
   - Avoids: Pitfall #3 (timeout) by setting maxDuration and max_tokens
   - Avoids: Pitfall #4 (abort handling) by passing request.signal to upstream

3. **Chat UI Components** - The visible interface
   - Addresses: Message bubbles, input, markdown rendering, loading/error states
   - Avoids: Pitfall #6 (SSE parsing) by using AI SDK's built-in protocol handling
   - Avoids: Pitfall #7 (unbounded context) by implementing message windowing

4. **Conversation Persistence** - Durability and multi-conversation
   - Addresses: Save/load messages to DB, conversation list, auto-titles
   - Depends on: Phase 1 (DB tables) and Phase 3 (working UI)

5. **Navigation + i18n + Polish** - Integration with existing app
   - Addresses: Sidebar nav item, all 3 locale translations, empty states, keyboard shortcuts
   - Depends on: Phase 3-4 (feature-complete chat)

**Phase ordering rationale:**
- DB schema first (Phase 1) because API routes need tables to persist messages
- API before UI (Phase 2 before 3) because `useChat` needs a working endpoint
- Core chat before persistence (Phase 3 before 4) because single-session chat validates the proxy integration
- Polish last (Phase 5) because navigation and i18n only matter when the feature works

**Research flags for phases:**
- Phase 2: MUST test streaming on Vercel preview deploy (not just localhost). Compression buffering only manifests in production.
- Phase 1-2: MUST verify llm.betterr.me proxy compatibility with AI SDK streaming protocol early. If incompatible, fallback to manual SSE handling.
- Phase 3: Standard UI work, no research needed
- Phase 4: Standard Supabase CRUD, no research needed
- Phase 5: Standard i18n/polish, no research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified via npm registry (versions, peer deps). AI SDK v6 docs confirm `createOpenAI({ baseURL })` pattern. |
| Features | HIGH | Feature scope clearly defined in PROJECT.md. Table stakes / differentiators well-understood from ChatGPT/Claude.ai patterns. |
| Architecture | HIGH | Follows existing BetterR.Me patterns (DB classes, API routes, Supabase auth, SWR). Only new pattern is streaming response, which AI SDK handles. |
| Pitfalls | HIGH | Streaming/buffering pitfalls well-documented in Next.js community. Vercel function timeout is a known constraint. Proxy compatibility is the one uncertainty. |

## Gaps to Address

- **LLM proxy compatibility:** Must verify llm.betterr.me response format matches AI SDK expectations. Test with curl in Phase 1 before building UI.
- **Proxy rate limits:** Unknown whether the CLIProxyAPI enforces per-minute rate limits. Test in Phase 2 with rapid message sends.
- **Vercel plan constraints:** Hobby plan has 60s function timeout. If Claude responses regularly exceed this, Vercel Pro (300s) or self-hosting the chat route may be needed. Monitor in Phase 2.
- **Code syntax highlighting:** Deferred to after MVP. Add `rehype-highlight` if users request code assistance features.
- **Token counting:** No token counting in v7.0 MVP. Add approximate counting in a future phase if conversation length becomes an issue.

## Sources

### Primary (HIGH confidence)
- [AI SDK Official Docs](https://ai-sdk.dev/docs/introduction) -- v6 architecture, useChat, streamText, provider config
- [AI SDK OpenAI Provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai) -- createOpenAI with custom baseURL
- npm registry -- ai@6.0.144, @ai-sdk/react@3.0.146, @ai-sdk/openai@3.0.50, react-markdown@10.1.0
- Existing BetterR.Me codebase -- DB class patterns, API routes, Supabase auth, SWR hooks

### Secondary (MEDIUM confidence)
- [Next.js SSE Discussion #48427](https://github.com/vercel/next.js/discussions/48427) -- streaming buffering issues
- [Vercel Function Limits](https://vercel.com/docs/functions/limitations) -- timeout constraints
- Competitive analysis (ChatGPT, Claude.ai, Notion AI) -- feature expectations

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
