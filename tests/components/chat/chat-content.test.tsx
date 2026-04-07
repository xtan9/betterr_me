import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { UIMessage } from "ai";

// --- Mocks via vi.hoisted ---

const { mockSendMessage, mockStop, mockUseChat, mockSetMessages, mockMutateFn } =
  vi.hoisted(() => {
    const mockSendMessage = vi.fn();
    const mockStop = vi.fn();
    const mockSetMessages = vi.fn();
    const mockMutateFn = vi.fn();
    const mockUseChat = vi.fn(() => ({
      messages: [] as UIMessage[],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined as Error | undefined,
      setMessages: mockSetMessages,
      id: "test-chat",
    }));
    return { mockSendMessage, mockStop, mockUseChat, mockSetMessages, mockMutateFn };
  });

vi.mock("@ai-sdk/react", () => ({ useChat: mockUseChat }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("ai", () => ({
  TextStreamChatTransport: class {
    constructor() {}
  },
}));

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { conversations: [] },
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
      <div data-testid="chat-input" data-streaming={String(props.isStreaming)}>
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

  it("clicking retry removes failed assistant message and resends", () => {
    mockUseChat.mockReturnValue({
      messages: [
        makeMessage("1", "user", "hi"),
        makeMessage("2", "assistant", "partial..."),
      ],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: new Error("LLM proxy unreachable"),
      setMessages: mockSetMessages,
      id: "test-chat",
    });
    render(<ChatContent />);
    fireEvent.click(screen.getByText("error.retry"));
    expect(mockSetMessages).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith({ text: "hi" });
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

  it("creates conversation in stream-complete effect when no conversation selected", async () => {
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
      json: () => Promise.resolve({ conversation: { id: "new-conv-id" }, message: {} }),
      ok: true,
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
      // Should POST /api/conversations with model in body
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      // Should also save messages
      const messageCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("/messages")
      );
      expect(messageCalls.length).toBeGreaterThanOrEqual(1);
    });
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

  it("saves assistant message when status transitions from streaming to ready", async () => {
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
      const saveCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          call[0].includes("/messages") &&
          typeof call[1] === "object" &&
          (call[1] as RequestInit).method === "POST"
      );
      expect(saveCall).toBeTruthy();
    });
  });

  it("triggers title generation after first exchange (exactly 2 messages)", async () => {
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

    await waitFor(() => {
      const titleCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          call[0].includes("/title")
      );
      expect(titleCall).toBeTruthy();
    });
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
      // Should NOT have made a POST to /messages (content is empty)
      const saveCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          call[0].includes("/messages") &&
          typeof call[1] === "object" &&
          (call[1] as RequestInit).method === "POST"
      );
      expect(saveCall).toBeUndefined();
    });
  });

  it("saves assistant message with concatenated text from multiple parts", async () => {
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
      // Find the assistant message save call specifically (role: "assistant")
      const saveCall = mockFetch.mock.calls.find(
        (call: unknown[]) => {
          if (
            typeof call[0] !== "string" ||
            !call[0].includes("/messages") ||
            typeof call[1] !== "object" ||
            (call[1] as RequestInit).method !== "POST"
          ) return false;
          try {
            const body = JSON.parse((call[1] as RequestInit).body as string);
            return body.role === "assistant";
          } catch {
            return false;
          }
        }
      );
      expect(saveCall).toBeTruthy();
      const body = JSON.parse((saveCall![1] as RequestInit).body as string);
      expect(body.content).toBe("Hello there!");
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
});
