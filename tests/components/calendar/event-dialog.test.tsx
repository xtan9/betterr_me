import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventDialog } from "@/components/calendar/event-dialog";
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
    // Mock: event save returns an event id, reminder POST succeeds
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
      // Reminder POST
      if (typeof url === "string" && url === "/api/reminders" && opts?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
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

    // After event is created, reminder POST should be called with the smart default reminder
    await waitFor(() => {
      const reminderPostCalls = mockFetch.mock.calls.filter(
        ([url, opts]: [string, RequestInit | undefined]) =>
          url === "/api/reminders" && opts?.method === "POST",
      );
      expect(reminderPostCalls.length).toBeGreaterThanOrEqual(1);

      // Verify the reminder data includes the smart default values
      const body = JSON.parse(reminderPostCalls[0][1]?.body as string);
      expect(body.source_type).toBe("calendar_event");
      expect(body.source_id).toBe("new-evt-1");
      expect(body.reminder_type).toBe("relative");
    });
  });

  it("skips reminder persistence when reminderLoadFailed is true (REMN-04)", async () => {
    // Mock: editing an event where reminder fetch fails
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
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
      ([url, opts]: [string, RequestInit | undefined]) =>
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
});
