import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/chat/message-bubble";

// Mock MarkdownRenderer to isolate bubble logic
vi.mock("@/components/chat/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

function makeMessage(
  role: "user" | "assistant",
  text: string,
  state?: "streaming" | "done"
) {
  return {
    id: "msg-1",
    role,
    parts: [{ type: "text" as const, text, state }],
    createdAt: new Date(),
  };
}

describe("MessageBubble", () => {
  it('user message has "ml-auto" and "bg-primary" class', () => {
    const { container } = render(
      <MessageBubble message={makeMessage("user", "Hello")} />
    );
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble.className).toContain("ml-auto");
    expect(bubble.className).toContain("bg-primary");
  });

  it('assistant message has "mr-auto" and "bg-muted" class', () => {
    const { container } = render(
      <MessageBubble message={makeMessage("assistant", "Hi there")} />
    );
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble.className).toContain("mr-auto");
    expect(bubble.className).toContain("bg-muted");
  });

  it("assistant message renders markdown via MarkdownRenderer", () => {
    render(
      <MessageBubble message={makeMessage("assistant", "**bold text**")} />
    );
    expect(screen.getByTestId("markdown-renderer")).toBeInTheDocument();
    expect(screen.getByText("**bold text**")).toBeInTheDocument();
  });

  it('user message renders plain text with "whitespace-pre-wrap" class', () => {
    render(<MessageBubble message={makeMessage("user", "plain text")} />);
    const textEl = screen.getByText("plain text");
    expect(textEl).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByTestId("markdown-renderer")).not.toBeInTheDocument();
  });

  it("streaming assistant message shows blinking cursor element", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage("assistant", "typing...", "streaming")}
      />
    );
    const cursor = container.querySelector(".animate-blink-cursor");
    expect(cursor).toBeInTheDocument();
  });

  it("completed assistant message does NOT show blinking cursor", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage("assistant", "done message", "done")}
      />
    );
    const cursor = container.querySelector(".animate-blink-cursor");
    expect(cursor).not.toBeInTheDocument();
  });
});
