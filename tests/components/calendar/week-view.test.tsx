import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekView } from "@/components/calendar/week-view";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.count !== undefined) return `+${params.count} more`;
    return key;
  },
  useLocale: () => "en",
}));

// Mock scrollTo
Element.prototype.scrollTo = vi.fn();

describe("WeekView", () => {
  const emptyEvents = new Map<string, ExpandedCalendarEvent[]>();
  const today = "2026-04-01";
  // April 1, 2026 is a Wednesday
  const currentDate = new Date(2026, 3, 1);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 7 day column headers", () => {
    const { container } = render(
      <WeekView
        currentDate={currentDate}
        weekStartDay={0}
        events={emptyEvents}
        today={today}
      />,
    );
    // The header grid has time gutter spacer + 7 day columns
    const headerGrid = container.querySelector(".grid.border-b");
    expect(headerGrid).not.toBeNull();
    // 1 spacer + 7 day columns = 8 children
    expect(headerGrid!.children.length).toBe(8);
  });

  it("column headers show abbreviated day names", () => {
    render(
      <WeekView
        currentDate={currentDate}
        weekStartDay={0}
        events={emptyEvents}
        today={today}
      />,
    );
    // With Sunday start and April 1 (Wed): week is Mar 29 (Sun) to Apr 4 (Sat)
    // Intl.DateTimeFormat with weekday: "short" in en locale
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("today's date number has primary styling", () => {
    render(
      <WeekView
        currentDate={currentDate}
        weekStartDay={0}
        events={emptyEvents}
        today={today}
      />,
    );
    // April 1 is today — should have bg-primary
    // The "1" text for April 1 should have primary styling
    const dateNumbers = screen.getAllByText("1");
    const todayNumber = dateNumbers.find((el) =>
      el.className.includes("bg-primary"),
    );
    expect(todayNumber).toBeDefined();
  });

  it("renders TimeGrid component", () => {
    const { container } = render(
      <WeekView
        currentDate={currentDate}
        weekStartDay={0}
        events={emptyEvents}
        today={today}
      />,
    );
    // TimeGrid renders hour labels like "1 AM"
    expect(screen.getByText("1 AM")).toBeInTheDocument();
  });

  it("passes correct 7 dates to TimeGrid", () => {
    const { container } = render(
      <WeekView
        currentDate={currentDate}
        weekStartDay={0}
        events={emptyEvents}
        today={today}
      />,
    );
    // The inner grid (TimeGrid) should have 8 children (1 time gutter + 7 day columns)
    const grids = container.querySelectorAll(".grid");
    const mainGrid = Array.from(grids).find(
      (g) => (g as HTMLElement).style.height === "1152px",
    );
    expect(mainGrid).not.toBeNull();
    expect(mainGrid!.children.length).toBe(8); // 1 gutter + 7 columns
  });
});
