import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ChatStatus, UIMessage } from "ai";

// --- Mocks via vi.hoisted ---

const { mockSendMessage, mockRegenerate, mockStop, mockUseChat, mockSetMessages, mockMutateFn, mockSwrData } =
  vi.hoisted(() => {
    const mockSendMessage = vi.fn();
    const mockRegenerate = vi.fn();
    const mockStop = vi.fn();
    const mockSetMessages = vi.fn();
    const mockMutateFn = vi.fn();
    const mockSwrData = { current: { conversations: [] as Record<string, unknown>[] } };
    const mockUseChat = vi.fn((): any => ({
      messages: [] as UIMessage[],
      sendMessage: mockSendMessage,
      regenerate: mockRegenerate,
      stop: mockStop,
      status: "ready" as ChatStatus,
      error: undefined as Error | undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    }));
    return { mockSendMessage, mockRegenerate, mockStop, mockUseChat, mockSetMessages, mockMutateFn, mockSwrData };
  });

vi.mock("@ai-sdk/react", () => ({ useChat: mockUseChat }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class {
    constructor() {}
  },
}));

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: mockSwrData.current,
    mutate: mockMutateFn,
  })),
}));

vi.mock("@/lib/chat/message-utils", () => ({
  dbMessageToUIMessage: vi.fn((msg: { id: string; role: string; content: string; created_at: string }) => ({
    id: msg.id,
    role: msg.role,
    parts: [{ type: "text" as const, text: msg.content }],
  })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Mock leaf components ---

vi.mock("@/components/chat/message-list", () => ({
  MessageList: ({ messages }: { messages: UIMessage[] }) => (
    <div data-testid="message-list" data-count={messages.length}>
      {messages.map((m) => (
        <div key={m.id}>{m.id}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/chat/chat-input", () => ({
  ChatInput: (props: Record<string, unknown>) => (
      <div
        data-testid="chat-input"
        data-streaming={String(props.isStreaming)}
        data-disabled={String(props.disabled ?? false)}
        data-model-id={String(props.modelId ?? "")}
      >
        <button
          data-testid="mock-send"
          onClick={() => (props.onSend as (t: string) => void)("hello")}
        >
          Send
        </button>
        <button
          data-testid="mock-stop"
          onClick={() => (props.onStop as () => void)()}
        >
          Stop
        </button>
        <button
          data-testid="mock-model-change"
          onClick={() =>
            (props.onModelChange as (modelId: string) => void)("gpt-5.6-sol")
          }
        >
          Change model
        </button>
      </div>
    ),
}));

vi.mock("@/components/chat/chat-empty-state", () => ({
  ChatEmptyState: () => <div data-testid="chat-empty-state">Empty</div>,
}));

vi.mock("@/components/chat/conversation-sidebar", () => ({
  ConversationSidebar: (props: Record<string, unknown>) => (
    <div
      data-testid="conversation-sidebar"
      data-active-id={String(props.activeConversationId ?? "")}
      data-count={String(
        (props.conversations as unknown[])?.length ?? 0
      )}
    >
      <button
        data-testid="sidebar-new-chat"
        onClick={() => (props.onNewChat as () => void)()}
      >
        New
      </button>
      <button
        data-testid="sidebar-select"
        onClick={() =>
          (props.onSelectConversation as (id: string) => void)("conv-123")
        }
      >
        Select
      </button>
      <button
        data-testid="sidebar-delete"
        onClick={() =>
          (props.onDeleteConversation as (id: string) => void)("conv-123")
        }
      >
        Delete
      </button>
    </div>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert">!</span>,
  PanelLeftOpen: () => <span data-testid="icon-panel">P</span>,
}));

import { ChatContent } from "@/components/chat/chat-content";

const makeMessage = (
  id: string,
  role: "user" | "assistant",
  text: string
): UIMessage => ({
  id,
  role,
  parts: [{ type: "text" as const, text }],
});

describe("ChatContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset SWR data
    mockSwrData.current = { conversations: [] };
    // Reset to default return value
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    // Reset global fetch
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ conversations: [], messages: [] }),
        ok: true,
      })
    ));
  });

  it("renders ChatEmptyState when messages array is empty", () => {
    render(<ChatContent />);
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("message-list")).not.toBeInTheDocument();
  });

  it("does NOT render ChatEmptyState when messages array has items", () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage("1", "user", "hi")],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.queryByTestId("chat-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders MessageList with messages when status is ready and messages exist", () => {
    const msgs = [
      makeMessage("1", "user", "hi"),
      makeMessage("2", "assistant", "hello"),
    ];
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    const list = screen.getByTestId("message-list");
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute("data-count", "2");
  });

  it("calls sendMessage with { text } when user calls onSend", () => {
    // handleSend now just calls sendMessage — no fetch calls happen here.
    // Persistence is deferred to the stream-complete effect.
    render(<ChatContent />);
    fireEvent.click(screen.getByTestId("mock-send"));
    expect(mockSendMessage).toHaveBeenCalledWith({ text: "hello" });
  });

  it("passes isStreaming=true to ChatInput when status is streaming", () => {
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-streaming",
      "true"
    );
  });

  it("passes isStreaming=true to ChatInput when status is submitted", () => {
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "submitted" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-streaming",
      "true"
    );
  });

  it("calls stop() when user calls onStop", () => {
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    fireEvent.click(screen.getByTestId("mock-stop"));
    expect(mockStop).toHaveBeenCalled();
  });

  it("renders error message and retry button for retryable errors", () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage("1", "user", "hi")],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("LLM proxy unreachable"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.generic")).toBeInTheDocument();
    expect(screen.getByText("error.retry")).toBeInTheDocument();
  });

  it("does not show retry button for 401 Unauthorized errors", () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage("1", "user", "hi")],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("Unauthorized"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.unauthorized")).toBeInTheDocument();
    expect(screen.queryByText("error.retry")).not.toBeInTheDocument();
  });

  it("does not show retry button for 503 not configured errors", () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage("1", "user", "hi")],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("AI service is not configured"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.unavailable")).toBeInTheDocument();
    expect(screen.queryByText("error.retry")).not.toBeInTheDocument();
  });

  it("clicking retry regenerates the same turn without adding another user message", () => {
    mockUseChat.mockReturnValue({
      messages: [
        makeMessage("1", "user", "hi"),
        makeMessage("2", "assistant", "partial..."),
      ],
      sendMessage: mockSendMessage,
      regenerate: mockRegenerate,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("LLM proxy unreachable"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    fireEvent.click(screen.getByText("error.retry"));
    expect(mockRegenerate).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does not show retry button when no user message exists", () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage("1", "assistant", "hello")],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("LLM proxy unreachable"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.generic")).toBeInTheDocument();
    expect(screen.queryByText("error.retry")).not.toBeInTheDocument();
  });

  // --- New tests for conversation features ---

  it("renders conversation sidebar", () => {
    render(<ChatContent />);
    expect(screen.getByTestId("conversation-sidebar")).toBeInTheDocument();
  });

  it("passes conversationId prop as active conversation", () => {
    render(<ChatContent conversationId="conv-abc" />);
    const sidebar = screen.getByTestId("conversation-sidebar");
    expect(sidebar).toHaveAttribute("data-active-id", "conv-abc");
  });

  it("persists a new conversation and its first turn through one lifecycle request", async () => {
    const msgs = [
      makeMessage("1", "user", "hello"),
      makeMessage("2", "assistant", "hi there"),
    ];

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ conversationId: "new-conv-id", outcome: "saved" }),
      ok: true,
      status: 201,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent />);

    // Transition to ready — stream-complete effect fires
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    rerender(<ChatContent />);

    await waitFor(() => {
      // The server owns conversation creation, both messages, title assignment,
      // and the stable navigation identifier in one lifecycle.
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/turns",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            turnId: "1",
            userMessage: "hello",
            assistantMessage: "hi there",
            assistantModel: "gpt-5.4-mini",
          }),
        }),
      );
    });

    expect(
      mockFetch.mock.calls.some(
        ([url]) => url === "/api/conversations/new-conv-id/turns",
      ),
    ).toBe(false);
  });

  it("blocks another turn until the initial lifecycle returns a stable id", async () => {
    const msgs = [
      makeMessage("first-turn", "user", "hello"),
      makeMessage("assistant-1", "assistant", "hi there"),
    ];
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    let resolveLifecycle!: (response: Response) => void;
    const lifecycleResponse = new Promise<Response>((resolve) => {
      resolveLifecycle = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/conversations/turns") return lifecycleResponse;
      return Promise.resolve({
        json: () => Promise.resolve({ conversations: [] }),
        ok: true,
        status: 200,
      } as Response);
    }));

    const { rerender } = render(<ChatContent />);
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    rerender(<ChatContent />);

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).toHaveAttribute(
        "data-disabled",
        "true",
      ),
    );
    fireEvent.click(screen.getByTestId("mock-send"));
    expect(mockSendMessage).not.toHaveBeenCalled();

    resolveLifecycle({
      json: () =>
        Promise.resolve({ outcome: "saved", conversationId: "conv-1" }),
      ok: true,
      status: 201,
    } as Response);

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).toHaveAttribute(
        "data-disabled",
        "false",
      ),
    );
  });

  it("fetches messages when conversationId is provided", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("/messages")) {
        return Promise.resolve({
          json: () => Promise.resolve({ messages: [] }),
          ok: true,
          status: 200,
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ conversations: [] }),
        ok: true,
        status: 200,
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatContent conversationId="conv-xyz" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-xyz/messages",
        undefined,
      );
    });
  });

  it("saves a completed turn in one request when streaming becomes ready", async () => {
    const msgs = [
      makeMessage("1", "user", "hi"),
      makeMessage("2", "assistant", "hello there"),
    ];

    // First render with streaming status
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent conversationId="conv-save" />);

    // Transition to ready
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    rerender(<ChatContent conversationId="conv-save" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-save/turns",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            turnId: "1",
            userMessage: "hi",
            assistantMessage: "hello there",
            assistantModel: "gpt-5.4-mini",
          }),
        }),
      );
    });
  });

  it("retries turn persistence with the same turn id after a transient failure", async () => {
    const msgs = [
      makeMessage("stable-turn-id", "user", "hi"),
      makeMessage("2", "assistant", "hello there"),
    ];
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    let turnAttempts = 0;
    const mockFetch = vi.fn((url: string, _init?: RequestInit) => {
      if (url.endsWith("/turns")) {
        turnAttempts += 1;
        return Promise.resolve({
          json: () => Promise.resolve(
            turnAttempts === 1
              ? { outcome: "failed", error: "temporary failure" }
              : { outcome: "saved", messages: [] },
          ),
          ok: turnAttempts > 1,
          status: turnAttempts === 1 ? 500 : 201,
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ messages: [] }),
        ok: true,
        status: 200,
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(
      <ChatContent conversationId="conv-retry-save" />,
    );
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    rerender(<ChatContent conversationId="conv-retry-save" />);

    await waitFor(() => {
      const turnCalls = mockFetch.mock.calls.filter(
        ([url]) => typeof url === "string" && url.endsWith("/turns"),
      );
      expect(turnCalls).toHaveLength(2);
      const bodies = turnCalls.map(([, init]) =>
        JSON.parse((init as RequestInit).body as string),
      );
      expect(bodies.map((body) => body.turnId)).toEqual([
        "stable-turn-id",
        "stable-turn-id",
      ]);
    });
  });

  it("shows a recoverable error when completed-turn persistence fails", async () => {
    const msgs = [
      makeMessage("stable-turn-id", "user", "hi"),
      makeMessage("2", "assistant", "hello there"),
    ];
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    let turnAttempts = 0;
    const turnBodies: unknown[] = [];
    const mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/conversations/turns") {
        turnAttempts += 1;
        turnBodies.push(JSON.parse(init?.body as string));
        return Promise.resolve({
          json: () =>
            Promise.resolve(
              turnAttempts <= 2
                ? { outcome: "failed", error: "temporary failure" }
                : { outcome: "saved", conversationId: "new-conv-id", messages: [] },
            ),
          ok: turnAttempts > 2,
          status: turnAttempts <= 2 ? 500 : 201,
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ messages: [] }),
        ok: true,
        status: 200,
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent />);
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    rerender(<ChatContent />);

    expect(await screen.findByText("error.generic")).toBeInTheDocument();
    expect(turnAttempts).toBe(2);
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-disabled",
      "true",
    );

    fireEvent.click(screen.getByText("error.retry"));

    await waitFor(() => expect(turnAttempts).toBe(3));
    const lifecycleCalls = mockFetch.mock.calls.filter(
      ([url]) => url === "/api/conversations/turns",
    );
    expect(lifecycleCalls).toHaveLength(3);
    expect(turnBodies).toEqual([
      expect.objectContaining({ turnId: "stable-turn-id" }),
      expect.objectContaining({ turnId: "stable-turn-id" }),
      expect.objectContaining({ turnId: "stable-turn-id" }),
    ]);
    await waitFor(() =>
      expect(screen.queryByText("error.generic")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-disabled",
      "false",
    );
  });

  it("persists the model selected when the turn was submitted", async () => {
    const msgs = [
      makeMessage("model-turn-id", "user", "hi"),
      makeMessage("2", "assistant", "hello there"),
    ];
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    let rejectModelUpdate!: (error: Error) => void;
    const modelUpdate = new Promise<Response>((_resolve, reject) => {
      rejectModelUpdate = reject;
    });
    const mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (
        url === "/api/conversations/conv-model/turns" &&
        init?.method === "POST"
      ) {
        return Promise.resolve({
          json: () => Promise.resolve({ outcome: "saved", messages: [] }),
          ok: true,
          status: 201,
        });
      }
      if (url === "/api/conversations/conv-model" && init?.method === "PATCH") {
        return modelUpdate;
      }
      return Promise.resolve({
        json: () => Promise.resolve({ messages: [] }),
        ok: true,
        status: 200,
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent conversationId="conv-model" />);
    fireEvent.click(screen.getByTestId("mock-model-change"));
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-model-id",
      "gpt-5.6-sol",
    );
    fireEvent.click(screen.getByTestId("mock-send"));

    rejectModelUpdate(new Error("model update failed"));
    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).toHaveAttribute(
        "data-model-id",
        "gpt-5.4-mini",
      ),
    );

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    rerender(<ChatContent conversationId="conv-model" />);

    await waitFor(() => {
      const turnCall = mockFetch.mock.calls.find(
        ([url, init]) =>
          url === "/api/conversations/conv-model/turns" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(turnCall).toBeTruthy();
      expect(JSON.parse((turnCall![1] as RequestInit).body as string)).toEqual(
        expect.objectContaining({ assistantModel: "gpt-5.6-sol" }),
      );
    });
  });

  it("does not start separate title work for an existing-conversation turn", async () => {
    const msgs = [
      makeMessage("1", "user", "hi"),
      makeMessage("2", "assistant", "hello"),
    ];

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent conversationId="conv-title" />);

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    rerender(<ChatContent conversationId="conv-title" />);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-title/turns",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      mockFetch.mock.calls.some(
        ([url]) => typeof url === "string" && url.includes("/title"),
      ),
    ).toBe(false);
  });

  it("clears state when deleting the active conversation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    // Render with sidebar delete button targeting conv-123
    // The mock sidebar's delete button calls onDeleteConversation("conv-123")
    render(<ChatContent conversationId="conv-123" />);

    fireEvent.click(screen.getByTestId("sidebar-delete"));

    await waitFor(() => {
      // Verify DELETE was called
      const deleteCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === "object" &&
          (call[1] as RequestInit).method === "DELETE"
      );
      expect(deleteCall).toBeTruthy();
    });

    // Verify conversation list was refreshed
    expect(mockMutateFn).toHaveBeenCalled();
    // Verify messages were cleared (active conversation was deleted)
    expect(mockSetMessages).toHaveBeenCalledWith([]);
  });

  it("does not save assistant message when content is empty", async () => {
    // Assistant message with empty text part
    const msgs = [
      makeMessage("1", "user", "hi"),
      { id: "2", role: "assistant" as const, parts: [{ type: "text" as const, text: "" }] },
    ];

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent conversationId="conv-empty" />);

    // Transition to ready with empty assistant content
    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    rerender(<ChatContent conversationId="conv-empty" />);

    // Wait a tick to ensure effect has run
    await waitFor(() => {
      // Should NOT have attempted to persist an incomplete turn.
      const saveCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          call[0] === "/api/conversations/conv-empty/turns" &&
          typeof call[1] === "object" &&
          (call[1] as RequestInit).method === "POST"
      );
      expect(saveCall).toBeUndefined();
    });
  });

  it("saves concatenated assistant text from multiple parts", async () => {
    const msgs = [
      makeMessage("1", "user", "hi"),
      {
        id: "2",
        role: "assistant" as const,
        parts: [
          { type: "text" as const, text: "Hello " },
          { type: "text" as const, text: "there!" },
        ],
      },
    ];

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "streaming" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = render(<ChatContent conversationId="conv-multi" />);

    mockUseChat.mockReturnValue({
      messages: msgs,
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    });

    rerender(<ChatContent conversationId="conv-multi" />);

    await waitFor(() => {
      const saveCall = mockFetch.mock.calls.find(
        (call: unknown[]) => {
          if (
            typeof call[0] !== "string" ||
            !call[0].includes("/turns") ||
            typeof call[1] !== "object" ||
            (call[1] as RequestInit).method !== "POST"
          ) return false;
          try {
            const body = JSON.parse((call[1] as RequestInit).body as string);
            return body.assistantMessage === "Hello there!";
          } catch {
            return false;
          }
        }
      );
      expect(saveCall).toBeTruthy();
      const body = JSON.parse((saveCall![1] as RequestInit).body as string);
      expect(body.assistantMessage).toBe("Hello there!");
    });
  });

  it("resets state when clicking new chat", () => {
    render(<ChatContent conversationId="conv-abc" />);

    fireEvent.click(screen.getByTestId("sidebar-new-chat"));

    // Verify messages were cleared
    expect(mockSetMessages).toHaveBeenCalledWith([]);
    // Verify sidebar shows no active conversation after new chat
    const sidebar = screen.getByTestId("conversation-sidebar");
    expect(sidebar).toHaveAttribute("data-active-id", "");
  });

  // --- Model validation on conversation select ---

  it("uses valid stored model when selecting a conversation", () => {
    mockSwrData.current = {
      conversations: [
        { id: "conv-123", title: "Test", model: "gpt-5.6-sol", created_at: "", updated_at: "" },
      ],
    };
    render(<ChatContent />);

    fireEvent.click(screen.getByTestId("sidebar-select"));

    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-model-id",
      "gpt-5.6-sol"
    );
  });

  it("falls back to default model when stored model is invalid/stale", () => {
    mockSwrData.current = {
      conversations: [
        { id: "conv-123", title: "Test", model: "claude-haiku-4-5", created_at: "", updated_at: "" },
      ],
    };
    render(<ChatContent />);

    fireEvent.click(screen.getByTestId("sidebar-select"));

    // Should fall back to DEFAULT_MODEL_ID, not use the stale "claude-haiku-4-5"
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-model-id",
      "gpt-5.4-mini"
    );
  });

  it("falls back to default model when conversation has no model stored", () => {
    mockSwrData.current = {
      conversations: [
        { id: "conv-123", title: "Test", created_at: "", updated_at: "" },
      ],
    };
    render(<ChatContent />);

    fireEvent.click(screen.getByTestId("sidebar-select"));

    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-model-id",
      "gpt-5.4-mini"
    );
  });
});
