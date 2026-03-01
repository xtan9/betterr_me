import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: any) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

// Mock the editor loader directly - avoids needing to mock Tiptap internals
vi.mock("@/components/journal/journal-editor-loader", () => ({
  JournalEditorLoader: ({ onUpdate }: any) =>
    React.createElement("div", {
      "data-testid": "tiptap-editor",
      onClick: () => onUpdate?.({ type: "doc", content: [{ type: "paragraph" }] }, 5),
    }),
}));

// Mock the editor skeleton
vi.mock("@/components/journal/journal-editor-skeleton", () => ({
  JournalEditorSkeleton: () =>
    React.createElement("div", { "data-testid": "editor-skeleton" }),
}));

// Mock prompt components to isolate modal logic
const { mockPromptSheetOnSelect } = vi.hoisted(() => ({
  mockPromptSheetOnSelect: vi.fn(),
}));
vi.mock("@/components/journal/prompt-browser-sheet", () => ({
  PromptBrowserSheet: ({ open, onSelect, selectedKey }: any) => {
    // Store onSelect so tests can call it
    mockPromptSheetOnSelect.mockImplementation(onSelect);
    return open
      ? React.createElement("div", {
          "data-testid": "prompt-browser-sheet",
          "data-selected-key": selectedKey ?? "",
        })
      : null;
  },
}));

vi.mock("@/components/journal/prompt-banner", () => ({
  PromptBanner: ({ promptKey, onDismiss }: any) =>
    React.createElement("div", {
      "data-testid": "prompt-banner",
      "data-prompt-key": promptKey,
      onClick: onDismiss,
    }),
}));

// Mock the hooks
const mockMutate = vi.fn();
const mockScheduleSave = vi.fn();
const mockFlushNow = vi.fn().mockResolvedValue(null);

const { mockUseJournalEntry, mockUseJournalAutosave } = vi.hoisted(() => ({
  mockUseJournalEntry: vi.fn(),
  mockUseJournalAutosave: vi.fn(),
}));

vi.mock("@/lib/hooks/use-journal-entry", () => ({
  useJournalEntry: (...args: any[]) => mockUseJournalEntry(...args),
}));

vi.mock("@/lib/hooks/use-journal-autosave", () => ({
  useJournalAutosave: (...args: any[]) => mockUseJournalAutosave(...args),
}));

// Mock sonner
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { JournalEntryModal } from "@/components/journal/journal-entry-modal";

describe("JournalEntryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseJournalAutosave.mockReturnValue({
      saveStatus: "idle",
      scheduleSave: mockScheduleSave,
      flushNow: mockFlushNow,
      savedEntryId: null,
    });
  });

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    date: "2026-02-23",
  };

  it("renders dialog with New Entry title when no existing entry", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByText("journal.newEntry")).toBeInTheDocument();
  });

  it("renders dialog with Edit Entry title when entry exists", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: {
        id: "entry-1",
        content: { type: "doc" },
        mood: 4,
        word_count: 10,
      },
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByText("journal.editEntry")).toBeInTheDocument();
  });

  it("shows mood selector", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("shows editor area", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading is true", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: true,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByTestId("editor-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("tiptap-editor")).not.toBeInTheDocument();
  });

  it("shows delete button only when entry exists", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: {
        id: "entry-1",
        content: { type: "doc" },
        mood: 3,
        word_count: 5,
      },
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.getByText("journal.delete")).toBeInTheDocument();
  });

  it("does NOT show delete button for new entries", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(screen.queryByText("journal.delete")).not.toBeInTheDocument();
  });

  it("delete button opens confirmation dialog", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: {
        id: "entry-1",
        content: { type: "doc" },
        mood: 3,
        word_count: 5,
      },
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    const deleteButton = screen.getByText("journal.delete");
    fireEvent.click(deleteButton);

    expect(
      screen.getByText("journal.deleteConfirm.title")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.deleteConfirm.description")
    ).toBeInTheDocument();
  });

  it("confirming delete calls fetch DELETE and closes modal", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    mockMutate.mockResolvedValue(undefined);

    const onOpenChange = vi.fn();
    mockUseJournalEntry.mockReturnValue({
      entry: {
        id: "entry-1",
        content: { type: "doc" },
        mood: 3,
        word_count: 5,
      },
      isLoading: false,
      mutate: mockMutate,
    });

    render(
      <JournalEntryModal {...defaultProps} onOpenChange={onOpenChange} />
    );

    // Open delete dialog
    const deleteButton = screen.getByText("journal.delete");
    fireEvent.click(deleteButton);

    // Find and click the confirm action button in the dialog
    const confirmButtons = screen.getAllByText("journal.delete");
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/journal/entry-1", {
        method: "DELETE",
      });
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("closing modal calls flushNow to save pending changes", async () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    const onOpenChange = vi.fn();
    render(
      <JournalEntryModal {...defaultProps} onOpenChange={onOpenChange} />
    );

    // Find and click the close button (X) -- it has sr-only "Close" text
    const closeButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mockFlushNow).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("closing modal still calls onOpenChange when flushNow rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFlushNow.mockRejectedValueOnce(new Error("save failed"));
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    const onOpenChange = vi.fn();
    render(
      <JournalEntryModal {...defaultProps} onOpenChange={onOpenChange} />
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockToastError).toHaveBeenCalledWith("journal.saveError");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to flush journal changes on close",
        expect.any(Error)
      );
    });
    consoleErrorSpy.mockRestore();
  });

  it("shows word count in footer", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    expect(
      screen.getByText('journal.wordCount:{"count":0}')
    ).toBeInTheDocument();
  });

  it("displays formatted date", () => {
    mockUseJournalEntry.mockReturnValue({
      entry: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalEntryModal {...defaultProps} />);

    // The date "2026-02-23" should be formatted as readable date
    expect(screen.getByText(/February/)).toBeInTheDocument();
  });

  // Prompt integration tests
  describe("prompt integration", () => {
    it("renders 'Need inspiration?' trigger button", () => {
      mockUseJournalEntry.mockReturnValue({
        entry: null,
        isLoading: false,
        mutate: mockMutate,
      });

      render(<JournalEntryModal {...defaultProps} />);

      expect(
        screen.getByText("journal.prompts.trigger")
      ).toBeInTheDocument();
    });

    it("trigger button opens prompt sheet", () => {
      mockUseJournalEntry.mockReturnValue({
        entry: null,
        isLoading: false,
        mutate: mockMutate,
      });

      render(<JournalEntryModal {...defaultProps} />);

      // Sheet should not be visible initially
      expect(
        screen.queryByTestId("prompt-browser-sheet")
      ).not.toBeInTheDocument();

      // Click trigger button
      fireEvent.click(screen.getByText("journal.prompts.trigger"));

      // Sheet should now be visible
      expect(
        screen.getByTestId("prompt-browser-sheet")
      ).toBeInTheDocument();
    });

    it("when entry has prompt_key, prompt banner is rendered", async () => {
      // Start with no entry, then simulate entry loading
      const entryWithPrompt = {
        id: "entry-1",
        content: { type: "doc" },
        mood: 3,
        word_count: 5,
        prompt_key: "gratitude-01",
      };

      // First render without entry (simulates loading)
      mockUseJournalEntry.mockReturnValue({
        entry: null,
        isLoading: true,
        mutate: mockMutate,
      });

      const { rerender } = render(<JournalEntryModal {...defaultProps} />);

      // Then rerender with entry data (simulates entry loaded)
      mockUseJournalEntry.mockReturnValue({
        entry: entryWithPrompt,
        isLoading: false,
        mutate: mockMutate,
      });

      rerender(<JournalEntryModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("prompt-banner")).toBeInTheDocument();
      });

      const banner = screen.getByTestId("prompt-banner");
      expect(banner).toHaveAttribute("data-prompt-key", "gratitude-01");
    });

    it("when entry has no prompt_key, no prompt banner rendered", () => {
      mockUseJournalEntry.mockReturnValue({
        entry: {
          id: "entry-1",
          content: { type: "doc" },
          mood: 3,
          word_count: 5,
        },
        isLoading: false,
        mutate: mockMutate,
      });

      render(<JournalEntryModal {...defaultProps} />);

      expect(
        screen.queryByTestId("prompt-banner")
      ).not.toBeInTheDocument();
    });

    it("no prompt banner for new entries", () => {
      mockUseJournalEntry.mockReturnValue({
        entry: null,
        isLoading: false,
        mutate: mockMutate,
      });

      render(<JournalEntryModal {...defaultProps} />);

      expect(
        screen.queryByTestId("prompt-banner")
      ).not.toBeInTheDocument();
    });
  });
});
