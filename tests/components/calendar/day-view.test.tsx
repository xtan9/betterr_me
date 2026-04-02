import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayView } from "@/components/calendar/day-view";
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

describe("DayView", () => {
  const emptyEvents = new Map<string, ExpandedCalendarEvent[]>();
  const today = "2026-04-01";
  const currentDate = new Date(2026, 3, 1); // Wednesday

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders single day column header", () => {
    const { container } = render(
      <DayView currentDate={currentDate} events={emptyEvents} today={today} />,
    );
    // Header grid has time gutter spacer + 1 day column = 2 children
    const headerGrid = container.querySelector(".grid.border-b");
    expect(headerGrid).not.toBeNull();
    expect(headerGrid!.children.length).toBe(2);
  });

  it("header shows full weekday name", () => {
    render(
      <DayView currentDate={currentDate} events={emptyEvents} today={today} />,
    );
    // April 1, 2026 is Wednesday — Intl.DateTimeFormat with weekday: "long"
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
  });

  it("today's date number has primary styling", () => {
    render(
      <DayView currentDate={currentDate} events={emptyEvents} today={today} />,
    );
    // Date number "1" should have bg-primary
    const dateNumbers = screen.getAllByText("1");
    const todayNumber = dateNumbers.find((el) =>
      el.className.includes("bg-primary"),
    );
    expect(todayNumber).toBeDefined();
  });

  it("non-today date number does not have primary styling", () => {
    const tomorrow = new Date(2026, 3, 2);
    render(
      <DayView currentDate={tomorrow} events={emptyEvents} today={today} />,
    );
    const dateNumber = screen.getByText("2");
    expect(dateNumber.className).not.toContain("bg-primary");
  });

  it("renders TimeGrid component", () => {
    render(
      <DayView currentDate={currentDate} events={emptyEvents} today={today} />,
    );
    // TimeGrid renders hour labels
    expect(screen.getByText("1 AM")).toBeInTheDocument();
    expect(screen.getByText("12 PM")).toBeInTheDocument();
  });
});
