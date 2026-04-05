# Phase 36: Conversation Persistence & Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 36-conversation-persistence-management
**Areas discussed:** Conversation list UI, Message persistence timing, Auto-title generation, New conversation trigger
**Mode:** Auto (--auto flag — recommended defaults selected)

---

## Conversation List UI

| Option | Description | Selected |
|--------|-------------|----------|
| Left sidebar panel | Sidebar within chat page — standard chat UX (ChatGPT/Claude.ai pattern) | ✓ |
| Drawer/sheet | Slide-out drawer triggered by a button — saves horizontal space | |
| Inline dropdown | Dropdown menu at top of chat — minimal UI footprint | |

**User's choice:** [auto] Left sidebar panel (recommended default)
**Notes:** Standard pattern matches user expectations from popular chat apps. Conversation list is always visible on desktop, improving discoverability.

---

## Message Persistence Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Save before/after | User message saved before LLM call, assistant message saved after stream completes | ✓ |
| Save after both complete | Both messages saved as a pair after assistant response finishes | |
| Save during streaming | Messages saved incrementally during streaming (complex, partial state risk) | |

**User's choice:** [auto] Save user message before sending, assistant message after stream completes (recommended default)
**Notes:** Prevents data loss if user navigates away. Only complete assistant responses are persisted — no partial/broken messages in DB.

---

## Auto-Title Generation

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-generated title | Separate LLM request to generate 5-8 word summary after first exchange | ✓ |
| First message truncation | Use first ~50 chars of user's first message as title | |
| No auto-title | User manually names conversations | |

**User's choice:** [auto] LLM-generated title (recommended default)
**Notes:** Produces meaningful titles like "Workout schedule planning" vs truncated "Hey can you help me with my wor...". Fire-and-forget — doesn't block UI.

---

## New Conversation Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Button + auto-create | "New chat" button in sidebar + auto-create on first message if none selected | ✓ |
| Button only | Explicit "New chat" button required before chatting | |
| Auto-create only | Always auto-create, no explicit button | |

**User's choice:** [auto] New chat button + auto-create (recommended default)
**Notes:** Explicit button for intentional new conversations. Auto-creation handles the initial empty state gracefully — user doesn't need to click "new" before their very first message.

---

## Claude's Discretion

- URL strategy for conversation routing
- Where message persistence logic lives (chat API route vs separate client-side calls)
- Title generation endpoint design
- Conversation delete confirmation UX
- SWR vs direct fetch for conversation list
- Component file organization

## Deferred Ideas

None — discussion stayed within phase scope
