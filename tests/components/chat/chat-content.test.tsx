import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UIMessage } from "ai";

// --- Mocks via vi.hoisted ---

const { mockSendMessage, mockStop, mockUseChat } = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockStop = vi.fn();
  const mockUseChat = vi.fn(() => ({
    messages: [] as UIMessage[],
    sendMessage: mockSendMessage,
    stop: mockStop,
    status: "ready" as const,
    error: undefined as Error | undefined,
    setMessages: vi.fn(),
    id: "test-chat",
  }));
  return { mockSendMessage, mockStop, mockUseChat };
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

// --- Mock leaf components ---

let capturedChatInputProps: Record<string, unknown> = {};

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
  ChatInput: (props: Record<string, unknown>) => {
    capturedChatInputProps = props;
    return (
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
    );
  },
}));

vi.mock("@/components/chat/chat-empty-state", () => ({
  ChatEmptyState: () => <div data-testid="chat-empty-state">Empty</div>,
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
  createdAt: new Date(),
});

describe("ChatContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedChatInputProps = {};
    // Reset to default return value
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      stop: mockStop,
      status: "ready" as const,
      error: undefined,
      setMessages: vi.fn(),
      id: "test-chat",
    });
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
      id: "test-chat",
    });
    render(<ChatContent />);
    const list = screen.getByTestId("message-list");
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute("data-count", "2");
  });

  it("calls sendMessage with { text } when user calls onSend", () => {
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
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
      setMessages: vi.fn(),
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.unavailable")).toBeInTheDocument();
    expect(screen.queryByText("error.retry")).not.toBeInTheDocument();
  });

  it("clicking retry removes failed assistant message and resends", () => {
    const mockSetMessages = vi.fn();
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
      setMessages: vi.fn(),
      id: "test-chat",
    });
    render(<ChatContent />);
    expect(screen.getByText("error.generic")).toBeInTheDocument();
    // No retry button because lastUserMessage is empty
    expect(screen.queryByText("error.retry")).not.toBeInTheDocument();
  });
});
