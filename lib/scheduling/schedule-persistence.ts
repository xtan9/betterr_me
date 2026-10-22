/** Maps Schedule creation to the atomic Supabase operation and decodes its result. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScheduleCreationPersistence,
  ScheduleCreationRecord,
  ScheduleCreationPersistenceOutcome,
  ScheduleRecurrenceRule,
  ScheduleWeekPosition,
  ScheduleEventRecord,
  ScheduleEndType,
  ScheduleReminderRecord,
  ScheduleReminderChannel,
  ScheduleReminderStatus,
} from "./write-contract";

import { isRecord, WEEK_POSITIONS, CHANNELS } from "./write-validation";

export class SupabaseSchedulingCreationPersistence
  implements ScheduleCreationPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  async createSchedule(
    record: ScheduleCreationRecord,
  ): Promise<ScheduleCreationPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "create_calendar_event_with_reminder",
      {
        p_user_id: record.userId,
        p_event: toStoredEvent(record.event),
        p_reminders: record.reminders.map(toStoredReminder),
      },
    );

    if (error) {
      if (isConflictError(error)) return { type: "conflict", resource: "reminder" };
      if (isForeignKeyError(error)) return { type: "not-found" };
      throw error;
    }
    return mapStoredCreationOutcome(data);
  }
}

function toStoredEvent(event: ScheduleCreationRecord["event"]): Record<string, unknown> {
  return {
    title: event.title,
    description: event.description,
    start_date: event.startDate,
    start_time: event.startTime,
    end_date: event.endDate,
    end_time: event.endTime,
    location: event.location,
    color: event.color,
    category_id: event.categoryId,
    is_recurring: event.isRecurring,
    recurrence_rule: event.recurrenceRule ? toStoredRecurrenceRule(event.recurrenceRule) : null,
    end_type: event.endType,
    end_date_recurrence: event.endDateRecurrence,
    end_count: event.endCount,
    recurring_event_id: event.recurringEventId,
    original_date: event.originalDate,
    is_exception: event.isException,
  };
}

export function toStoredRecurrenceRule(rule: ScheduleRecurrenceRule): Record<string, unknown> {
  if (rule.frequency === "daily") {
    return { frequency: rule.frequency, interval: rule.interval };
  }
  if (rule.frequency === "weekly") {
    return {
      frequency: rule.frequency,
      interval: rule.interval,
      days_of_week: rule.daysOfWeek,
    };
  }
  if (rule.frequency === "yearly") {
    return {
      frequency: rule.frequency,
      interval: rule.interval,
      month_of_year: rule.monthOfYear,
      day_of_month: rule.dayOfMonth,
    };
  }
  if ("dayOfMonth" in rule) {
    return {
      frequency: rule.frequency,
      interval: rule.interval,
      day_of_month: rule.dayOfMonth,
    };
  }
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    week_position: rule.weekPosition,
    day_of_week_monthly: rule.dayOfWeekMonthly,
  };
}

function toStoredReminder(
  reminder: ScheduleCreationRecord["reminders"][number],
): Record<string, unknown> {
  return {
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
  };
}

function isConflictError(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function isForeignKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === "23503";
}

function mapStoredCreationOutcome(value: unknown): ScheduleCreationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid calendar event creation outcome returned by the database");
  }
  if (value.type === "not-found") {
    if (value.related === undefined || value.related === "category" || value.related === "recurringEvent") {
      return {
        type: "not-found",
        ...(value.related === undefined ? {} : { related: value.related }),
      };
    }
  }
  if (value.type === "conflict") {
    if (
      (value.resource === undefined || value.resource === "event" || value.resource === "reminder") &&
      (value.reason === undefined || typeof value.reason === "string")
    ) {
      return {
        type: "conflict",
        ...(value.resource === undefined ? {} : { resource: value.resource }),
        ...(value.reason === undefined ? {} : { reason: value.reason }),
      };
    }
  }
  if (
    value.type === "invalid" &&
    typeof value.field === "string" &&
    typeof value.message === "string"
  ) {
    return { type: "invalid", field: value.field, message: value.message };
  }
  if (value.type === "created" && Array.isArray(value.reminders)) {
    return {
      type: "created",
      event: toScheduleEventRecord(value.event),
      reminders: value.reminders.map(toScheduleReminderRecord),
    };
  }
  throw new Error("Invalid calendar event creation outcome returned by the database");
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(`Invalid calendar ${field} returned by the database`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value) return value;
  throw new Error(`Invalid calendar ${field} returned by the database`);
}

function mapStoredRecurrenceRule(value: unknown): ScheduleRecurrenceRule | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.frequency !== "string" || typeof value.interval !== "number") {
    throw new Error("Invalid calendar event recurrenceRule returned by the database");
  }
  if (value.frequency === "daily") {
    return { frequency: "daily", interval: value.interval };
  }
  if (value.frequency === "weekly" && Array.isArray(value.days_of_week)) {
    return {
      frequency: "weekly",
      interval: value.interval,
      daysOfWeek: value.days_of_week as number[],
    };
  }
  if (
    value.frequency === "monthly" &&
    typeof value.day_of_month === "number"
  ) {
    return {
      frequency: "monthly",
      interval: value.interval,
      dayOfMonth: value.day_of_month,
    };
  }
  if (
    value.frequency === "monthly" &&
    typeof value.week_position === "string" &&
    typeof value.day_of_week_monthly === "number" &&
    WEEK_POSITIONS.has(value.week_position as ScheduleWeekPosition)
  ) {
    return {
      frequency: "monthly",
      interval: value.interval,
      weekPosition: value.week_position as ScheduleWeekPosition,
      dayOfWeekMonthly: value.day_of_week_monthly,
    };
  }
  if (
    value.frequency === "yearly" &&
    typeof value.month_of_year === "number" &&
    typeof value.day_of_month === "number"
  ) {
    return {
      frequency: "yearly",
      interval: value.interval,
      monthOfYear: value.month_of_year,
      dayOfMonth: value.day_of_month,
    };
  }
  throw new Error("Invalid calendar event recurrenceRule returned by the database");
}

function toScheduleEventRecord(value: unknown): ScheduleEventRecord {
  if (!isRecord(value)) throw new Error("Invalid calendar event returned by the database");
  if (
    typeof value.is_recurring !== "boolean" ||
    typeof value.is_exception !== "boolean" ||
    (value.end_type !== null && value.end_type !== undefined &&
      !["never", "after_count", "on_date"].includes(value.end_type as string))
  ) {
    throw new Error("Invalid calendar event returned by the database");
  }
  return {
    id: requiredString(value.id, "event"),
    userId: requiredString(value.user_id, "event"),
    title: requiredString(value.title, "event"),
    description: nullableString(value.description, "event"),
    startDate: requiredString(value.start_date, "event"),
    startTime: nullableString(value.start_time, "event"),
    endDate: requiredString(value.end_date, "event"),
    endTime: nullableString(value.end_time, "event"),
    location: nullableString(value.location, "event"),
    color: nullableString(value.color, "event"),
    categoryId: nullableString(value.category_id, "event"),
    isRecurring: value.is_recurring,
    recurrenceRule: mapStoredRecurrenceRule(value.recurrence_rule),
    endType: (value.end_type ?? null) as ScheduleEndType | null,
    endDateRecurrence: nullableString(value.end_date_recurrence, "event"),
    endCount: value.end_count === null ? null : (value.end_count as number),
    recurringEventId: nullableString(value.recurring_event_id, "event"),
    originalDate: nullableString(value.original_date, "event"),
    isException: value.is_exception,
    createdAt: requiredString(value.created_at, "event"),
    updatedAt: requiredString(value.updated_at, "event"),
  };
}

function toScheduleReminderRecord(value: unknown): ScheduleReminderRecord {
  if (!isRecord(value)) throw new Error("Invalid calendar reminder returned by the database");
  if (
    value.source_type !== "calendar_event" ||
    (value.reminder_type !== "relative" && value.reminder_type !== "absolute") ||
    !Array.isArray(value.channels) ||
    value.channels.some((channel) => !CHANNELS.has(channel as ScheduleReminderChannel)) ||
    !["pending", "sent", "failed", "snoozed"].includes(value.status as string)
  ) {
    throw new Error("Invalid calendar reminder returned by the database");
  }
  return {
    id: requiredString(value.id, "reminder"),
    userId: requiredString(value.user_id, "reminder"),
    eventId: requiredString(value.source_id, "reminder"),
    reminderType: value.reminder_type,
    relativeMinutes: value.relative_minutes === null ? null : (value.relative_minutes as number),
    absoluteTime: nullableString(value.absolute_time, "reminder"),
    channels: value.channels as ScheduleReminderChannel[],
    status: value.status as ScheduleReminderStatus,
    fireAt: requiredString(value.fire_at, "reminder"),
    sentAt: nullableString(value.sent_at, "reminder"),
    createdAt: requiredString(value.created_at, "reminder"),
  };
}
