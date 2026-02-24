import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JournalWidget } from "@/components/journal/journal-widget";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockUseJournalWidget = vi.fn();
vi.mock("@/lib/hooks/use-journal-widget", () => ({
  useJournalWidget: () => mockUseJournalWidget(),
}));

const makeTiptapContent = (text: string) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ],
});

describe("JournalWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when data is loading", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [],
      isLoading: true,
      error: null,
    });

    render(<JournalWidget />);
    expect(screen.getByTestId("journal-widget-loading")).toBeInTheDocument();
  });

  it("shows no-entry state when entry is null", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    const widget = screen.getByTestId("journal-widget");
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveTextContent("prompt");
    expect(screen.getByTestId("journal-start-writing")).toBeInTheDocument();
  });

  it("shows entry-exists state with mood and preview text when entry exists", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: {
        id: "entry-1",
        mood: 4,
        title: "Good day",
        content: makeTiptapContent("Today was productive and fun."),
        word_count: 6,
      },
      streak: 3,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    const widget = screen.getByTestId("journal-widget");
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveTextContent("Today was productive and fun.");
    expect(screen.getByTestId("journal-view-entry")).toBeInTheDocument();
  });

  it("shows streak badge when streak > 0", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 5,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    expect(screen.getByTestId("journal-streak-badge")).toBeInTheDocument();
  });

  it("shows On This Day section", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [
        {
          id: "e1",
          entry_date: "2025-01-24",
          mood: 5,
          title: "Old entry",
          content: makeTiptapContent("A past reflection"),
          period: "30_days_ago",
        },
      ],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    expect(screen.getByTestId("on-this-day")).toBeInTheDocument();
    expect(screen.getByTestId("journal-widget")).toHaveTextContent(
      "A past reflection",
    );
  });

  it("shows empty On This Day state when no reflections exist", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    expect(screen.getByTestId("on-this-day-empty")).toBeInTheDocument();
  });

  it("navigates to /journal when Start writing is clicked", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    fireEvent.click(screen.getByTestId("journal-start-writing"));
    expect(mockPush).toHaveBeenCalledWith("/journal");
  });

  it("navigates to /journal when View entry is clicked", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: {
        id: "entry-1",
        mood: 3,
        title: "Test",
        content: makeTiptapContent("My entry"),
        word_count: 2,
      },
      streak: 1,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    fireEvent.click(screen.getByTestId("journal-view-entry"));
    expect(mockPush).toHaveBeenCalledWith("/journal");
  });

  it("renders mood emojis as visual cue in no-entry state", () => {
    mockUseJournalWidget.mockReturnValue({
      entry: null,
      streak: 0,
      onThisDay: [],
      isLoading: false,
      error: null,
    });

    render(<JournalWidget />);
    const widget = screen.getByTestId("journal-widget");
    // Check for mood emojis (5 total)
    expect(widget.textContent).toContain("\uD83E\uDD29"); // amazing
    expect(widget.textContent).toContain("\uD83D\uDE0A"); // good
    expect(widget.textContent).toContain("\uD83D\uDE42"); // okay
  });
});
