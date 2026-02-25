import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalOnThisDay } from "@/components/journal/journal-on-this-day";

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

describe("JournalOnThisDay", () => {
  it("shows empty state message when entries is empty", () => {
    render(<JournalOnThisDay entries={[]} />);
    const empty = screen.getByTestId("on-this-day-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent("empty");
  });

  it("shows entry preview with mood emoji and period label", () => {
    render(
      <JournalOnThisDay
        entries={[
          {
            id: "e1",
            entry_date: "2025-01-24",
            mood: 4,
            title: "A good day",
            content: makeTiptapContent("Had a great morning walk."),
            period: "30_days_ago",
          },
        ]}
      />,
    );

    const container = screen.getByTestId("on-this-day");
    expect(container).toBeInTheDocument();
    // Title should show
    expect(container).toHaveTextContent("title");
    // Period label should be present (translated key)
    expect(container).toHaveTextContent("30_days_ago");
    // Content preview should show
    expect(container).toHaveTextContent("Had a great morning walk.");
  });

  it("shows multiple entries with different periods", () => {
    render(
      <JournalOnThisDay
        entries={[
          {
            id: "e1",
            entry_date: "2025-01-24",
            mood: 5,
            title: "Amazing",
            content: makeTiptapContent("Incredible day"),
            period: "30_days_ago",
          },
          {
            id: "e2",
            entry_date: "2024-11-24",
            mood: 3,
            title: "Okay day",
            content: makeTiptapContent("Regular day"),
            period: "90_days_ago",
          },
          {
            id: "e3",
            entry_date: "2024-02-24",
            mood: 2,
            title: "Tough",
            content: makeTiptapContent("Challenging time"),
            period: "1_year_ago",
          },
        ]}
      />,
    );

    const container = screen.getByTestId("on-this-day");
    expect(container).toHaveTextContent("30_days_ago");
    expect(container).toHaveTextContent("90_days_ago");
    expect(container).toHaveTextContent("1_year_ago");
    expect(container).toHaveTextContent("Incredible day");
    expect(container).toHaveTextContent("Regular day");
    expect(container).toHaveTextContent("Challenging time");
  });

  it("handles entries with null mood gracefully", () => {
    render(
      <JournalOnThisDay
        entries={[
          {
            id: "e1",
            entry_date: "2025-01-24",
            mood: null,
            title: "No mood",
            content: makeTiptapContent("Entry without mood"),
            period: "30_days_ago",
          },
        ]}
      />,
    );

    const container = screen.getByTestId("on-this-day");
    expect(container).toBeInTheDocument();
    expect(container).toHaveTextContent("Entry without mood");
  });
});
