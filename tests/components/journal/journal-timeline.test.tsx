import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock useJournalTimeline hook
const { mockUseJournalTimeline } = vi.hoisted(() => ({
  mockUseJournalTimeline: vi.fn(),
}));
vi.mock("@/lib/hooks/use-journal-timeline", () => ({
  useJournalTimeline: (...args: unknown[]) => mockUseJournalTimeline(...args),
}));

// Mock MOODS export from journal-mood-selector
vi.mock("@/components/journal/journal-mood-selector", () => ({
  MOODS: [
    { value: 5, emoji: "star-struck", label: "amazing" },
    { value: 4, emoji: "smiling", label: "good" },
    { value: 3, emoji: "slightly-smiling", label: "okay" },
    { value: 2, emoji: "confused", label: "notGreat" },
    { value: 1, emoji: "weary", label: "awful" },
  ],
}));

// Mock JournalTimelineCard
vi.mock("@/components/journal/journal-timeline-card", () => ({
  JournalTimelineCard: ({ entry, onClick }: any) =>
    React.createElement(
      "div",
      {
        "data-testid": `timeline-card-${entry.entry_date}`,
        onClick,
        role: "button",
      },
      [
        React.createElement(
          "span",
          { key: "date", "data-testid": "card-date" },
          entry.entry_date
        ),
        React.createElement(
          "span",
          { key: "title", "data-testid": "card-title" },
          entry.title || "Untitled"
        ),
      ]
    ),
}));

// Mock getPreviewText
vi.mock("@/lib/journal/utils", () => ({
  getPreviewText: () => "Preview text...",
}));

import { JournalTimeline } from "@/components/journal/journal-timeline";

describe("JournalTimeline", () => {
  const mockMutate = vi.fn();
  const mockOnEntryClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseJournalTimeline.mockReturnValue({
      entries: [],
      hasMore: false,
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });
  });

  it("renders empty state message when no entries exist", () => {
    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    expect(screen.getByText("noEntries")).toBeInTheDocument();
  });

  it("renders timeline cards when entries exist", () => {
    mockUseJournalTimeline.mockReturnValue({
      entries: [
        {
          id: "e1",
          entry_date: "2026-02-20",
          mood: 4,
          title: "Good day",
          content: { type: "doc" },
          word_count: 50,
        },
        {
          id: "e2",
          entry_date: "2026-02-19",
          mood: 3,
          title: "Okay day",
          content: { type: "doc" },
          word_count: 30,
        },
      ],
      hasMore: false,
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    expect(screen.getByTestId("timeline-card-2026-02-20")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-card-2026-02-19")).toBeInTheDocument();
    expect(screen.getByText("2026-02-20")).toBeInTheDocument();
    expect(screen.getByText("Good day")).toBeInTheDocument();
  });

  it("shows Load More button when hasMore is true", () => {
    mockUseJournalTimeline.mockReturnValue({
      entries: [
        {
          id: "e1",
          entry_date: "2026-02-20",
          mood: 4,
          title: "Entry",
          content: { type: "doc" },
          word_count: 10,
        },
      ],
      hasMore: true,
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    expect(screen.getByText("loadMore")).toBeInTheDocument();
  });

  it("does not show Load More when hasMore is false", () => {
    mockUseJournalTimeline.mockReturnValue({
      entries: [
        {
          id: "e1",
          entry_date: "2026-02-20",
          mood: 4,
          title: "Entry",
          content: { type: "doc" },
          word_count: 10,
        },
      ],
      hasMore: false,
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    expect(screen.queryByText("loadMore")).not.toBeInTheDocument();
  });

  it("calls onEntryClick with entry date when a card is clicked", () => {
    mockUseJournalTimeline.mockReturnValue({
      entries: [
        {
          id: "e1",
          entry_date: "2026-02-20",
          mood: 4,
          title: "Click me",
          content: { type: "doc" },
          word_count: 10,
        },
      ],
      hasMore: false,
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    fireEvent.click(screen.getByTestId("timeline-card-2026-02-20"));

    expect(mockOnEntryClick).toHaveBeenCalledWith("2026-02-20");
  });

  it("shows loading spinner when isLoading is true", () => {
    mockUseJournalTimeline.mockReturnValue({
      entries: [],
      hasMore: false,
      error: null,
      isLoading: true,
      mutate: mockMutate,
    });

    render(<JournalTimeline onEntryClick={mockOnEntryClick} />);

    // Loading spinner should be visible (Loader2 with animate-spin)
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });
});
