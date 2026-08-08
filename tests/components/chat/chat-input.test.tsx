import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, createEvent } from "@testing-library/react";
import { ChatInput } from "@/components/chat/chat-input";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
};

describe("ChatInput", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a textarea element and a send button", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "input.send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "input.attach" })).toBeInTheDocument();
  });

  it("does not render a model selector", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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

  it("clicking attach button triggers hidden file input click", () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "input.attach" }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("uploading a valid image file adds a preview and send button becomes enabled", async () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "pic.png", { type: "image/png" });

    // Mock FileReader
    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    fireEvent.change(fileInput, { target: { files: [file] } });

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
    expect(img).toHaveAttribute("alt", "pic.png");
    // Send button enabled because images present (no text needed)
    expect(screen.getByRole("button", { name: "input.send" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove image 1" })).toBeInTheDocument();
  });

  it("removing an uploaded image clears the preview", async () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "pic.png", { type: "image/png" });

    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    fireEvent.change(fileInput, { target: { files: [file] } });
    const removeBtn = await screen.findByRole("button", { name: "Remove image 1" });
    fireEvent.click(removeBtn);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects files with invalid MIME type and shows error message", () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByText("input.invalidType")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects files exceeding max size and shows error message", () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [big] } });
    expect(screen.getByText("input.fileTooLarge")).toBeInTheDocument();
  });

  it("file error auto-clears after 3 seconds", () => {
    vi.useFakeTimers();
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByText("input.invalidType")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText("input.invalidType")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("drag enter shows drop zone; drag leave hides it", () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const dropTarget = container.firstChild as HTMLElement;
    fireEvent.dragEnter(dropTarget);
    expect(screen.getByText("input.dropZone")).toBeInTheDocument();
    fireEvent.dragLeave(dropTarget);
    expect(screen.queryByText("input.dropZone")).not.toBeInTheDocument();
  });

  it("drag over is handled (prevents default) and drop processes files", async () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const dropTarget = container.firstChild as HTMLElement;

    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    const file = new File(["x"], "drop.png", { type: "image/png" });
    fireEvent.dragEnter(dropTarget);
    fireEvent.dragOver(dropTarget);
    const dropEvent = createEvent.drop(dropTarget);
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: [file] },
    });
    fireEvent(dropTarget, dropEvent);
    const img = await screen.findByRole("img");
    expect(img).toBeInTheDocument();
    // drop zone should be hidden after drop
    expect(screen.queryByText("input.dropZone")).not.toBeInTheDocument();
  });

  it("pasting an image file into textarea adds it as attachment", async () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByRole("textbox");

    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,PASTE";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    const file = new File(["x"], "paste.png", { type: "image/png" });
    const pasteEvent = createEvent.paste(textarea);
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ type: "image/png", getAsFile: () => file }],
      },
    });
    fireEvent(textarea, pasteEvent);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,PASTE");
  });

  it("pasting non-image content does not add attachments", () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ type: "text/plain", getAsFile: () => null }],
      },
    });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("paste with no clipboardData items is a no-op", () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    // jsdom represents missing items as undefined
    fireEvent.paste(textarea, { clipboardData: {} });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("clicking send with text and attached image calls onSend with both", async () => {
    const onSend = vi.fn();
    const { container } = render(<ChatInput {...defaultProps} onSend={onSend} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    const file = new File(["x"], "pic.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByRole("img");

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "caption" } });
    fireEvent.click(screen.getByRole("button", { name: "input.send" }));

    expect(onSend).toHaveBeenCalledWith(
      "caption",
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          filename: "pic.png",
          mediaType: "image/png",
          url: "data:image/png;base64,AAA",
        }),
      ])
    );
  });

  it("file input with no files selected is a no-op", () => {
    const { container } = render(<ChatInput {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: null } });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("aria-labels use translated strings", () => {
    const { rerender } = render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole("button", { name: "input.send" })).toHaveAttribute("aria-label", "input.send");
    expect(screen.getByRole("button", { name: "input.attach" })).toHaveAttribute("aria-label", "input.attach");

    rerender(<ChatInput {...defaultProps} isStreaming={true} />);
    expect(screen.getByRole("button", { name: "input.stop" })).toHaveAttribute("aria-label", "input.stop");
  });
});
