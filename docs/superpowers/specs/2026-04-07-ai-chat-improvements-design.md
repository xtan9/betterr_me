# AI Chat Improvements — Design Spec

**Date:** 2026-04-07
**Task:** [BetterR.Me Kanban — "AI chat Improvements"](in_progress)

## Overview

Five improvements to the existing AI chat feature (v7.0 AI Chat Foundation):

1. Model selection per conversation
2. Thinking indicator (bouncing dots)
3. Page refresh & tab switch resilience
4. Conversation context menu (rename + delete)
5. Sidebar title tooltip on hover

## 1. Model Selection

**Goal:** Let users choose which Claude model powers each conversation.

**Static model list** defined in `lib/ai/models.ts`:

| Model ID | Display Name | Default |
|----------|-------------|---------|
| `claude-haiku-4-5` | Haiku 4.5 | Yes |
| `claude-sonnet-4-6` | Sonnet 4.6 | No |
| `claude-opus-4-6` | Opus 4.6 | No |

**UI:** Model selector dropdown rendered below the chat input area, left-aligned. Small and unobtrusive — shows the current model name with a chevron to expand.

**Data flow:**
- Selected model stored in `Conversation.model` DB field (already exists, currently unused)
- New conversations default to `claude-haiku-4-5`
- Switching model mid-conversation is allowed — updates the conversation's `model` field
- The selected model is sent to `/api/chat` in the request body
- API route uses the request body model instead of falling back to `LLM_MODEL` env var
- Env var `LLM_MODEL` remains as server-wide fallback when no model is specified

**Files affected:**
- New: `lib/ai/models.ts` (static model list + types)
- Modify: `components/chat/chat-input.tsx` (add model selector)
- Modify: `components/chat/chat-content.tsx` (pass model to API, update conversation model)
- Modify: `app/api/chat/route.ts` (accept model from request body)
- Modify: `lib/validations/chat.ts` (add model to request schema)

## 2. Thinking Indicator

**Goal:** Show immediate visual feedback after the user sends a message, before the first token arrives.

**Design:** Bouncing dots in an assistant-styled message bubble (three gray dots animating up and down). Classic iMessage/Slack typing indicator pattern.

**Trigger:** `useChat` status is `"submitted"` (request sent, waiting for first token).
**Hide:** Status changes to `"streaming"` (first token arrived).

**Implementation:**
- New component: `components/chat/thinking-indicator.tsx`
- Rendered conditionally at the bottom of `MessageList`
- Auto-scroll brings it into view
- CSS animation only (no JS timers)

## 3. Page Refresh & Tab Switch Resilience

**Goal:** Refresh mid-stream drops the incomplete exchange cleanly. Tab switching doesn't interrupt streaming.

### Page Refresh

**Change:** Defer ALL message persistence until the stream completes successfully.

Current flow:
1. Save user message to DB
2. Stream assistant response
3. Save assistant message to DB

New flow:
1. Stream assistant response (user message shown optimistically in UI only)
2. On stream complete: save user message + assistant message to DB together
3. On stream interrupted (refresh/nav): nothing persisted, exchange disappears

**Conversation creation** is also deferred for NEW conversations:
- Currently: conversation created before streaming starts
- New: conversation created only after first stream completes
- This prevents orphaned empty conversations

### Tab Switch

- The fetch stream stays alive in the background — no action needed
- On `visibilitychange` back to visible: re-check scroll position and re-engage auto-scroll if user was at the bottom
- Streaming cursor animation resumes naturally (CSS animation, not affected by tab state)

## 4. Conversation Context Menu

**Goal:** Replace hover-to-delete with a unified context menu offering Rename and Delete.

**Trigger:** Vertical three-dot icon (⋮) appears on conversation item hover.
**Click ⋮:** Dropdown menu with two options:
- **Rename** — Replaces title text with an inline input field. Enter to confirm, Escape to cancel. Calls existing `updateConversation` endpoint (`PATCH /api/conversations/[id]`) to save.
- **Delete** — Same confirmation and behavior as current delete.

**Changes:**
- Remove: Standalone trash icon on hover
- Add: ⋮ icon on hover → dropdown with Rename / Delete
- Rename needs a new API route or reuses existing update endpoint

**Files affected:**
- Modify: `components/chat/conversation-item.tsx` (replace trash with ⋮ menu)
- New or modify: Dropdown menu component (can use Radix `DropdownMenu` from shadcn/ui)
- Modify: `components/chat/conversation-sidebar.tsx` (add rename handler, pass to item)
- Modify: `components/chat/chat-content.tsx` (add rename callback to refresh sidebar)

## 5. Sidebar Title Tooltip

**Goal:** Show full conversation title on hover when truncated.

**Implementation:**
- Native `title` attribute on the title element
- Only set when text is actually truncated (`scrollWidth > clientWidth`)
- Use a ref + effect or `onMouseEnter` check to conditionally apply
- No additional UI library — browser native tooltip

**Files affected:**
- Modify: `components/chat/conversation-item.tsx`

## Non-Goals

- Dynamic model list fetched from proxy `/models` endpoint (future enhancement)
- Stream resumption after page refresh (explicitly rejected — drop incomplete exchange instead)
- Mobile long-press for context menu (keep ⋮ tap target for now)

## i18n

New translation keys needed across en, zh, zh-TW:

```
chat.model.label — "Model"
chat.model.haiku — "Haiku 4.5"
chat.model.sonnet — "Sonnet 4.6"
chat.model.opus — "Opus 4.6"
chat.sidebar.rename — "Rename"
chat.sidebar.delete — "Delete"
chat.thinking — "Thinking..."  (accessibility label for screen readers)
```
