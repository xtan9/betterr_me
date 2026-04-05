import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventChip } from "@/components/calendar/event-chip";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

function makeEvent(
  overrides: Partial<CalendarEvent> & { is_virtual?: boolean } = {},
): ExpandedCalendarEvent {
  return {
    id: "e1",
    user_id: "u1",
    title: "Test Event",
    description: null,
    start_date: "2026-04-01",
    start_time: "10:00:00",
    end_date: "2026-04-01",
    end_time: "11:00:00",
    location: null,
    color: null,
    category_id: null,
    is_recurring: false,
    recurrence_rule: null,
    end_type: null,
    end_date_recurrence: null,
    end_count: null,
    recurring_event_id: null,
    original_date: null,
    is_exception: false,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    is_virtual: false,
    ...overrides,
  };
}

describe("EventChip", () => {
  it("renders event title", () => {
    render(<EventChip event={makeEvent()} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
  });

  it("renders time when start_time is set", () => {
    render(<EventChip event={makeEvent({ start_time: "14:30:00" })} />);
    expect(screen.getByText("14:30")).toBeInTheDocument();
  });

  it("uses default teal color when no domain or custom color", () => {
    render(<EventChip event={makeEvent()} />);
    const chip = screen.getByTitle("Test Event");
    expect(chip.className).toContain("calendar-event");
  });

  it("uses domain color when _domain is set", () => {
    const event = {
      ...makeEvent(),
      _domain: "tasks",
      _completed: false,
    } as unknown as ExpandedCalendarEvent;

    render(<EventChip event={event} />);
    const chip = screen.getByTitle("Test Event");
    // Domain color uses inline styles, not the default CSS class
    expect(chip.className).not.toContain("bg-[hsl(var(--calendar-event-muted))]");
    expect(chip.style.backgroundColor).toContain("hsl(var(--calendar-task-muted))");
    expect(chip.style.borderLeftColor).toContain("hsl(var(--calendar-task))");
  });

  it("shows line-through when _completed is true", () => {
    const event = {
      ...makeEvent(),
      _domain: "tasks",
      _completed: true,
    } as unknown as ExpandedCalendarEvent;

    render(<EventChip event={event} />);
    const chip = screen.getByTitle("Test Event");
    expect(chip.className).toContain("line-through");
    expect(chip.className).toContain("opacity-60");
  });

  it("does not show time for all-day events (start_time is null)", () => {
    render(<EventChip event={makeEvent({ start_time: null })} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    // No time element should be rendered
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});
