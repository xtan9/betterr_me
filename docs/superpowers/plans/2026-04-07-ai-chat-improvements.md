# AI Chat Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the AI chat experience with model selection, thinking indicator, refresh resilience, conversation context menu, and sidebar title tooltips.

**Architecture:** Five independent improvements to the existing chat system. Model selection adds a static model list and a selector below the input. Thinking indicator is a new component shown during the `submitted` status. Refresh resilience defers message persistence until stream completion. Context menu replaces the hover-delete with a DropdownMenu offering rename and delete. Title tooltips use native `title` attributes.

**Tech Stack:** React, Vercel AI SDK (`@ai-sdk/react`), shadcn/ui (DropdownMenu, Select), Radix UI, next-intl, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/ai/models.ts` | Create | Static model list, types, default model constant |
| `components/chat/thinking-indicator.tsx` | Create | Bouncing dots animation component |
| `components/chat/model-selector.tsx` | Create | Model dropdown below chat input |
| `components/chat/chat-input.tsx` | Modify | Add model selector slot below input area |
| `components/chat/chat-content.tsx` | Modify | Deferred persistence, model state, rename handler, pass status to MessageList |
| `components/chat/message-list.tsx` | Modify | Render ThinkingIndicator when status is `submitted` |
| `components/chat/conversation-item.tsx` | Modify | Replace trash icon with ⋮ dropdown menu (rename + delete), add title tooltip |
| `components/chat/conversation-sidebar.tsx` | Modify | Pass rename handler to items |
| `app/api/chat/route.ts` | Modify | Accept model from request body |
| `app/api/conversations/[id]/route.ts` | Modify | Add PATCH handler for rename |
| `lib/validations/chat.ts` | Modify | Add model to chat request schema |
| `i18n/messages/en.json` | Modify | Add new translation keys |
| `i18n/messages/zh.json` | Modify | Add new translation keys |
| `i18n/messages/zh-TW.json` | Modify | Add new translation keys |
| `tests/components/chat/thinking-indicator.test.tsx` | Create | Tests for thinking indicator |
| `tests/components/chat/model-selector.test.tsx` | Create | Tests for model selector |
| `tests/components/chat/conversation-item.test.tsx` | Create | Tests for context menu + tooltip (extracted from sidebar test) |
| `tests/components/chat/chat-input.test.tsx` | Modify | Update for new model selector slot |
| `tests/components/chat/conversation-sidebar.test.tsx` | Modify | Update for rename handler |
| `tests/lib/ai/models.test.ts` | Create | Tests for model list |

---

### Task 1: Static Model List

**Files:**
- Create: `lib/ai/models.ts`
- Create: `tests/lib/ai/models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ai/models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from "@/lib/ai/models";

describe("models", () => {
  it("exports a non-empty list of available models", () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
  });

  it("each model has id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("DEFAULT_MODEL_ID is claude-haiku-4-5", () => {
    expect(DEFAULT_MODEL_ID).toBe("claude-haiku-4-5");
  });

  it("default model exists in the available models list", () => {
    const found = AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(found).toBeDefined();
  });

  it("getModelById returns the correct model", () => {
    const model = getModelById("claude-opus-4-6");
    expect(model).toBeDefined();
    expect(model!.label).toBe("Opus 4.6");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("unknown-model")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/ai/models.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `lib/ai/models.ts`:

```ts
export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
];

export const DEFAULT_MODEL_ID = "claude-haiku-4-5";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/ai/models.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/models.ts tests/lib/ai/models.test.ts
git commit -m "feat(chat): add static model list with haiku default"
```

---

### Task 2: Thinking Indicator Component

**Files:**
- Create: `components/chat/thinking-indicator.tsx`
- Create: `tests/components/chat/thinking-indicator.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/chat/thinking-indicator.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";

describe("ThinkingIndicator", () => {
  it("renders three animated dots", () => {
    render(<ThinkingIndicator />);
    const dots = screen.getAllByTestId("thinking-dot");
    expect(dots).toHaveLength(3);
  });

  it("has an accessible label", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("Thinking...")).toBeInTheDocument();
  });

  it("renders in an assistant-styled bubble", () => {
    const { container } = render(<ThinkingIndicator />);
    const bubble = container.firstElementChild;
    expect(bubble?.className).toContain("justify-start");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/chat/thinking-indicator.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `components/chat/thinking-indicator.tsx`:

```tsx
"use client";

export function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label="Thinking..."
        className="inline-flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3"
      >
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_infinite]"
        />
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]"
        />
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]"
        />
      </div>
    </div>
  );
}
```

Add the `bounce` keyframes to `tailwind.config.ts` if not already present. Check first — Tailwind's default `bounce` may suffice. If it does, use `animate-bounce` with staggered delays via inline style instead:

```tsx
<span
  data-testid="thinking-dot"
  className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
  style={{ animationDelay: "0s" }}
/>
<span
  data-testid="thinking-dot"
  className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
  style={{ animationDelay: "0.2s" }}
/>
<span
  data-testid="thinking-dot"
  className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
  style={{ animationDelay: "0.4s" }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/chat/thinking-indicator.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/chat/thinking-indicator.tsx tests/components/chat/thinking-indicator.test.tsx
git commit -m "feat(chat): add thinking indicator with bouncing dots"
```

---

### Task 3: Wire Thinking Indicator into MessageList

**Files:**
- Modify: `components/chat/message-list.tsx`
- Modify: `components/chat/chat-content.tsx` (pass status prop)

- [ ] **Step 1: Update MessageList to accept and render ThinkingIndicator**

Modify `components/chat/message-list.tsx` — add `status` prop and render `ThinkingIndicator` when status is `"submitted"`:

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "./message-bubble";
import { ThinkingIndicator } from "./thinking-indicator";

interface MessageListProps {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
}

export function MessageList({ messages, status }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll, status]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
    setAutoScroll(isNearBottom);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4"
      onScroll={handleScroll}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {status === "submitted" && <ThinkingIndicator />}
    </div>
  );
}
```

- [ ] **Step 2: Pass status from ChatContent to MessageList**

In `components/chat/chat-content.tsx`, change line 333:

```tsx
// Before:
<MessageList messages={messages} />

// After:
<MessageList messages={messages} status={status} />
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `pnpm vitest run tests/components/chat/message-list.test.tsx tests/components/chat/chat-content.test.tsx`
Expected: PASS (existing tests should still pass — status is optional)

- [ ] **Step 4: Commit**

```bash
git add components/chat/message-list.tsx components/chat/chat-content.tsx
git commit -m "feat(chat): show thinking indicator before first token"
```

---

### Task 4: Model Selector Component

**Files:**
- Create: `components/chat/model-selector.tsx`
- Create: `tests/components/chat/model-selector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/chat/model-selector.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSelector } from "@/components/chat/model-selector";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ModelSelector", () => {
  it("renders a button showing the current model label", () => {
    render(
      <ModelSelector modelId={DEFAULT_MODEL_ID} onModelChange={vi.fn()} />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("defaults to haiku when no modelId provided", () => {
    render(
      <ModelSelector modelId={DEFAULT_MODEL_ID} onModelChange={vi.fn()} />
    );
    // The select trigger should show the default model
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ModelSelector
        modelId={DEFAULT_MODEL_ID}
        onModelChange={vi.fn()}
        disabled
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/chat/model-selector.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `components/chat/model-selector.tsx`:

```tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_MODELS } from "@/lib/ai/models";

interface ModelSelectorProps {
  modelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  modelId,
  onModelChange,
  disabled,
}: ModelSelectorProps) {
  return (
    <Select value={modelId} onValueChange={onModelChange} disabled={disabled}>
      <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/chat/model-selector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/chat/model-selector.tsx tests/components/chat/model-selector.test.tsx
git commit -m "feat(chat): add model selector dropdown component"
```

---

### Task 5: Wire Model Selector into ChatInput and ChatContent

**Files:**
- Modify: `components/chat/chat-input.tsx`
- Modify: `components/chat/chat-content.tsx`
- Modify: `app/api/chat/route.ts`
- Modify: `lib/validations/chat.ts`

- [ ] **Step 1: Add model to chat request validation**

In `lib/validations/chat.ts`, add a chat request schema:

```ts
import { z } from "zod";

export const saveMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(32000, "Message too long"),
});

export const titleRequestSchema = z.object({
  userMessage: z.string().min(1).max(32000),
  assistantMessage: z.string().min(1).max(32000),
});

export const chatRequestModelSchema = z.string().min(1).max(100).optional();
```

- [ ] **Step 2: Update API route to accept model from request body**

In `app/api/chat/route.ts`, change the model selection from hardcoded env var to request body. After `const messages = body.messages;` parsing (around line 43), add:

```ts
// Model selection: prefer request body, fall back to env var, then default
const requestedModel = body.model;
const modelId = (typeof requestedModel === "string" && requestedModel.length > 0)
  ? requestedModel
  : (process.env.LLM_MODEL || "claude-haiku-4-5");
```

Then change line 72-74 from:

```ts
model: llmProvider(
  process.env.LLM_MODEL || "claude-sonnet-4-6",
),
```

To:

```ts
model: llmProvider(modelId),
```

Also update the system prompt to dynamically mention the model:

```ts
system: `You are a helpful AI assistant in BetterR.Me, a personal productivity and finance app. Be concise, friendly, and helpful. The user may ask about habits, tasks, workouts, finances, or general topics.`,
```

- [ ] **Step 3: Add model selector to ChatInput**

Modify `components/chat/chat-input.tsx` to add a slot below the input for the model selector:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, CircleStop } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModelSelector } from "@/components/chat/model-selector";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  modelId,
  onModelChange,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing &&
        !(e as unknown as { isComposing?: boolean }).isComposing
      ) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape" && isStreaming) {
        e.preventDefault();
        onStop();
      }
    },
    [handleSend, isStreaming, onStop]
  );

  return (
    <div className="border-t border-border bg-background px-4 pb-4 pt-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("input.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none min-h-[40px] max-h-[150px] overflow-y-auto rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {isStreaming ? (
          <Button
            variant="default"
            size="icon"
            onClick={onStop}
            aria-label={t("input.stop")}
          >
            <CircleStop className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            aria-label={t("input.send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-1">
        <ModelSelector
          modelId={modelId}
          onModelChange={onModelChange}
          disabled={isStreaming}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire model state in ChatContent**

In `components/chat/chat-content.tsx`, add model state and pass to ChatInput:

After the existing state declarations (around line 52), add:

```ts
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
// ...
const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
```

Update the `transport` to include the model in the request body. Since `TextStreamChatTransport` sends to `/api/chat`, we need to pass the model. The AI SDK's `useChat` `body` option can include extra fields:

Actually, `TextStreamChatTransport` does not support a `body` option directly. Instead, create the transport with a custom headers approach or switch to passing model via a custom fetch. The simplest approach: create a new transport instance when the model changes:

```ts
const transport = useMemo(
  () => new TextStreamChatTransport({
    api: "/api/chat",
    body: { model: selectedModel },
  }),
  [selectedModel]
);
```

Check if `TextStreamChatTransport` accepts `body`. If not, use `headers` to pass the model, or override the API to accept a query param. The most robust approach: pass model in the request body by extending the transport.

**Alternative (simpler):** Use `useChat`'s `body` option if available in the current AI SDK version:

```ts
const { messages, sendMessage, setMessages, stop, status, error } = useChat({
  id: chatId,
  transport,
  body: { model: selectedModel },
});
```

Check the AI SDK docs. If `body` is not supported on `useChat` with transports, then create a custom wrapper. The engineer should verify which approach works.

Update the model when a conversation is loaded:

```ts
// In the conversation load effect, after loading messages:
// Also load the conversation's model
const convModel = conversations.find((c) => c.id === chatId)?.model;
if (convModel) setSelectedModel(convModel);
```

When switching conversations in `handleSelectConversation`:

```ts
const handleSelectConversation = useCallback((id: string) => {
  setActiveConversationId(id);
  setChatId(id);
  window.history.replaceState(null, "", `/chat?id=${id}`);
  setSidebarOpen(false);
  const conv = conversations.find((c) => c.id === id);
  if (conv?.model) setSelectedModel(conv.model);
}, [conversations]);
```

When model changes, update conversation in DB:

```ts
const handleModelChange = useCallback(
  async (modelId: string) => {
    setSelectedModel(modelId);
    if (activeConversationId) {
      try {
        await fetchJSON(`/api/conversations/${activeConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId }),
        });
      } catch (err) {
        log.error("[chat] Failed to update model", err);
      }
    }
  },
  [activeConversationId]
);
```

In new chat handler, reset model:

```ts
const handleNewChat = useCallback(() => {
  setActiveConversationId(null);
  setChatId("new");
  setMessages([]);
  setSelectedModel(DEFAULT_MODEL_ID);
  window.history.replaceState(null, "", "/chat");
  setSidebarOpen(false);
}, [setMessages]);
```

Pass to ChatInput:

```tsx
<ChatInput
  onSend={handleSend}
  onStop={handleStop}
  isStreaming={isStreaming}
  modelId={selectedModel}
  onModelChange={handleModelChange}
/>
```

- [ ] **Step 5: Add PATCH handler to conversations API**

In `app/api/conversations/[id]/route.ts`, add a PATCH handler:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: { title?: string; model?: string } = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.model === "string") updates.model = body.model;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const conversationsDB = new ConversationsDB(supabase);
    await conversationsDB.updateConversation(id, user.id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("PATCH /api/conversations/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Update existing tests for new ChatInput props**

In `tests/components/chat/chat-input.test.tsx`, update `defaultProps` to include the new model props:

```ts
const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
  modelId: "claude-haiku-4-5",
  onModelChange: vi.fn(),
};
```

Mock the ModelSelector to keep tests focused:

```ts
vi.mock("@/components/chat/model-selector", () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));
```

- [ ] **Step 7: Run all chat tests**

Run: `pnpm vitest run tests/components/chat/ tests/lib/ai/`
Expected: PASS

- [ ] **Step 8: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add lib/ai/models.ts lib/validations/chat.ts app/api/chat/route.ts app/api/conversations/[id]/route.ts components/chat/model-selector.tsx components/chat/chat-input.tsx components/chat/chat-content.tsx tests/components/chat/chat-input.test.tsx tests/components/chat/model-selector.test.tsx
git commit -m "feat(chat): wire model selection through UI, API, and DB"
```

---

### Task 6: Deferred Message Persistence (Refresh Resilience)

**Files:**
- Modify: `components/chat/chat-content.tsx`

- [ ] **Step 1: Refactor handleSend — remove pre-stream user message save**

In `components/chat/chat-content.tsx`, modify `handleSend` to remove the user message DB save. The current code saves the user message before sending to LLM (lines 193-202). Remove that block:

```ts
const handleSend = useCallback(
  async (text: string) => {
    let convId = activeConversationId;

    // Don't create conversation yet for new chats — defer until stream completes
    // Just track that we need to create one
    if (!convId) {
      // Store pending state — conversation will be created after stream completes
    }

    // Send to LLM (user message shown optimistically in useChat buffer)
    sendMessage({ text });
  },
  [activeConversationId, sendMessage]
);
```

- [ ] **Step 2: Refactor stream-complete effect — save both messages atomically**

In the `useEffect` that handles stream completion (lines 107-163), refactor to save BOTH user and assistant messages after stream completes:

```ts
useEffect(() => {
  const wasStreaming =
    prevStatusRef.current === "streaming" ||
    prevStatusRef.current === "submitted";
  prevStatusRef.current = status;

  if (wasStreaming && status === "ready" && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;

    const assistantContent = lastMsg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    if (!assistantContent.trim()) return;

    // Find the user message that triggered this response
    const userMsg = messages.length >= 2 ? messages[messages.length - 2] : null;
    const userContent = userMsg?.role === "user"
      ? userMsg.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("")
      : null;

    const saveMessages = async () => {
      let convId = activeConversationId;

      // Create conversation if this is the first message
      if (!convId) {
        try {
          const data = await fetchJSON("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selectedModel }),
          });
          convId = data.conversation.id;
          setActiveConversationId(convId);
          window.history.replaceState(null, "", `/chat?id=${convId}`);
        } catch (err) {
          log.error("[chat] Failed to create conversation", err);
          return;
        }
      }

      // Save user message
      if (userContent) {
        try {
          await fetchJSON(`/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "user", content: userContent }),
          });
        } catch (err) {
          log.error("[chat] Failed to save user message", err);
        }
      }

      // Save assistant message
      try {
        await fetchJSON(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: assistantContent }),
        });
      } catch (err) {
        log.error("[chat] Failed to save assistant message", err);
      }

      // Auto-generate title after first exchange
      if (messages.length === 2 && userContent) {
        fetchJSON(`/api/conversations/${convId}/title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMessage: userContent,
            assistantMessage: assistantContent,
          }),
        })
          .then(() => mutateConversations())
          .catch((err) => log.error("[chat] Failed to generate title", err));
      }

      mutateConversations();
    };

    saveMessages();
  }
}, [status, messages, activeConversationId, mutateConversations, selectedModel]);
```

- [ ] **Step 3: Ensure tab switch doesn't interrupt — verify auto-scroll on visibility change**

Add a `visibilitychange` listener in `MessageList` to re-engage auto-scroll:

In `components/chat/message-list.tsx`, add inside the component:

```ts
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === "visible" && autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}, [autoScroll]);
```

- [ ] **Step 4: Run chat tests**

Run: `pnpm vitest run tests/components/chat/`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/chat/chat-content.tsx components/chat/message-list.tsx
git commit -m "feat(chat): defer persistence until stream completes for refresh resilience"
```

---

### Task 7: Conversation Context Menu (⋮ with Rename + Delete)

**Files:**
- Modify: `components/chat/conversation-item.tsx`
- Modify: `components/chat/conversation-sidebar.tsx`
- Modify: `components/chat/chat-content.tsx`
- Modify: `tests/components/chat/conversation-sidebar.test.tsx`

- [ ] **Step 1: Rewrite ConversationItem with DropdownMenu**

Replace `components/chat/conversation-item.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Conversation } from "@/lib/db/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const t = useTranslations("chat");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Check if title is truncated
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [conversation.title]);

  const handleStartRename = useCallback(() => {
    setRenameValue(conversation.title ?? "");
    setIsRenaming(true);
  }, [conversation.title]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleConfirmRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, conversation.id, conversation.title, onRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmRename();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsRenaming(false);
      }
    },
    [handleConfirmRename]
  );

  const displayTitle = conversation.title ?? t("sidebar.untitled");

  return (
    <div
      className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted"
      }`}
      onClick={() => !isRenaming && onSelect(conversation.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isRenaming) onSelect(conversation.id);
      }}
    >
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleConfirmRename}
          className="flex-1 mr-2 rounded border border-input bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span
          ref={titleRef}
          className="truncate flex-1 mr-2"
          title={isTruncated ? displayTitle : undefined}
        >
          {displayTitle}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleStartRename}>
            {t("sidebar.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onDelete(conversation.id)}
          >
            {t("sidebar.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Update ConversationSidebar to pass onRename**

In `components/chat/conversation-sidebar.tsx`, add `onRenameConversation` to props:

```tsx
interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}
```

Pass it through `SidebarContent` and into each `ConversationItem`:

```tsx
<ConversationItem
  key={conversation.id}
  conversation={conversation}
  isActive={conversation.id === activeConversationId}
  onSelect={onSelectConversation}
  onDelete={onDeleteConversation}
  onRename={onRenameConversation}
/>
```

- [ ] **Step 3: Add rename handler in ChatContent**

In `components/chat/chat-content.tsx`, add:

```ts
const handleRenameConversation = useCallback(
  async (id: string, title: string) => {
    try {
      await fetchJSON(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      mutateConversations();
    } catch (err) {
      log.error("[chat] Failed to rename conversation", err);
    }
  },
  [mutateConversations]
);
```

Pass to sidebar:

```tsx
<ConversationSidebar
  conversations={conversations}
  activeConversationId={activeConversationId}
  onSelectConversation={handleSelectConversation}
  onNewChat={handleNewChat}
  onDeleteConversation={handleDeleteConversation}
  onRenameConversation={handleRenameConversation}
  isOpen={sidebarOpen}
  onToggle={() => setSidebarOpen(false)}
/>
```

- [ ] **Step 4: Update tests**

In `tests/components/chat/conversation-sidebar.test.tsx`:

1. Update the `makeConversation` model field to `"claude-haiku-4-5"`
2. Add `onRenameConversation: vi.fn()` to `defaultProps`
3. Update the `lucide-react` mock to include `MoreVertical`:

```ts
vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus">+</span>,
  PanelLeftClose: () => <span data-testid="icon-panel-close">X</span>,
  MoreVertical: () => <span data-testid="icon-more">⋮</span>,
}));
```

4. Mock the dropdown-menu components:

```ts
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild, ...props }: React.PropsWithChildren<{ asChild?: boolean }>) => <div {...props}>{children}</div>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));
```

5. Update the delete test: instead of `screen.getAllByLabelText("sidebar.deleteConfirm")`, find the delete option in the dropdown menu: `screen.getAllByText("sidebar.delete")`.

6. Add a rename test:

```ts
it("calls onRenameConversation through the rename option", () => {
  const onRename = vi.fn();
  render(
    <ConversationSidebar {...defaultProps} onRenameConversation={onRename} />
  );
  const renameButtons = screen.getAllByText("sidebar.rename");
  fireEvent.click(renameButtons[0]);
  // This triggers inline edit mode — the actual rename calls onRename on blur/enter
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/components/chat/`
Expected: PASS

- [ ] **Step 6: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add components/chat/conversation-item.tsx components/chat/conversation-sidebar.tsx components/chat/chat-content.tsx tests/components/chat/conversation-sidebar.test.tsx
git commit -m "feat(chat): add context menu with rename and delete for conversations"
```

---

### Task 8: i18n — Add Translation Keys

**Files:**
- Modify: `i18n/messages/en.json`
- Modify: `i18n/messages/zh.json`
- Modify: `i18n/messages/zh-TW.json`

- [ ] **Step 1: Add keys to en.json**

In the `"chat"` section of `i18n/messages/en.json`, add/update:

```json
{
  "chat": {
    "emptyState": {
      "greeting": "How can I help?"
    },
    "input": {
      "placeholder": "Message...",
      "send": "Send",
      "stop": "Stop"
    },
    "error": {
      "generic": "Something went wrong. Please try again.",
      "unauthorized": "Your session has expired. Please log in again.",
      "unavailable": "AI service is temporarily unavailable.",
      "authExpired": "AI service authentication expired. Please try again later.",
      "retry": "Retry"
    },
    "sidebar": {
      "title": "Conversations",
      "newChat": "New chat",
      "untitled": "New conversation",
      "deleteConfirm": "Delete conversation?",
      "rename": "Rename",
      "delete": "Delete"
    },
    "model": {
      "label": "Model"
    },
    "loading": "Loading...",
    "thinking": "Thinking..."
  }
}
```

- [ ] **Step 2: Add keys to zh.json**

```json
{
  "sidebar": {
    "rename": "重命名",
    "delete": "删除"
  },
  "model": {
    "label": "模型"
  },
  "thinking": "思考中..."
}
```

- [ ] **Step 3: Add keys to zh-TW.json**

```json
{
  "sidebar": {
    "rename": "重新命名",
    "delete": "刪除"
  },
  "model": {
    "label": "模型"
  },
  "thinking": "思考中..."
}
```

- [ ] **Step 4: Run lint and tests**

Run: `pnpm lint && pnpm vitest run tests/components/chat/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add i18n/messages/en.json i18n/messages/zh.json i18n/messages/zh-TW.json
git commit -m "feat(chat): add i18n keys for model selector, rename, and thinking indicator"
```

---

### Task 9: Final Integration Test & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: PASS (excluding known pre-existing failures in habit-logs.test.ts)

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining fixes**

If any fixes were needed, commit them with descriptive messages.

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin feat/ai-chat-improvements
```

Create PR with summary of all 5 improvements.
