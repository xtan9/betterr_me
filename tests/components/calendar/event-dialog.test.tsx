import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { EventDialog } from "@/components/calendar/event-dialog";

expect.extend(axeMatchers);
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEvent } from "@/lib/db/types";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeEvent(
  overrides: Partial<CalendarEvent> & { is_virtual?: boolean } = {},
): ExpandedCalendarEvent {
  return {
    id: "e1",
    user_id: "u1",
    title: "Existing Event",
    description: "A description",
    start_date: "2026-04-01",
    start_time: "10:00:00",
    end_date: "2026-04-01",
    end_time: "11:00:00",
    location: "Room 101",
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

describe("EventDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Default: reminder fetch returns empty array (used by edit mode)
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/reminders")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reminders: [] }),
        });
      }
      // Default for other fetches — resolved by individual tests via mockResolvedValueOnce
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("renders New Event title when no event prop (create mode)", () => {
    render(<EventDialog {...defaultProps} />);
    expect(screen.getByText("eventDialog.newEvent")).toBeInTheDocument();
  });

  it("renders Edit Event title when event prop is provided (edit mode)", () => {
    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    expect(screen.getByText("eventDialog.editEvent")).toBeInTheDocument();
  });

  it("renders title input, date input, time inputs, location, and description fields", () => {
    render(<EventDialog {...defaultProps} />);
    // Title
    expect(screen.getByLabelText("eventDialog.title")).toBeInTheDocument();
    // Location
    expect(screen.getByLabelText("eventDialog.location")).toBeInTheDocument();
    // Description
    expect(screen.getByLabelText("eventDialog.description")).toBeInTheDocument();
    // Start date
    expect(screen.getByLabelText("eventDialog.startTime")).toBeInTheDocument();
  });

  it("shows delete button only in edit mode", () => {
    const { rerender } = render(<EventDialog {...defaultProps} />);
    // Create mode — no delete button
    expect(screen.queryByText("eventDialog.delete")).not.toBeInTheDocument();

    // Edit mode — delete button present
    rerender(<EventDialog {...defaultProps} event={makeEvent()} />);
    expect(screen.getByText("eventDialog.delete")).toBeInTheDocument();
  });

  it("pre-fills form from prefill prop (title, date, startTime, endTime)", () => {
    render(
      <EventDialog
        {...defaultProps}
        prefill={{
          title: "Prefilled Title",
          date: "2026-04-15",
          startTime: "14:00",
          endTime: "15:00",
        }}
      />,
    );
    const titleInput = screen.getByLabelText("eventDialog.title") as HTMLInputElement;
    expect(titleInput.value).toBe("Prefilled Title");
  });

  it("pre-fills form from event prop in edit mode", () => {
    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    const titleInput = screen.getByLabelText("eventDialog.title") as HTMLInputElement;
    expect(titleInput.value).toBe("Existing Event");
    const locationInput = screen.getByLabelText("eventDialog.location") as HTMLInputElement;
    expect(locationInput.value).toBe("Room 101");
  });

  it("calls fetch POST on save in create mode", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || opts.method === undefined || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} prefill={{ title: "New Event" }} />);

    const saveButton = screen.getByText("eventDialog.save");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/calendar-events",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("calls fetch PATCH on save in edit mode", async () => {
    render(<EventDialog {...defaultProps} event={makeEvent()} />);

    const saveButton = screen.getByText("eventDialog.save");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/calendar-events/e1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("calls onSaved and onClose after successful save", async () => {
    render(
      <EventDialog {...defaultProps} prefill={{ title: "Test" }} />,
    );

    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalledOnce();
      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });
  });

  it("submits current reminderRows state, not stale initial state (REMN-01 stale closure fix)", async () => {
    // Mock the atomic event/reminder save.
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (typeof url === "string" && url === "/api/calendar-events") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ event: { id: "new-evt-1" } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <EventDialog
        {...defaultProps}
        prefill={{ title: "Test Stale Closure" }}
      />,
    );

    // In create mode, the dialog starts with one smart-default reminder.
    // The handleSubmit should use the CURRENT reminderRows (the smart default),
    // not an empty array from a stale closure.
    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      // The event POST should have been called
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/calendar-events",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // The event request owns the smart-default reminder.
    await waitFor(() => {
      const eventPost = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/calendar-events" && opts?.method === "POST",
      );
      expect(eventPost).toBeDefined();

      const body = JSON.parse(eventPost![1]?.body as string);
      expect(body.reminders).toEqual([
        expect.objectContaining({
          reminder_type: "relative",
          relative_minutes: 15,
        }),
      ]);
      expect(
        mockFetch.mock.calls.some(
          ([url, opts]) => url === "/api/reminders" && opts?.method === "POST",
        ),
      ).toBe(false);
    });
  });

  it("skips reminder persistence when reminderLoadFailed is true (REMN-04)", async () => {
    // Mock: editing an event where reminder fetch fails
    mockFetch.mockImplementation((url: string, _opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders?")) {
        // Simulate reminder load failure
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Internal server error" }),
        });
      }
      if (typeof url === "string" && url.includes("/api/calendar-events/e1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ event: { id: "e1" } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} event={makeEvent()} />);

    // Wait for the reminder load to fail
    await waitFor(() => {
      // The reminder fetch should have been attempted
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/reminders?"),
      );
    });

    // Submit the form
    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/calendar-events/e1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    // Wait a bit for any potential reminder calls
    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalledOnce();
    });

    // Verify no reminder POST/PATCH/DELETE calls were made (only the initial GET)
    const reminderCalls = mockFetch.mock.calls.filter(
      ([url, opts]) =>
        typeof url === "string" &&
        url.includes("/api/reminders") &&
        opts?.method && opts.method !== "GET",
    );
    expect(reminderCalls).toHaveLength(0);
  });

  it("calls fetch DELETE when delete is confirmed", async () => {
    window.confirm = vi.fn().mockReturnValue(true);

    render(<EventDialog {...defaultProps} event={makeEvent()} />);

    fireEvent.click(screen.getByText("eventDialog.delete"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/calendar-events/e1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("does NOT call fetch DELETE when delete is cancelled via window.confirm", async () => {
    window.confirm = vi.fn().mockReturnValue(false);

    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    // Wait for reminder fetch (the only expected call) to resolve
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const priorCalls = mockFetch.mock.calls.length;

    fireEvent.click(screen.getByText("eventDialog.delete"));

    // No additional fetch calls should be issued
    expect(window.confirm).toHaveBeenCalledWith("eventDialog.deleteConfirm");
    expect(mockFetch.mock.calls.length).toBe(priorCalls);
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("calls onSaved and onClose after successful delete", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    fireEvent.click(screen.getByText("eventDialog.delete"));

    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalledOnce();
      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows error message when delete API fails with error body", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (opts?.method === "DELETE") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Could not delete" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    fireEvent.click(screen.getByText("eventDialog.delete"));

    await waitFor(() => {
      expect(screen.getByText("Could not delete")).toBeInTheDocument();
    });
    // onSaved / onClose NOT called on failure
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows fallback error when delete throws a network error", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (opts?.method === "DELETE") {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} event={makeEvent()} />);
    fireEvent.click(screen.getByText("eventDialog.delete"));

    await waitFor(() => {
      expect(screen.getByText("eventDialog.deleteFailed")).toBeInTheDocument();
    });
  });

  it("shows API error message when save fails with error body", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (typeof url === "string" && url === "/api/calendar-events") {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "Title required" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} prefill={{ title: "Bad Event" }} />);
    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      expect(screen.getByText("Title required")).toBeInTheDocument();
    });
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows fallback save error when fetch throws", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      if (typeof url === "string" && url === "/api/calendar-events") {
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} prefill={{ title: "Net Fail" }} />);
    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      expect(screen.getByText("eventDialog.saveFailed")).toBeInTheDocument();
    });
  });

  it("hides time fields when all-day checkbox is toggled on", () => {
    render(<EventDialog {...defaultProps} />);
    expect(screen.getByLabelText("eventDialog.startTime")).toBeInTheDocument();
    expect(screen.getByLabelText("eventDialog.endTime")).toBeInTheDocument();

    const allDay = screen.getByLabelText("eventDialog.allDay");
    fireEvent.click(allDay);

    expect(screen.queryByLabelText("eventDialog.startTime")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("eventDialog.endTime")).not.toBeInTheDocument();
  });

  it("sends null start_time/end_time when is_all_day is true", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders") && (!opts || !opts.method || opts.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ reminders: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ event: { id: "new" } }) });
    });

    render(<EventDialog {...defaultProps} prefill={{ title: "AD", startTime: "10:00", endTime: "11:00" }} />);
    fireEvent.click(screen.getByLabelText("eventDialog.allDay"));
    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      const eventCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/calendar-events" && opts?.method === "POST",
      );
      expect(eventCall).toBeDefined();
      const body = JSON.parse((eventCall![1] as RequestInit).body as string);
      expect(body.start_time).toBeNull();
      expect(body.end_time).toBeNull();
    });
  });

  it("updates selected color when a color swatch is clicked", () => {
    render(<EventDialog {...defaultProps} />);
    // Dialog is rendered in a portal — query the whole document
    const blueSwatch = document.querySelector('[title="eventDialog.colors.blue"]') as HTMLButtonElement;
    expect(blueSwatch).not.toBeNull();
    fireEvent.click(blueSwatch);
    // After selection it should get the scale-110 class (selected indicator)
    expect(blueSwatch.className).toContain("scale-110");
  });

  it("loads existing reminders in edit mode and issues PATCH for unchanged reminders", async () => {
    const reminder = {
      id: "rem-1",
      user_id: "u1",
      source_type: "calendar_event",
      source_id: "e1",
      reminder_type: "relative",
      relative_minutes: 15,
      absolute_time: null,
      channels: ["push"],
      created_at: "2026-04-01T00:00:00Z",
    };
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders?source_type")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reminders: [reminder] }),
        });
      }
      if (typeof url === "string" && url.includes("/api/calendar-events/e1") && opts?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ event: { id: "e1" } }),
        });
      }
      if (typeof url === "string" && url.includes("/api/reminders/rem-1") && opts?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<EventDialog {...defaultProps} event={makeEvent()} />);

    // Wait for the reminder row to render (proves fetch resolved AND state updated)
    await waitFor(() => {
      expect(screen.getByLabelText("reminders.typeLabel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      const patchReminder = mockFetch.mock.calls.find(
        ([url, opts]) =>
          typeof url === "string" && url.includes("/api/reminders/rem-1") && opts?.method === "PATCH",
      );
      expect(patchReminder).toBeDefined();
    });
  });

  it("calls onClose when cancel button is clicked", () => {
    render(<EventDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("eventDialog.cancel"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("warns via toast when a reminder save request fails", async () => {
    // Existing reminder: PATCH will reject
    const reminder = {
      id: "rem-fail",
      user_id: "u1",
      source_type: "calendar_event",
      source_id: "e1",
      reminder_type: "relative",
      relative_minutes: 15,
      absolute_time: null,
      channels: ["push"],
      created_at: "2026-04-01T00:00:00Z",
    };
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/reminders?source_type")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reminders: [reminder] }),
        });
      }
      if (typeof url === "string" && url.includes("/api/calendar-events/e1") && opts?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ event: { id: "e1" } }),
        });
      }
      if (typeof url === "string" && url.includes("/api/reminders/rem-fail") && opts?.method === "PATCH") {
        return Promise.reject(new Error("reminder patch failed"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const { toast } = await import("sonner");
    const warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);

    render(<EventDialog {...defaultProps} event={makeEvent()} />);

    // Wait for the reminder row to render (proves fetch resolved AND state updated)
    await waitFor(() => {
      expect(screen.getByLabelText("reminders.typeLabel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("eventDialog.save"));

    await waitFor(() => {
      expect(warningSpy).toHaveBeenCalledWith("eventDialog.reminderSaveWarning");
    });
    warningSpy.mockRestore();
  });

  it("closes the dialog via Dialog onOpenChange (e.g. ESC key)", () => {
    const onClose = vi.fn();
    render(<EventDialog {...defaultProps} onClose={onClose} />);
    // Radix Dialog closes on ESC keydown on the content
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has no axe accessibility violations in create mode", async () => {
    render(<EventDialog {...defaultProps} />);
    // Dialog portals to body — audit the whole body
    const results = await axe(document.body);
    expect(results).toHaveNoViolations();
  });
});
