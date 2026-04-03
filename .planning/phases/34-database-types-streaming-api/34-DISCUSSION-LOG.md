# Phase 34: Database, Types & Streaming API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 34-database-types-streaming-api
**Areas discussed:** API Route Design, DB Schema Design, Error Handling Strategy, AI SDK Provider Config
**Mode:** Auto (--auto flag, all recommended defaults selected)

---

## API Route Design

| Option | Description | Selected |
|--------|-------------|----------|
| Single POST /api/chat with streamText | AI SDK convention, useChat expects single endpoint | ✓ |
| Separate endpoints (send + history) | More RESTful but unnecessary complexity for chat | |

**User's choice:** [auto] Single POST /api/chat with streamText (recommended default)
**Notes:** AI SDK's useChat hook is designed for a single endpoint pattern.

---

## DB Schema Design

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal schema (id, user_id, title, role, content) | Simple, extensible later | ✓ |
| Full schema (token counts, model per message, metadata JSONB) | More data from start | |

**User's choice:** [auto] Minimal schema (recommended default)
**Notes:** Can add columns later. Token counting is out of scope for v7.0.

---

## Error Handling Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| AI SDK built-in error propagation | SDK handles serialization, useChat exposes error state | ✓ |
| Custom error middleware | More control but reinvents SDK behavior | |

**User's choice:** [auto] AI SDK built-in (recommended default)
**Notes:** Added network-level try/catch for proxy-down scenarios (502).

---

## AI SDK Provider Config

| Option | Description | Selected |
|--------|-------------|----------|
| @ai-sdk/openai with createOpenAI({ baseURL }) | Simpler, supports custom base URLs natively | ✓ |
| @ai-sdk/openai-compatible | For publishing provider packages, overkill here | |

**User's choice:** [auto] @ai-sdk/openai with createOpenAI (recommended default)
**Notes:** Research confirmed this is the correct package for custom OpenAI-compatible endpoints.

---

## Claude's Discretion

- Migration file naming and numbering
- Exact Zod schema field constraints
- Unit test structure and mocking approach

## Deferred Ideas

None — all discussion stayed within phase scope.
