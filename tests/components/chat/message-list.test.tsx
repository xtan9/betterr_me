import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import type { UIMessage } from "ai";

expect.extend(axeMatchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/chat/message-bubble", () => ({
  MessageBubble: ({ message }: { message: UIMessage }) => (
    <div data-testid={`bubble-${message.id}`}>{message.id}</div>
  ),
}));

vi.mock("@/components/chat/thinking-indicator", () => ({
  ThinkingIndicator: () => <div data-testid="thinking-indicator">thinking</div>,
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

  it("shows ThinkingIndicator when status is submitted", () => {
    render(<MessageList messages={[]} status="submitted" />);
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
  });

  it("hides ThinkingIndicator for non-submitted statuses", () => {
    const { rerender } = render(
      <MessageList messages={[]} status="streaming" />
    );
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
    rerender(<MessageList messages={[]} status="ready" />);
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
    rerender(<MessageList messages={[]} status="error" />);
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
  });

  it("auto-scrolls to bottom when new messages arrive", () => {
    const { container, rerender } = render(
      <MessageList messages={[makeMessage("1", "user", "a")]} />
    );
    const scrollEl = container.firstChild as HTMLDivElement;
    // jsdom doesn't layout; stub the geometry
    Object.defineProperty(scrollEl, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(scrollEl, "clientHeight", {
      configurable: true,
      value: 200,
    });
    scrollEl.scrollTop = 0;

    rerender(
      <MessageList
        messages={[
          makeMessage("1", "user", "a"),
          makeMessage("2", "assistant", "b"),
        ]}
      />
    );
    expect(scrollEl.scrollTop).toBe(1000);
  });

  it("disables auto-scroll when user scrolls up, re-enables when near bottom", () => {
    const messages = [makeMessage("1", "user", "a")];
    const { container, rerender } = render(<MessageList messages={messages} />);
    const scrollEl = container.firstChild as HTMLDivElement;

    Object.defineProperty(scrollEl, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(scrollEl, "clientHeight", {
      configurable: true,
      value: 200,
    });

    // Scroll up far from bottom — disables auto-scroll
    scrollEl.scrollTop = 100;
    fireEvent.scroll(scrollEl);

    // A new message arrives; since autoScroll is false, scrollTop should not jump
    rerender(
      <MessageList
        messages={[...messages, makeMessage("2", "assistant", "b")]}
      />
    );
    expect(scrollEl.scrollTop).toBe(100);

    // User scrolls back near bottom — re-enables auto-scroll
    scrollEl.scrollTop = 760; // 1000 - 760 - 200 = 40 <= 50
    fireEvent.scroll(scrollEl);

    rerender(
      <MessageList
        messages={[
          ...messages,
          makeMessage("2", "assistant", "b"),
          makeMessage("3", "user", "c"),
        ]}
      />
    );
    expect(scrollEl.scrollTop).toBe(1000);
  });

  it("re-scrolls to bottom on visibilitychange when autoScroll is on", () => {
    const { container } = render(
      <MessageList messages={[makeMessage("1", "user", "a")]} />
    );
    const scrollEl = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollEl, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(scrollEl, "clientHeight", {
      configurable: true,
      value: 200,
    });
    scrollEl.scrollTop = 0;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(scrollEl.scrollTop).toBe(2000);
  });

  it("does not re-scroll on visibilitychange when document is hidden", () => {
    const { container } = render(
      <MessageList messages={[makeMessage("1", "user", "a")]} />
    );
    const scrollEl = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollEl, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(scrollEl, "clientHeight", {
      configurable: true,
      value: 200,
    });
    scrollEl.scrollTop = 50;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(scrollEl.scrollTop).toBe(50);
  });

  it("removes visibilitychange listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<MessageList messages={[]} />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    removeSpy.mockRestore();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <MessageList
        messages={[makeMessage("1", "user", "hi")]}
        status="submitted"
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
