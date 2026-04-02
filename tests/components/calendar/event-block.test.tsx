import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventBlock } from "@/components/calendar/event-block";
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

describe("EventBlock", () => {
  const defaultProps = {
    event: makeEvent(),
    top: 100,
    height: 48,
    left: "0%",
    width: "100%",
  };

  it("renders event title", () => {
    render(<EventBlock {...defaultProps} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
  });

  it("renders time range for events with start_time and end_time", () => {
    render(<EventBlock {...defaultProps} />);
    // formatTimeRange produces "10:00 – 11:00" (en-dash U+2013)
    expect(screen.getByText(/10:00.*11:00/)).toBeInTheDocument();
  });

  it("positions at correct top/height from props", () => {
    render(<EventBlock {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button.style.top).toBe("100px");
    expect(button.style.height).toBe("48px");
  });

  it("uses default teal color when event.color is null", () => {
    render(<EventBlock {...defaultProps} />);
    const button = screen.getByRole("button");
    // Default color uses CSS class with calendar-event
    expect(button.className).toContain("calendar-event");
  });

  it("uses custom color inline styles when event.color is set", () => {
    const event = makeEvent({ color: "#ff5733" });
    render(<EventBlock {...defaultProps} event={event} />);
    const button = screen.getByRole("button");
    // Custom color uses inline style for backgroundColor and borderLeftColor
    // jsdom normalizes hex+alpha to rgba
    expect(button.style.backgroundColor).toBe("rgba(255, 87, 51, 0.125)");
    expect(button.style.borderLeftColor).toBe("rgb(255, 87, 51)");
  });

  it("short events (<30px height) show title only, not time range", () => {
    render(<EventBlock {...defaultProps} height={20} />);
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    // No time range visible
    expect(screen.queryByText(/10:00/)).not.toBeInTheDocument();
  });

  it("onClick fires with the event object and stopPropagation", () => {
    const onClick = vi.fn();
    render(<EventBlock {...defaultProps} onClick={onClick} />);
    const button = screen.getByRole("button");

    const clickEvent = new MouseEvent("click", { bubbles: true });
    const stopSpy = vi.spyOn(clickEvent, "stopPropagation");

    button.dispatchEvent(clickEvent);
    expect(onClick).toHaveBeenCalledWith(defaultProps.event);
    expect(stopSpy).toHaveBeenCalled();
  });
});
