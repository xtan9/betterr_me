import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock react-day-picker to avoid DayPickerProvider requirement
vi.mock("react-day-picker", () => ({
  DayContent: ({ date }: { date: Date }) =>
    React.createElement("span", null, date.getDate()),
}));

// Mock getLocalDateString
const { mockGetLocalDateString } = vi.hoisted(() => ({
  mockGetLocalDateString: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  getLocalDateString: (date?: Date) => mockGetLocalDateString(date),
}));

// Mock useJournalCalendar hook
const { mockUseJournalCalendar } = vi.hoisted(() => ({
  mockUseJournalCalendar: vi.fn(),
}));
vi.mock("@/lib/hooks/use-journal-calendar", () => ({
  useJournalCalendar: (...args: unknown[]) => mockUseJournalCalendar(...args),
}));

// Mock Calendar UI component to render a simplified version
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onDayClick, components, month }: any) => {
    const DayContentComponent = components?.DayContent;
    const testDate = new Date(2026, 1, 15); // Feb 15 2026
    return React.createElement("div", { "data-testid": "calendar-mock" }, [
      React.createElement(
        "button",
        {
          key: "day-15",
          "data-testid": "calendar-day-15",
          onClick: () => onDayClick?.(testDate),
        },
        DayContentComponent
          ? React.createElement(DayContentComponent, {
              date: testDate,
              displayMonth: month || new Date(),
            })
          : "15"
      ),
      React.createElement(
        "button",
        {
          key: "day-20",
          "data-testid": "calendar-day-20",
          onClick: () => onDayClick?.(new Date(2026, 1, 20)),
        },
        "20"
      ),
    ]);
  },
}));

// Mock JournalMoodDot
vi.mock("@/components/journal/journal-mood-dot", () => ({
  JournalMoodDot: ({ mood, className }: any) =>
    React.createElement("div", {
      "data-testid": "mood-dot",
      "data-mood": mood,
      className,
    }),
}));

import { JournalCalendar } from "@/components/journal/journal-calendar";

describe("JournalCalendar", () => {
  const mockMutate = vi.fn();
  const mockOnDayClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalDateString.mockImplementation(
      (date?: Date) => {
        const d = date || new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    );
    mockUseJournalCalendar.mockReturnValue({
      entries: [],
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });
  });

  it("renders without crashing when entries are empty", () => {
    render(<JournalCalendar onDayClick={mockOnDayClick} />);

    expect(screen.getByTestId("calendar-mock")).toBeInTheDocument();
  });

  it("calls useJournalCalendar with current year and month", () => {
    const now = new Date();
    render(<JournalCalendar onDayClick={mockOnDayClick} />);

    expect(mockUseJournalCalendar).toHaveBeenCalledWith(
      now.getFullYear(),
      now.getMonth() + 1
    );
  });

  it("calls onDayClick with YYYY-MM-DD string when a day is clicked", () => {
    render(<JournalCalendar onDayClick={mockOnDayClick} />);

    fireEvent.click(screen.getByTestId("calendar-day-15"));

    expect(mockOnDayClick).toHaveBeenCalledWith("2026-02-15");
  });

  it("renders mood dots for days with entries", () => {
    mockUseJournalCalendar.mockReturnValue({
      entries: [
        { entry_date: "2026-02-15", mood: 4, title: "Good day" },
      ],
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalCalendar onDayClick={mockOnDayClick} />);

    const moodDot = screen.getByTestId("mood-dot");
    expect(moodDot).toBeInTheDocument();
    expect(moodDot).toHaveAttribute("data-mood", "4");
  });

  it("handles month with no entries (no dots rendered)", () => {
    mockUseJournalCalendar.mockReturnValue({
      entries: [],
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });

    render(<JournalCalendar onDayClick={mockOnDayClick} />);

    expect(screen.queryByTestId("mood-dot")).not.toBeInTheDocument();
  });

  it("triggers mutate when refreshKey changes", () => {
    const { rerender } = render(
      <JournalCalendar onDayClick={mockOnDayClick} refreshKey={0} />
    );

    expect(mockMutate).not.toHaveBeenCalled();

    rerender(
      <JournalCalendar onDayClick={mockOnDayClick} refreshKey={1} />
    );

    expect(mockMutate).toHaveBeenCalled();
  });
});
