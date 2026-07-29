import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulingLifecycle } from "@/lib/scheduling/create";
import type { UpdateScheduleRequest } from "@/lib/scheduling/create";
import type { CalendarEvent, Reminder } from "@/lib/db/types";

const unsupportedInternalRecurrenceUpdate: UpdateScheduleRequest = {
  event: {
    // @ts-expect-error Internal recurrence bookkeeping is not accepted here.
    recurring_event_id: "event-parent",
  },
};
void unsupportedInternalRecurrenceUpdate;

const eventInput = {
  title: "Team sync",
  description: null,
  start_date: "2026-08-03",
  start_time: "10:00:00",
  end_date: "2026-08-03",
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
};

const event = {
  ...eventInput,
  id: "event-123",
  user_id: "user-123",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
} satisfies CalendarEvent;

const reminder = {
  id: "reminder-123",
  user_id: "user-123",
  source_type: "calendar_event",
  source_id: event.id,
  reminder_type: "relative",
  relative_minutes: 15,
  absolute_time: null,
  channels: ["push"],
  status: "pending",
  fire_at: "2026-08-03T09:45:00Z",
  sent_at: null,
  created_at: "2026-08-01T00:00:00Z",
} satisfies Reminder;

describe("SchedulingLifecycle.create", () => {
  it("creates an event without creating a reminder when none is requested", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { event, reminders: [] },
      error: null,
    });
    const lifecycle = new SchedulingLifecycle({ rpc } as never);

    const result = await lifecycle.create("user-123", { event: eventInput });

    expect(result).toEqual({ event, reminders: [] });
    expect(rpc).toHaveBeenCalledWith("create_calendar_event_with_reminder", {
      p_user_id: "user-123",
      p_event: eventInput,
      p_reminders: [],
    });
  });

  it("creates the related reminder at the requested schedule", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { event, reminders: [reminder] },
      error: null,
    });
    const lifecycle = new SchedulingLifecycle({ rpc } as never);

    const result = await lifecycle.create("user-123", {
      event: eventInput,
      reminders: [{
        reminder_type: "relative",
        relative_minutes: 15,
        absolute_time: null,
        channels: ["push"],
      }],
    });

    expect(result).toEqual({ event, reminders: [reminder] });
    expect(result.reminders[0]).toMatchObject({
      source_type: "calendar_event",
      source_id: event.id,
      fire_at: "2026-08-03T09:45:00Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("propagates the database lifecycle failure", async () => {
    const error = new Error("reminder insert failed");
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const lifecycle = new SchedulingLifecycle({ rpc } as never);

    await expect(
      lifecycle.create("user-123", {
        event: eventInput,
        reminders: [{
          reminder_type: "relative",
          relative_minutes: 15,
          absolute_time: null,
          channels: ["push"],
        }],
      }),
    ).rejects.toBe(error);
  });
});

describe("SchedulingLifecycle.update", () => {
  let rpc: ReturnType<typeof vi.fn>;
  let lifecycle: SchedulingLifecycle;

  beforeEach(() => {
    rpc = vi.fn();
    lifecycle = new SchedulingLifecycle({ rpc } as never);
  });

  it("updates an event and returns its reconciled reminder outcome", async () => {
    const updatedEvent = {
      ...event,
      start_time: "11:00:00",
      title: "Moved event",
    };
    const updatedReminder = {
      ...reminder,
      fire_at: "2026-08-03T10:45:00.000Z",
    };
    rpc.mockResolvedValue({
      data: { event: updatedEvent, reminders: [updatedReminder] },
      error: null,
    });

    const result = await lifecycle.update("user-123", "event-123", {
      event: { start_time: "11:00:00", title: "Moved event" },
      reminders: [{
        reminder_type: "relative",
        relative_minutes: 15,
        absolute_time: null,
        channels: ["push"],
      }],
    });

    expect(result).toEqual({
      event: updatedEvent,
      reminders: [updatedReminder],
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_calendar_event_with_reminders",
      {
        p_user_id: "user-123",
        p_event_id: "event-123",
        p_event: { start_time: "11:00:00", title: "Moved event" },
        p_reminders: [{
          reminder_type: "relative",
          relative_minutes: 15,
          absolute_time: null,
          channels: ["push"],
        }],
      },
    );
  });

  it("preserves reminder intent when an unrelated update omits reminders", async () => {
    rpc.mockResolvedValue({
      data: { event: { ...event, title: "Renamed" }, reminders: [reminder] },
      error: null,
    });

    await lifecycle.update("user-123", "event-123", {
      event: { title: "Renamed" },
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_calendar_event_with_reminders",
      expect.objectContaining({ p_reminders: null }),
    );
  });

  it("surfaces transaction failures instead of returning a partial schedule", async () => {
    const error = new Error("reminder reconciliation failed");
    rpc.mockResolvedValue({ data: null, error });

    await expect(
      lifecycle.update("user-123", "event-123", {
        event: { start_time: "11:00:00" },
        reminders: [],
      }),
    ).rejects.toBe(error);
  });
});
