import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import type { Editor } from "@tiptap/react";
import { JournalToolbar } from "@/components/journal/journal-toolbar";

expect.extend(matchers);

// Mock next-intl: echo the translation key so queries can match by key.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Helper to build a chainable command mock where every method returns `this`.
// The terminal `run` call records what was invoked.
interface MockChain {
  focus: () => MockChain;
  toggleBold: () => MockChain;
  toggleItalic: () => MockChain;
  toggleStrike: () => MockChain;
  toggleHeading: (opts: { level: number }) => MockChain;
  toggleBulletList: () => MockChain;
  toggleOrderedList: () => MockChain;
  toggleTaskList: () => MockChain;
  toggleBlockquote: () => MockChain;
  toggleCodeBlock: () => MockChain;
  toggleLink: (opts: { href: string }) => MockChain;
  unsetLink: () => MockChain;
  setHorizontalRule: () => MockChain;
  run: () => boolean;
}

type ChainCall = { method: string; args: unknown[] };

function createEditorMock(activeMap: Record<string, boolean> = {}) {
  const calls: ChainCall[] = [];
  const chain: MockChain = new Proxy({} as MockChain, {
    get: (_target, prop: string) => {
      if (prop === "run") {
        return vi.fn(() => {
          calls.push({ method: "run", args: [] });
          return true;
        });
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return chain;
      };
    },
  });

  const isActive = vi.fn(
    (name: string, attrs?: Record<string, unknown>) => {
      if (attrs) {
        const key = `${name}:${JSON.stringify(attrs)}`;
        return !!activeMap[key];
      }
      return !!activeMap[name];
    }
  );

  const editor = {
    chain: vi.fn(() => chain),
    isActive,
  } as unknown as Editor;

  return { editor, calls, isActive };
}

// Accessible-name helpers — mock echoes translation keys, so aria-label
// ends up as the bare key (e.g. "bold", "italic"). Using exact-name regex
// avoids substring matches (e.g. "link" also appears in "bulletList").
const btn = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}$`) });

describe("JournalToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all toolbar toggle buttons", () => {
    const { editor } = createEditorMock();
    const { container } = render(<JournalToolbar editor={editor} />);

    // Sanity: component returned non-null content
    expect(container.firstChild).not.toBeNull();

    // There are 12 Toggle buttons in the toolbar
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(12);
  });

  it("fires toggleBold() when the bold toggle is clicked", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("bold"));

    expect(editor.chain).toHaveBeenCalled();
    expect(calls.some((c) => c.method === "toggleBold")).toBe(true);
  });

  it("fires toggleItalic() when the italic toggle is clicked", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("italic"));

    expect(calls.some((c) => c.method === "toggleItalic")).toBe(true);
  });

  it("fires toggleStrike() when the strikethrough toggle is clicked", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("strike"));

    expect(calls.some((c) => c.method === "toggleStrike")).toBe(true);
  });

  it("fires toggleHeading(level:2) for H2 button", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("heading2"));

    const call = calls.find((c) => c.method === "toggleHeading");
    expect(call).toBeDefined();
    expect(call!.args).toEqual([{ level: 2 }]);
  });

  it("fires toggleHeading(level:3) for H3 button", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("heading3"));

    const call = calls.find((c) => c.method === "toggleHeading");
    expect(call).toBeDefined();
    expect(call!.args).toEqual([{ level: 3 }]);
  });

  it("fires toggleBulletList() for bullet list toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("bulletList"));

    expect(calls.some((c) => c.method === "toggleBulletList")).toBe(true);
  });

  it("fires toggleOrderedList() for ordered list toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("orderedList"));

    expect(calls.some((c) => c.method === "toggleOrderedList")).toBe(true);
  });

  it("fires toggleTaskList() for task list toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("taskList"));

    expect(calls.some((c) => c.method === "toggleTaskList")).toBe(true);
  });

  it("fires toggleBlockquote() for blockquote toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("blockquote"));

    expect(calls.some((c) => c.method === "toggleBlockquote")).toBe(true);
  });

  it("fires toggleCodeBlock() for code block toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("codeBlock"));

    expect(calls.some((c) => c.method === "toggleCodeBlock")).toBe(true);
  });

  it("fires setHorizontalRule() for horizontal-rule toggle", () => {
    const { editor, calls } = createEditorMock();
    render(<JournalToolbar editor={editor} />);

    fireEvent.click(btn("horizontalRule"));

    expect(calls.some((c) => c.method === "setHorizontalRule")).toBe(true);
  });

  describe("link button", () => {
    it("prompts for URL and calls toggleLink with href when user enters one", () => {
      const promptSpy = vi
        .spyOn(window, "prompt")
        .mockReturnValue("https://example.com");
      const { editor, calls } = createEditorMock();
      render(<JournalToolbar editor={editor} />);

      fireEvent.click(btn("link"));

      expect(promptSpy).toHaveBeenCalledWith("URL:");
      const call = calls.find((c) => c.method === "toggleLink");
      expect(call).toBeDefined();
      expect(call!.args).toEqual([{ href: "https://example.com" }]);
      promptSpy.mockRestore();
    });

    it("calls unsetLink when user submits an empty string", () => {
      const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("");
      const { editor, calls } = createEditorMock();
      render(<JournalToolbar editor={editor} />);

      fireEvent.click(btn("link"));

      expect(calls.some((c) => c.method === "unsetLink")).toBe(true);
      expect(calls.some((c) => c.method === "toggleLink")).toBe(false);
      promptSpy.mockRestore();
    });

    it("does nothing when user cancels the prompt (returns null)", () => {
      const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
      const { editor, calls } = createEditorMock();
      render(<JournalToolbar editor={editor} />);

      fireEvent.click(btn("link"));

      expect(promptSpy).toHaveBeenCalled();
      expect(calls).toEqual([]);
      promptSpy.mockRestore();
    });
  });

  describe("active state reflection", () => {
    it("bold button reports pressed=true when editor.isActive('bold') is true", () => {
      const { editor } = createEditorMock({ bold: true });
      render(<JournalToolbar editor={editor} />);

      const boldBtn = btn("bold");
      expect(boldBtn).toHaveAttribute("data-state", "on");
      expect(boldBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("italic button reports pressed=false when editor.isActive('italic') is false", () => {
      const { editor } = createEditorMock({ bold: true });
      render(<JournalToolbar editor={editor} />);

      const italicBtn = btn("italic");
      expect(italicBtn).toHaveAttribute("data-state", "off");
      expect(italicBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("H2 button reports pressed=true when heading level 2 is active", () => {
      const { editor, isActive } = createEditorMock({
        'heading:{"level":2}': true,
      });
      render(<JournalToolbar editor={editor} />);

      const h2Btn = btn("heading2");
      expect(h2Btn).toHaveAttribute("data-state", "on");
      expect(isActive).toHaveBeenCalledWith("heading", { level: 2 });
    });

    it("horizontal rule button is never pressed", () => {
      const { editor } = createEditorMock();
      render(<JournalToolbar editor={editor} />);

      const hrBtn = btn("horizontalRule");
      expect(hrBtn).toHaveAttribute("data-state", "off");
    });

    it("queries isActive for each formatting mark", () => {
      const { editor, isActive } = createEditorMock();
      render(<JournalToolbar editor={editor} />);

      const queried = isActive.mock.calls.map((c) => c[0]);
      expect(queried).toEqual(
        expect.arrayContaining([
          "bold",
          "italic",
          "strike",
          "heading",
          "bulletList",
          "orderedList",
          "taskList",
          "blockquote",
          "codeBlock",
          "link",
        ])
      );
    });
  });

  it("has no accessibility violations", async () => {
    const { editor } = createEditorMock();
    const { container } = render(<JournalToolbar editor={editor} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
