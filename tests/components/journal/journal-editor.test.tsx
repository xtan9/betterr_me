import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

// Mock next-intl (journal-toolbar uses it)
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Capture useEditor options so we can invoke onUpdate
const { captured } = vi.hoisted(() => ({
  captured: { options: null as null | Record<string, unknown> },
}));

const { fakeEditor } = vi.hoisted(() => ({
  fakeEditor: {
    state: { doc: { textContent: "hello world" } },
    getJSON: () => ({ type: "doc", content: [] }),
    chain: () => {
      const proxy: Record<string, () => unknown> = {};
      const p = new Proxy(proxy, {
        get: () => () => p,
      });
      return p;
    },
    isActive: () => false,
    can: () => ({ chain: () => ({ focus: () => ({ toggleBold: () => ({ run: () => true }) }) }) }),
  },
}));

vi.mock("@tiptap/react", () => ({
  useEditor: (options: Record<string, unknown>) => {
    captured.options = options;
    return fakeEditor;
  },
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content" data-has-editor={editor ? "true" : "false"} />
  ),
}));

vi.mock("@tiptap/starter-kit", () => ({ default: { configure: (o: unknown) => ({ name: "starter", o }) } }));
vi.mock("@tiptap/extensions", () => ({
  CharacterCount: { name: "character-count" },
  Placeholder: { configure: (o: unknown) => ({ name: "placeholder", o }) },
}));
vi.mock("@tiptap/extension-list", () => ({
  TaskList: { name: "task-list" },
  TaskItem: { configure: (o: unknown) => ({ name: "task-item", o }) },
}));

// Simplify toolbar to isolate editor rendering
vi.mock("@/components/journal/journal-toolbar", () => ({
  JournalToolbar: ({ editor }: { editor: unknown }) => (
    <div
      role="toolbar"
      aria-label="journal toolbar"
      data-has-editor={editor ? "true" : "false"}
    />
  ),
}));

import { JournalEditor } from "@/components/journal/journal-editor";

describe("JournalEditor", () => {
  beforeEach(() => {
    captured.options = null;
  });

  it("renders toolbar and editor content when editor is ready", () => {
    const { container } = render(
      <JournalEditor content={null} onUpdate={vi.fn()} />
    );

    expect(screen.getByRole("toolbar", { name: "journal toolbar" })).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    // Prove non-null render
    expect(container.querySelector(".tiptap-journal")).toBeInTheDocument();
  });

  it("configures tiptap with the provided content and placeholder", () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    render(
      <JournalEditor content={content} onUpdate={vi.fn()} placeholder="Write…" />
    );

    expect(captured.options).not.toBeNull();
    expect(captured.options!.content).toBe(content);
    expect(captured.options!.immediatelyRender).toBe(false);
    expect(Array.isArray(captured.options!.extensions)).toBe(true);
  });

  it("defaults to undefined content when null and empty placeholder", () => {
    render(<JournalEditor content={null} onUpdate={vi.fn()} />);
    expect(captured.options!.content).toBeUndefined();
  });

  it("invokes onUpdate with JSON and word count from the editor", () => {
    const onUpdate = vi.fn();
    render(<JournalEditor content={null} onUpdate={onUpdate} />);

    const updateFn = captured.options!.onUpdate as (arg: {
      editor: typeof fakeEditor;
    }) => void;

    act(() => {
      updateFn({ editor: fakeEditor });
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [json, wordCount] = onUpdate.mock.calls[0];
    expect(json).toEqual({ type: "doc", content: [] });
    // "hello world" → 2 words
    expect(wordCount).toBe(2);
  });

  it("uses latest onUpdate via ref when prop changes between renders", () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <JournalEditor content={null} onUpdate={first} />
    );
    rerender(<JournalEditor content={null} onUpdate={second} />);

    const updateFn = captured.options!.onUpdate as (arg: {
      editor: typeof fakeEditor;
    }) => void;

    act(() => {
      updateFn({ editor: fakeEditor });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports 0 words for empty document text", () => {
    const onUpdate = vi.fn();
    render(<JournalEditor content={null} onUpdate={onUpdate} />);

    const emptyEditor = { ...fakeEditor, state: { doc: { textContent: "" } } };
    const updateFn = captured.options!.onUpdate as (arg: {
      editor: typeof emptyEditor;
    }) => void;

    act(() => {
      updateFn({ editor: emptyEditor });
    });

    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), 0);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <JournalEditor content={null} onUpdate={vi.fn()} placeholder="Write…" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("JournalEditor when useEditor returns null", () => {
  it("returns null before editor is initialised", async () => {
    vi.resetModules();
    vi.doMock("@tiptap/react", () => ({
      useEditor: () => null,
      EditorContent: () => <div data-testid="editor-content" />,
    }));
    vi.doMock("next-intl", () => ({
      useTranslations: () => (key: string) => key,
    }));
    vi.doMock("@/components/journal/journal-toolbar", () => ({
      JournalToolbar: () => <div role="toolbar" />,
    }));

    const { JournalEditor: LocalEditor } = await import(
      "@/components/journal/journal-editor"
    );
    const { container } = render(
      <LocalEditor content={null} onUpdate={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
