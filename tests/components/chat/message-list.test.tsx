import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/chat/message-bubble", () => ({
  MessageBubble: ({ message }: { message: UIMessage }) => (
    <div data-testid={`bubble-${message.id}`}>{message.id}</div>
  ),
}));

import { MessageList } from "@/components/chat/message-list";

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

describe("MessageList", () => {
  it("renders a MessageBubble for each message", () => {
    const messages = [
      makeMessage("1", "user", "hi"),
      makeMessage("2", "assistant", "hello"),
    ];
    render(<MessageList messages={messages} />);
    expect(screen.getByTestId("bubble-1")).toBeInTheDocument();
    expect(screen.getByTestId("bubble-2")).toBeInTheDocument();
  });

  it("renders empty container when no messages", () => {
    const { container } = render(<MessageList messages={[]} />);
    expect(container.querySelector("[class*='overflow-y-auto']")).toBeInTheDocument();
  });

  it("renders correct number of bubbles", () => {
    const messages = [
      makeMessage("1", "user", "a"),
      makeMessage("2", "assistant", "b"),
      makeMessage("3", "user", "c"),
    ];
    render(<MessageList messages={messages} />);
    expect(screen.getByTestId("bubble-1")).toBeInTheDocument();
    expect(screen.getByTestId("bubble-2")).toBeInTheDocument();
    expect(screen.getByTestId("bubble-3")).toBeInTheDocument();
  });
});
