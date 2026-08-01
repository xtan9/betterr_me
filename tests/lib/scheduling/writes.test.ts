import { describe, expect, it, vi } from "vitest";
import {
  SchedulingWrites,
  toCalendarEventResponse,
  toReminderResponse,
  type ScheduleCreationPersistence,
  type ScheduleCreationPersistenceOutcome,
  type ScheduleEventRecord,
  type ScheduleReminderRecord,
} from "@/lib/scheduling/writes";

const createdEvent: ScheduleEventRecord = {
  id: "event-123",
  userId: "user-123",
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
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const createdReminder: ScheduleReminderRecord = {
  id: "reminder-123",
  userId: "user-123",
  eventId: "event-123",
  reminderType: "relative",
  relativeMinutes: 15,
  absoluteTime: null,
  channels: ["push"],
  status: "pending",
  fireAt: "2026-08-03T13:45:00.000Z",
  sentAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function persistence(
  outcome: ScheduleCreationPersistenceOutcome = {
    type: "created",
    event: createdEvent,
    reminders: [],
  },
): ScheduleCreationPersistence {
  return { createSchedule: vi.fn().mockResolvedValue(outcome) };
}

describe("SchedulingWrites.create", () => {
  it("normalizes one trusted domain request for an event-only creation", async () => {
    const storage = persistence();

    await expect(
      new SchedulingWrites(storage).create({
        userId: " user-123 ",
        event: {
          title: "  Team sync  ",
          startDate: "2026-08-03",
          startTime: "10:00",
          endDate: "2026-08-03",
          endTime: "11:00",
        },
      }),
    ).resolves.toEqual({ type: "created", event: createdEvent, reminders: [] });

    expect(storage.createSchedule).toHaveBeenCalledWith({
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
      reminders: [],
    });
  });

  it("normalizes event-with-reminder creation through the same seam", async () => {
    const storage = persistence({
      type: "created",
      event: createdEvent,
      reminders: [createdReminder],
    });

    await expect(
      new SchedulingWrites(storage).create({
        userId: "user-123",
        event: {
          title: "Team sync",
          startDate: "2026-08-03",
          startTime: "10:00",
        },
        reminders: [
          {
            reminderType: "relative",
            relativeMinutes: 15,
            channels: ["push", "email"],
          },
        ],
      }),
    ).resolves.toEqual({
      type: "created",
      event: createdEvent,
      reminders: [createdReminder],
    });

    expect(storage.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        reminders: [
          {
            reminderType: "relative",
            relativeMinutes: 15,
            absoluteTime: null,
            channels: ["push", "email"],
          },
        ],
      }),
    );
  });

  it("returns invalid recurrence as a domain outcome without writing", async () => {
    const storage = persistence();

    await expect(
      new SchedulingWrites(storage).create({
        userId: "user-123",
        event: {
          title: "Invalid recurring event",
          startDate: "2026-08-03",
          isRecurring: true,
          recurrenceRule: {
            frequency: "weekly",
            interval: 0,
            daysOfWeek: [1],
          },
        },
      }),
    ).resolves.toMatchObject({ type: "invalid", field: "recurrenceRule" });

    expect(storage.createSchedule).not.toHaveBeenCalled();
  });

  it("returns a reminder conflict for duplicate requested intent", async () => {
    const storage = persistence();
    const request = {
      userId: "user-123",
      event: { title: "Team sync", startDate: "2026-08-03" },
      reminders: [
        { reminderType: "relative" as const, relativeMinutes: 15, channels: ["push"] as const },
        { reminderType: "relative" as const, relativeMinutes: 15, channels: ["push"] as const },
      ],
    };

    await expect(new SchedulingWrites(storage).create(request)).resolves.toEqual({
      type: "conflict",
      resource: "reminder",
    });
    expect(storage.createSchedule).not.toHaveBeenCalled();
  });

  it("preserves missing and cross-owner related entities as not-found", async () => {
    for (const related of ["category", "recurringEvent"] as const) {
      const storage = persistence({ type: "not-found", related });

      await expect(
        new SchedulingWrites(storage).create({
          userId: "user-123",
          event: { title: "Team sync", startDate: "2026-08-03" },
        }),
      ).resolves.toEqual({ type: "not-found", related });
    }
  });

  it("ignores an untrusted storage-shaped owner field", async () => {
    const storage = persistence();

    await new SchedulingWrites(storage).create({
      userId: "trusted-user",
      user_id: "attacker-user",
      event: { title: "Team sync", startDate: "2026-08-03" },
    } as never);

    expect(storage.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trusted-user" }),
    );
  });

  it("propagates unexpected persistence failures", async () => {
    const failure = new Error("schedule storage unavailable");
    const storage: ScheduleCreationPersistence = {
      createSchedule: vi.fn().mockRejectedValue(failure),
    };

    await expect(
      new SchedulingWrites(storage).create({
        userId: "user-123",
        event: { title: "Team sync", startDate: "2026-08-03" },
      }),
    ).rejects.toBe(failure);
  });
});

describe("Scheduling response mapping", () => {
  it("keeps the established storage-shaped HTTP and AI presentation", () => {
    expect(toCalendarEventResponse(createdEvent)).toEqual({
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
    });
    expect(toReminderResponse(createdReminder)).toEqual({
      id: "reminder-123",
      user_id: "user-123",
      source_type: "calendar_event",
      source_id: "event-123",
      reminder_type: "relative",
      relative_minutes: 15,
      absolute_time: null,
      channels: ["push"],
      status: "pending",
      fire_at: "2026-08-03T13:45:00.000Z",
      sent_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
    });
  });
});
