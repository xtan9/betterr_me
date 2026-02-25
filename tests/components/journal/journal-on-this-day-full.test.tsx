import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalOnThisDayFull } from "@/components/journal/journal-on-this-day-full";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

const mockEntries = [
  {
    id: "e1",
    entry_date: "2025-01-24",
    mood: 5,
    title: "Amazing Day",
    content: makeTiptapContent("Had an incredible experience today."),
    word_count: 5,
    period: "30_days_ago",
  },
  {
    id: "e2",
    entry_date: "2024-11-24",
    mood: 3,
    title: "Regular Day",
    content: makeTiptapContent("Normal productive day."),
    word_count: 3,
    period: "90_days_ago",
  },
  {
    id: "e3",
    entry_date: "2024-02-24",
    mood: null,
    title: "Year Ago",
    content: makeTiptapContent("A year ago reflection."),
    word_count: 4,
    period: "1_year_ago",
  },
];

// Mock SWR to return entries or empty
const mockSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockSWR(...args),
}));

describe("JournalOnThisDayFull", () => {
  it("shows empty state when no entries", () => {
    mockSWR.mockReturnValue({
      data: { entries: [] },
      isLoading: false,
      error: null,
    });

    render(<JournalOnThisDayFull date="2026-02-24" />);
    expect(screen.getByTestId("on-this-day-full-empty")).toBeInTheDocument();
    expect(screen.getByTestId("on-this-day-full-empty")).toHaveTextContent("empty");
  });

  it("renders past entries with mood and period labels", () => {
    mockSWR.mockReturnValue({
      data: { entries: [mockEntries[0]] },
      isLoading: false,
      error: null,
    });

    render(<JournalOnThisDayFull date="2026-02-24" />);
    const container = screen.getByTestId("on-this-day-full");
    expect(container).toBeInTheDocument();
    expect(container).toHaveTextContent("title");
    expect(container).toHaveTextContent("30_days_ago");
    expect(container).toHaveTextContent("Had an incredible experience today.");
    expect(container).toHaveTextContent("Amazing Day");
  });

  it("shows multiple entries for different periods", () => {
    mockSWR.mockReturnValue({
      data: { entries: mockEntries },
      isLoading: false,
      error: null,
    });

    render(<JournalOnThisDayFull date="2026-02-24" />);
    const container = screen.getByTestId("on-this-day-full");
    expect(container).toHaveTextContent("30_days_ago");
    expect(container).toHaveTextContent("90_days_ago");
    expect(container).toHaveTextContent("1_year_ago");
    expect(container).toHaveTextContent("Had an incredible experience today.");
    expect(container).toHaveTextContent("Normal productive day.");
    expect(container).toHaveTextContent("A year ago reflection.");
  });

  it("returns null while loading", () => {
    mockSWR.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<JournalOnThisDayFull date="2026-02-24" />);
    expect(container.innerHTML).toBe("");
  });

  it("handles entry with null mood gracefully", () => {
    mockSWR.mockReturnValue({
      data: { entries: [mockEntries[2]] },
      isLoading: false,
      error: null,
    });

    render(<JournalOnThisDayFull date="2026-02-24" />);
    const container = screen.getByTestId("on-this-day-full");
    expect(container).toBeInTheDocument();
    expect(container).toHaveTextContent("A year ago reflection.");
  });
});
