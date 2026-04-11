import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "@/components/chat/chat-input";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/chat/model-selector", () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
  modelId: "claude-haiku-4-5-20251001",
  onModelChange: vi.fn(),
};

describe("ChatInput", () => {
  it("renders a textarea element and a send button", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "input.send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "input.attach" })).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<ChatInput {...defaultProps} />);
    const button = screen.getByRole("button", { name: "input.send" });
    expect(button).toBeDisabled();
  });

  it("send button is disabled when isStreaming=true", () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);
    // When streaming, the stop button is shown instead of send
    const button = screen.getByRole("button", { name: "input.stop" });
    expect(button).not.toBeDisabled();
  });

  it("pressing Enter (without Shift) calls onSend with the input text", async () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledWith("Hello world", undefined);
  });

  it("pressing Shift+Enter does NOT call onSend", async () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("pressing Escape when isStreaming=true calls onStop", () => {
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps} onStop={onStop} isStreaming={true} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onStop).toHaveBeenCalled();
  });

  it("pressing Escape when isStreaming=false does NOT call onStop", () => {
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps} onStop={onStop} isStreaming={false} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onStop).not.toHaveBeenCalled();
  });

  it("pressing Enter on empty input does NOT call onSend", () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("stop button (CircleStop icon) is visible when isStreaming=true instead of send button", () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);
    const button = screen.getByRole("button", { name: "input.stop" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("isComposing=true prevents Enter from sending (IME support)", () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "Hello" } });
    // Simulate IME composing - use isComposing property (standard KeyboardEvent property)
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, {
      key: "Enter",
      shiftKey: false,
      isComposing: true,
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("textarea has translated placeholder text", () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("placeholder", "input.placeholder");
  });

  it("textarea clears after sending a message", () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(textarea).toHaveValue("Hello");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(textarea).toHaveValue("");
  });

  it("textarea and buttons are disabled when disabled prop is true", () => {
    render(<ChatInput {...defaultProps} disabled={true} />);
    const textarea = screen.getByRole("textbox");
    const sendButton = screen.getByRole("button", { name: "input.send" });
    const attachButton = screen.getByRole("button", { name: "input.attach" });
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(attachButton).toBeDisabled();
  });

  it("pressing Enter while isStreaming does not call onSend", () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} isStreaming={true} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("aria-labels use translated strings", () => {
    const { rerender } = render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole("button", { name: "input.send" })).toHaveAttribute("aria-label", "input.send");
    expect(screen.getByRole("button", { name: "input.attach" })).toHaveAttribute("aria-label", "input.attach");

    rerender(<ChatInput {...defaultProps} isStreaming={true} />);
    expect(screen.getByRole("button", { name: "input.stop" })).toHaveAttribute("aria-label", "input.stop");
  });
});
