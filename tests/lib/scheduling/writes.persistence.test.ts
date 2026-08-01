import { describe, expect, it, vi } from "vitest";
import {
  SupabaseSchedulingCreationPersistence,
  type ScheduleCreationRecord,
} from "@/lib/scheduling/writes";

const record: ScheduleCreationRecord = {
  userId: "user-123",
  event: {
    title: "Team sync",
    description: null,
    startDate: "2026-08-03",
    startTime: "10:00:00",
    endDate: "2026-08-03",
    endTime: "11:00:00",
    location: null,
    color: null,
    categoryId: null,
    isRecurring: false,
    recurrenceRule: null,
    endType: null,
    endDateRecurrence: null,
    endCount: null,
    recurringEventId: null,
    originalDate: null,
    isException: false,
  },
  reminders: [
    {
      reminderType: "relative",
      relativeMinutes: 15,
      absoluteTime: null,
      channels: ["push", "email"],
    },
  ],
};

const storedEvent = {
  id: "event-123",
  user_id: "user-123",
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
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const storedReminder = {
  id: "reminder-123",
  user_id: "user-123",
  source_type: "calendar_event",
  source_id: "event-123",
  reminder_type: "relative",
  relative_minutes: 15,
  absolute_time: null,
  channels: ["push", "email"],
  status: "pending",
  fire_at: "2026-08-03T13:45:00.000Z",
  sent_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

function supabaseWith(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("SupabaseSchedulingCreationPersistence", () => {
  it("maps the domain record to the atomic event/reminder RPC", async () => {
    const supabase = supabaseWith({
      data: { type: "created", event: storedEvent, reminders: [storedReminder] },
      error: null,
    });

    const outcome = await new SupabaseSchedulingCreationPersistence(
      supabase as never,
    ).createSchedule(record);

    expect(outcome).toMatchObject({
      type: "created",
      event: {
        id: "event-123",
        userId: "user-123",
        startTime: "10:00:00",
      },
      reminders: [
        {
          id: "reminder-123",
          eventId: "event-123",
          relativeMinutes: 15,
          channels: ["push", "email"],
        },
      ],
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_calendar_event_with_reminder",
      {
        p_user_id: "user-123",
        p_event: {
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
        },
        p_reminders: [
          {
            reminder_type: "relative",
            relative_minutes: 15,
            absolute_time: null,
            channels: ["push", "email"],
          },
        ],
      },
    );
  });

  it("maps event-only creation without inventing a reminder", async () => {
    const supabase = supabaseWith({
      data: { type: "created", event: storedEvent, reminders: [] },
      error: null,
    });

    await expect(
      new SupabaseSchedulingCreationPersistence(supabase as never).createSchedule({
        ...record,
        reminders: [],
      }),
    ).resolves.toMatchObject({ type: "created", reminders: [] });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_calendar_event_with_reminder",
      expect.objectContaining({ p_reminders: [] }),
    );
  });

  it("preserves typed expected persistence outcomes", async () => {
    for (const data of [
      { type: "not-found", related: "category" },
      { type: "not-found", related: "recurringEvent" },
      { type: "conflict", resource: "reminder" },
      { type: "invalid", field: "recurrenceRule", message: "invalid recurrence" },
    ]) {
      const supabase = supabaseWith({ data, error: null });
      await expect(
        new SupabaseSchedulingCreationPersistence(supabase as never).createSchedule(record),
      ).resolves.toEqual(data);
    }
  });

  it("maps a unique violation to a typed reminder conflict", async () => {
    const supabase = supabaseWith({
      data: null,
      error: { code: "23505", message: "duplicate reminder intent" },
    });

    await expect(
      new SupabaseSchedulingCreationPersistence(supabase as never).createSchedule(record),
    ).resolves.toEqual({ type: "conflict", resource: "reminder" });
  });

  it("throws unexpected RPC failures and malformed outcomes", async () => {
    const failure = new Error("database unavailable");
    await expect(
      new SupabaseSchedulingCreationPersistence(
        supabaseWith({ data: null, error: failure }) as never,
      ).createSchedule(record),
    ).rejects.toBe(failure);

    await expect(
      new SupabaseSchedulingCreationPersistence(
        supabaseWith({ data: { type: "created", event: null, reminders: [] }, error: null }) as never,
      ).createSchedule(record),
    ).rejects.toThrow("Invalid calendar event returned by the database");
  });
});
