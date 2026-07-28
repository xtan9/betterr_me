import { describe, expect, it, vi } from "vitest";
import { SchedulingLifecycle } from "@/lib/scheduling/create";
import type { CalendarEvent, Reminder } from "@/lib/db/types";

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
