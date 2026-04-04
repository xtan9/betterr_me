# Phase 35: Chat UI & Message Rendering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 35-chat-ui-message-rendering
**Areas discussed:** Message layout, Markdown rendering depth, Streaming UX, Input area design, Empty/initial state
**Mode:** Auto (all decisions auto-selected)

---

## Message Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Aligned bubbles with subtle backgrounds | User right-aligned with primary tint, assistant left-aligned with muted bg | ✓ |
| Flat messages with sender labels | No alignment, just name labels above each message | |
| Full-width messages with side accent bar | Messages span full width, colored bar on left indicates sender | |

**User's choice:** Aligned bubbles with subtle backgrounds (auto-selected recommended default)
**Notes:** No avatars — keeps layout clean for personal app. Consistent with modern chat UIs.

---

## Markdown Rendering Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full GFM without syntax highlighting | react-markdown + remark-gfm for bold, lists, code blocks, tables — code blocks monospace with muted bg | ✓ |
| Basic formatting only | Bold, italic, lists only — no code blocks or tables | |
| Full GFM with syntax highlighting | Adds rehype-highlight or similar for code block coloring | |

**User's choice:** Full GFM without syntax highlighting (auto-selected recommended default)
**Notes:** Syntax highlighting deferred — adds complexity and bundle size for a feature users may not need in a personal productivity chat.

---

## Streaming UX

| Option | Description | Selected |
|--------|-------------|----------|
| Blinking cursor at end of text | CSS animation cursor appended during streaming | ✓ |
| Typing indicator dots | Three bouncing dots shown while streaming (like iMessage) | |
| No indicator (just growing text) | Text appears incrementally with no cursor or animation | |

**User's choice:** Blinking cursor at end of text (auto-selected recommended default)
**Notes:** Simple, lightweight, and familiar UX pattern. Stop button visible during streaming.

---

## Input Area Design

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-resizing textarea with send button | Grows to ~6 lines, send button on right, disabled when empty/streaming | ✓ |
| Fixed single-line input | Simple text input, no multi-line support | |
| Fixed multi-line textarea | Fixed height textarea with scrollbar | |

**User's choice:** Auto-resizing textarea with send button (auto-selected recommended default)
**Notes:** Enter to send, Shift+Enter for newline, Escape to stop — all via input event handlers.

---

## Empty/Initial State

| Option | Description | Selected |
|--------|-------------|----------|
| Centered greeting | "How can I help?" centered in chat area, disappears on first message | ✓ |
| Suggested prompts grid | Greeting with 3-4 clickable prompt suggestions | |
| Blank screen | No initial state, just empty chat area | |

**User's choice:** Centered greeting (auto-selected recommended default)
**Notes:** Minimal approach — no suggested prompts for v7.0. Can be enhanced later if needed.

---

## Claude's Discretion

- Exact pixel values for message bubbles (padding, border-radius, max-width)
- Textarea placeholder text
- Animation timing for blinking cursor
- Component file organization within `components/chat/`
- Whether to use a layout.tsx for the chat route

## Deferred Ideas

None — discussion stayed within phase scope
