import { describe, expect, it, vi } from "vitest";
import {
  SchedulingWrites,
  toCalendarEventResponse,
  toReminderResponse,
  type ScheduleCreationPersistence,
  type ScheduleCreationPersistenceOutcome,
  type ScheduleEventRecord,
  type ScheduleRecurrenceRule,
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

function validRequest() {
  return {
    userId: "user-123",
    event: {
      title: "Team sync",
      startDate: "2026-08-03",
      startTime: "10:00",
      endDate: "2026-08-03",
      endTime: "11:00",
    },
  };
}

describe("SchedulingWrites.create", () => {
  it.each([
    ["blank user", (request: Record<string, unknown>) => { request.userId = " "; }, "userId"],
    ["missing event", (request: Record<string, unknown>) => { request.event = null; }, "event"],
    ["blank title", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).title = " "; }, "title"],
    ["long title", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).title = "x".repeat(201); }, "title"],
    ["malformed start date", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).startDate = "08/03/2026"; }, "startDate"],
    ["impossible start date", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).startDate = "2026-02-30"; }, "startDate"],
    ["end date before start", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endDate = "2026-08-02"; }, "endDate"],
    ["malformed start time", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).startTime = "10"; }, "startTime"],
    ["impossible end time", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endTime = "25:00"; }, "endTime"],
    ["end time without start time", (request: Record<string, unknown>) => {
      const event = request.event as Record<string, unknown>;
      delete event.startTime;
      event.endTime = "11:00";
    }, "endTime"],
    ["non-text description", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).description = 1; }, "description"],
    ["long description", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).description = "x".repeat(2001); }, "description"],
    ["non-text location", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).location = 1; }, "location"],
    ["long location", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).location = "x".repeat(501); }, "location"],
    ["long color", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).color = "x".repeat(51); }, "color"],
    ["blank category id", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).categoryId = " "; }, "categoryId"],
    ["non-text recurring event id", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).recurringEventId = 1; }, "recurringEventId"],
    ["malformed original date", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).originalDate = "tomorrow"; }, "originalDate"],
    ["malformed recurrence end date", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endDateRecurrence = "tomorrow"; }, "endDateRecurrence"],
    ["non-boolean recurrence flag", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).isRecurring = "yes"; }, "isRecurring"],
    ["missing recurring rule", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).isRecurring = true; }, "recurrenceRule"],
    ["rule on non-recurring event", (request: Record<string, unknown>) => {
      (request.event as Record<string, unknown>).recurrenceRule = { frequency: "daily", interval: 1 };
    }, "recurrenceRule"],
    ["invalid end type", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endType = "until"; }, "endType"],
    ["invalid end count", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endCount = 0; }, "endCount"],
    ["missing after-count", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endType = "after_count"; }, "endCount"],
    ["missing on-date boundary", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).endType = "on_date"; }, "endDateRecurrence"],
    ["recurrence boundary before start", (request: Record<string, unknown>) => {
      (request.event as Record<string, unknown>).endDateRecurrence = "2026-08-02";
    }, "endDateRecurrence"],
    ["non-boolean exception flag", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).isException = "yes"; }, "isException"],
    ["exception without recurring event", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).isException = true; }, "recurringEventId"],
    ["recurring event without original date", (request: Record<string, unknown>) => { (request.event as Record<string, unknown>).recurringEventId = "series-1"; }, "originalDate"],
    ["non-array reminders", (request: Record<string, unknown>) => { request.reminders = {}; }, "reminders"],
    ["invalid reminder type", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "sms", channels: ["push"] }]; }, "reminders[0]"],
    ["empty reminder channels", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "relative", relativeMinutes: 5, channels: [] }]; }, "reminders[0].channels"],
    ["unknown reminder channel", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "relative", relativeMinutes: 5, channels: ["sms"] }]; }, "reminders[0].channels"],
    ["duplicate reminder channels", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "relative", relativeMinutes: 5, channels: ["push", "push"] }]; }, "reminders[0].channels"],
    ["invalid relative reminder", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "relative", relativeMinutes: -1, channels: ["push"] }]; }, "reminders[0].relativeMinutes"],
    ["invalid absolute reminder", (request: Record<string, unknown>) => { request.reminders = [{ reminderType: "absolute", absoluteTime: "tomorrow", channels: ["push"] }]; }, "reminders[0].absoluteTime"],
  ] as const)("rejects %s at the domain boundary", async (_label, mutate, field) => {
    const storage = persistence();
    const request = validRequest();
    mutate(request as unknown as Record<string, unknown>);

    await expect(new SchedulingWrites(storage).create(request as never)).resolves.toMatchObject({
      type: "invalid",
      field,
    });
    expect(storage.createSchedule).not.toHaveBeenCalled();
  });

  it("normalizes every supported recurrence and absolute reminder shape", async () => {
    const cases: ScheduleRecurrenceRule[] = [
      { frequency: "daily", interval: 1 },
      { frequency: "weekly", interval: 2, daysOfWeek: [1, 1, 5] },
      { frequency: "monthly", interval: 1, dayOfMonth: 15 },
      { frequency: "monthly", interval: 1, weekPosition: "last", dayOfWeekMonthly: 5 },
      { frequency: "yearly", interval: 1, monthOfYear: 8, dayOfMonth: 3 },
    ];

    for (const [index, recurrenceRule] of cases.entries()) {
      const storage = persistence();
      await expect(new SchedulingWrites(storage).create({
        userId: "user-123",
        event: {
          title: `Recurring ${index}`,
          startDate: "2026-08-03",
          isRecurring: true,
          recurrenceRule,
          endType: "never",
        },
        reminders: [
          {
            reminderType: "absolute",
            absoluteTime: "2026-08-03T09:00:00.000Z",
            channels: ["email"],
          },
        ],
      })).resolves.toMatchObject({ type: "created" });

      expect(storage.createSchedule).toHaveBeenCalledWith(expect.objectContaining({
        event: expect.objectContaining({
          recurrenceRule: expect.objectContaining({ frequency: recurrenceRule.frequency }),
        }),
        reminders: [{
          reminderType: "absolute",
          relativeMinutes: null,
          absoluteTime: "2026-08-03T09:00:00.000Z",
          channels: ["email"],
        }],
      }));
    }
  });

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
