import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCalendarEvents } from "@/components/calendar/use-calendar-events";
import { calendarEventToDisplayItem } from "@/lib/calendar/display";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

function makeEvent(id: string): ExpandedCalendarEvent {
  return {
    id,
    user_id: "user-1",
    title: "Event",
    description: null,
    start_date: "2026-04-12",
    start_time: "09:00:00",
    end_date: "2026-04-12",
    end_time: "10:00:00",
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
    created_at: "2026-04-12T00:00:00Z",
    updated_at: "2026-04-12T00:00:00Z",
    is_virtual: false,
  };
}

describe("useCalendarEvents", () => {
  it("initializes with no quickCreate or eventDialog", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    expect(result.current.quickCreate).toBeNull();
    expect(result.current.eventDialog).toBeNull();
    expect(result.current.isOverlayOpen).toBe(false);
  });

  it("opens quickCreate with +30 min end time from a time-slot click", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => {
      result.current.handleTimeSlotClick(new Date(2026, 3, 12), "09:15", { x: 10, y: 20 });
    });

    expect(result.current.quickCreate).toMatchObject({
      isOpen: true,
      startTime: "09:15",
      endTime: "09:45",
      anchorPosition: { x: 10, y: 20 },
    });
    expect(result.current.isOverlayOpen).toBe(true);
  });

  it("wraps end time past midnight when slot is at 23:45", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => {
      result.current.handleTimeSlotClick(new Date(2026, 3, 12), "23:45", { x: 0, y: 0 });
    });

    expect(result.current.quickCreate?.endTime).toBe("00:15");
  });

  it("opens quickCreate from drag-select with explicit start/end", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => {
      result.current.handleDragSelect(
        new Date(2026, 3, 12),
        "10:00",
        "11:30",
        { x: 5, y: 7 },
      );
    });

    expect(result.current.quickCreate).toMatchObject({
      isOpen: true,
      startTime: "10:00",
      endTime: "11:30",
      anchorPosition: { x: 5, y: 7 },
    });
  });

  it("opens the event dialog when clicking a Calendar Event display item", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    const ev = calendarEventToDisplayItem(makeEvent("e1"));
    act(() => result.current.handleEventClick(ev));

    expect(result.current.eventDialog).toMatchObject({ isOpen: true, event: ev.event });
  });

  it("keeps Calendar Event display items on the editing path", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );
    const ev = calendarEventToDisplayItem(makeEvent("e"));
    act(() => result.current.handleEventClick(ev));
    expect(result.current.eventDialog?.isOpen).toBe(true);
  });

  it("handleNewEvent opens dialog prefilled with dateParam", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => result.current.handleNewEvent());
    expect(result.current.eventDialog).toMatchObject({
      isOpen: true,
      event: null,
      prefill: { date: "2026-04-12" },
    });
  });

  it("handleQuickCreateMoreOptions closes quickCreate and opens dialog with prefill", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => {
      result.current.handleDragSelect(new Date(2026, 3, 12), "08:00", "09:00", { x: 0, y: 0 });
    });
    act(() => {
      result.current.handleQuickCreateMoreOptions("Dentist");
    });

    expect(result.current.quickCreate).toBeNull();
    expect(result.current.eventDialog?.prefill).toMatchObject({
      title: "Dentist",
      startTime: "08:00",
      endTime: "09:00",
    });
  });

  it("handleQuickCreateMoreOptions does nothing when no quickCreate is active", () => {
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", vi.fn()),
    );

    act(() => result.current.handleQuickCreateMoreOptions("Nope"));
    expect(result.current.eventDialog).toBeNull();
  });

  it("returns onEventSaved reference as handleEventSaved", () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useCalendarEvents("2026-04-12", onSaved),
    );
    result.current.handleEventSaved();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
