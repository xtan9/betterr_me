/** Normalizes Schedule dates, recurrence, and reminder inputs before persistence. */

import type {
  ScheduleReminderChannel,
  ScheduleWeekPosition,
  ScheduleRecurrenceRule,
  ScheduleCreationRecord,
  ScheduleCreationRequest,
  ScheduleCreationOutcome,
} from "./write-contract";

type InvalidResult = { ok: false; field: string; message: string };

type NormalizedResult<T> = { ok: true; value: T } | InvalidResult;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/;

export const CHANNELS = new Set<ScheduleReminderChannel>(["push", "email"]);

export const WEEK_POSITIONS = new Set<ScheduleWeekPosition>([
  "first",
  "second",
  "third",
  "fourth",
  "last",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string, message: string): InvalidResult {
  return { ok: false, field, message };
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  message: string,
  maxLength?: number,
): NormalizedResult<string> {
  if (typeof value !== "string" || !value.trim()) return invalid(field, message);
  const normalized = value.trim();
  if (maxLength !== undefined && normalized.length > maxLength) {
    return invalid(field, `${field} must be ${maxLength} characters or less`);
  }
  return { ok: true, value: normalized };
}

function normalizeNullableText(
  value: unknown,
  field: string,
  maxLength: number,
): NormalizedResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return invalid(field, `${field} is invalid`);
  if (value.length > maxLength) return invalid(field, `${field} is too long`);
  return { ok: true, value };
}

function normalizeDate(
  value: unknown,
  field: string,
  required: boolean,
): NormalizedResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return required ? invalid(field, `${field} is required`) : { ok: true, value: null };
  }
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return invalid(field, `${field} must be in YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return invalid(field, `${field} must be a valid date`);
  }
  return { ok: true, value };
}

function normalizeTime(
  value: unknown,
  field: string,
): NormalizedResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) {
    return invalid(field, `${field} must be in HH:MM or HH:MM:SS format`);
  }
  const [hour, minute, second = "00"] = value.split(":");
  if (
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return invalid(field, `${field} must be a valid time`);
  }
  return {
    ok: true,
    value: `${hour}:${minute}:${second}`,
  };
}

function normalizeNullableId(
  value: unknown,
  field: string,
): NormalizedResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !value.trim()) {
    return invalid(field, `${field} is invalid`);
  }
  return { ok: true, value: value.trim() };
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function normalizeRecurrenceRule(
  value: unknown,
): NormalizedResult<ScheduleRecurrenceRule | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!isRecord(value) || typeof value.frequency !== "string") {
    return invalid("recurrenceRule", "recurrenceRule is invalid");
  }
  if (!isIntegerInRange(value.interval, 1, 365)) {
    return invalid("recurrenceRule", "recurrenceRule interval is invalid");
  }

  if (value.frequency === "daily") {
    return { ok: true, value: { frequency: "daily", interval: value.interval } };
  }

  if (value.frequency === "weekly") {
    if (
      !Array.isArray(value.daysOfWeek) ||
      value.daysOfWeek.length === 0 ||
      value.daysOfWeek.some((day) => !isIntegerInRange(day, 0, 6))
    ) {
      return invalid("recurrenceRule", "daysOfWeek is invalid");
    }
    return {
      ok: true,
      value: {
        frequency: "weekly",
        interval: value.interval,
        daysOfWeek: [...new Set(value.daysOfWeek)],
      },
    };
  }

  if (value.frequency === "monthly") {
    if (isIntegerInRange(value.dayOfMonth, 1, 31)) {
      return {
        ok: true,
        value: {
          frequency: "monthly",
          interval: value.interval,
          dayOfMonth: value.dayOfMonth,
        },
      };
    }
    if (
      typeof value.weekPosition === "string" &&
      WEEK_POSITIONS.has(value.weekPosition as ScheduleWeekPosition) &&
      isIntegerInRange(value.dayOfWeekMonthly, 0, 6)
    ) {
      return {
        ok: true,
        value: {
          frequency: "monthly",
          interval: value.interval,
          weekPosition: value.weekPosition as ScheduleWeekPosition,
          dayOfWeekMonthly: value.dayOfWeekMonthly,
        },
      };
    }
    return invalid("recurrenceRule", "monthly recurrenceRule is invalid");
  }

  if (
    value.frequency === "yearly" &&
    isIntegerInRange(value.monthOfYear, 1, 12) &&
    isIntegerInRange(value.dayOfMonth, 1, 31)
  ) {
    return {
      ok: true,
      value: {
        frequency: "yearly",
        interval: value.interval,
        monthOfYear: value.monthOfYear,
        dayOfMonth: value.dayOfMonth,
      },
    };
  }

  return invalid("recurrenceRule", "recurrenceRule frequency is invalid");
}

function normalizeReminder(
  value: unknown,
  index: number,
): NormalizedResult<ScheduleCreationRecord["reminders"][number]> {
  if (!isRecord(value) || (value.reminderType !== "relative" && value.reminderType !== "absolute")) {
    return invalid(`reminders[${index}]`, "Reminder type is invalid");
  }
  if (!Array.isArray(value.channels) || value.channels.length === 0) {
    return invalid(`reminders[${index}].channels`, "At least one reminder channel is required");
  }
  const channels: ScheduleReminderChannel[] = [];
  for (const channel of value.channels) {
    if (!CHANNELS.has(channel as ScheduleReminderChannel)) {
      return invalid(`reminders[${index}].channels`, "Reminder channel is invalid");
    }
    if (channels.includes(channel as ScheduleReminderChannel)) {
      return invalid(`reminders[${index}].channels`, "Reminder channels must be unique");
    }
    channels.push(channel as ScheduleReminderChannel);
  }

  if (value.reminderType === "relative") {
    if (!isIntegerInRange(value.relativeMinutes, 0, 525600)) {
      return invalid(
        `reminders[${index}].relativeMinutes`,
        "relativeMinutes must be a non-negative integer",
      );
    }
    return {
      ok: true,
      value: {
        reminderType: "relative",
        relativeMinutes: value.relativeMinutes,
        absoluteTime: null,
        channels,
      },
    };
  }

  if (
    typeof value.absoluteTime !== "string" ||
    !value.absoluteTime.trim() ||
    Number.isNaN(Date.parse(value.absoluteTime))
  ) {
    return invalid(
      `reminders[${index}].absoluteTime`,
      "absoluteTime must be a valid datetime",
    );
  }
  return {
    ok: true,
    value: {
      reminderType: "absolute",
      relativeMinutes: null,
      absoluteTime: value.absoluteTime,
      channels,
    },
  };
}

export function normalizeRequest(
  request: ScheduleCreationRequest,
): NormalizedResult<ScheduleCreationRecord> | { ok: false; outcome: ScheduleCreationOutcome } {
  if (!isRecord(request)) return invalid("request", "Schedule request is required");
  const userId = normalizeRequiredText(
    request.userId,
    "userId",
    "User identity is required",
  );
  if (!userId.ok) return userId;
  if (!isRecord(request.event)) return invalid("event", "Event details are required");

  const eventInput = request.event;
  const title = normalizeRequiredText(eventInput.title, "title", "Title is required", 200);
  if (!title.ok) return title;
  const startDate = normalizeDate(eventInput.startDate, "startDate", true);
  if (!startDate.ok || startDate.value === null) return startDate as InvalidResult;
  const endDate = normalizeDate(eventInput.endDate ?? startDate.value, "endDate", true);
  if (!endDate.ok || endDate.value === null) return endDate as InvalidResult;
  if (endDate.value < startDate.value) {
    return invalid("endDate", "endDate must be on or after startDate");
  }
  const startTime = normalizeTime(eventInput.startTime, "startTime");
  if (!startTime.ok) return startTime;
  const endTime = normalizeTime(eventInput.endTime, "endTime");
  if (!endTime.ok) return endTime;
  if (startTime.value === null && endTime.value !== null) {
    return invalid("endTime", "endTime cannot be set for an all-day event");
  }

  const description = normalizeNullableText(eventInput.description, "description", 2000);
  if (!description.ok) return description;
  const location = normalizeNullableText(eventInput.location, "location", 500);
  if (!location.ok) return location;
  const color = normalizeNullableText(eventInput.color, "color", 50);
  if (!color.ok) return color;
  const categoryId = normalizeNullableId(eventInput.categoryId, "categoryId");
  if (!categoryId.ok) return categoryId;
  const recurringEventId = normalizeNullableId(eventInput.recurringEventId, "recurringEventId");
  if (!recurringEventId.ok) return recurringEventId;
  const originalDate = normalizeDate(eventInput.originalDate, "originalDate", false);
  if (!originalDate.ok) return originalDate;
  const endDateRecurrence = normalizeDate(
    eventInput.endDateRecurrence,
    "endDateRecurrence",
    false,
  );
  if (!endDateRecurrence.ok) return endDateRecurrence;

  const isRecurring = eventInput.isRecurring ?? false;
  if (typeof isRecurring !== "boolean") return invalid("isRecurring", "isRecurring is invalid");
  const recurrenceRule = normalizeRecurrenceRule(eventInput.recurrenceRule);
  if (!recurrenceRule.ok) return recurrenceRule;
  if (isRecurring && recurrenceRule.value === null) {
    return invalid("recurrenceRule", "recurrenceRule is required for recurring events");
  }
  if (!isRecurring && recurrenceRule.value !== null) {
    return invalid("recurrenceRule", "recurrenceRule requires isRecurring");
  }

  const endType = eventInput.endType ?? null;
  if (
    endType !== null &&
    endType !== "never" &&
    endType !== "after_count" &&
    endType !== "on_date"
  ) {
    return invalid("endType", "endType is invalid");
  }
  const endCount = eventInput.endCount ?? null;
  if (endCount !== null && !isIntegerInRange(endCount, 1, 500)) {
    return invalid("endCount", "endCount must be a positive integer");
  }
  if (endType === "after_count" && endCount === null) {
    return invalid("endCount", "endCount is required for after_count recurrence");
  }
  if (endType === "on_date" && endDateRecurrence.value === null) {
    return invalid("endDateRecurrence", "endDateRecurrence is required for on_date recurrence");
  }
  if (
    endDateRecurrence.value !== null &&
    endDateRecurrence.value < startDate.value
  ) {
    return invalid("endDateRecurrence", "endDateRecurrence must be on or after startDate");
  }

  const isException = eventInput.isException ?? recurringEventId.value !== null;
  if (typeof isException !== "boolean") return invalid("isException", "isException is invalid");
  if (isException && recurringEventId.value === null) {
    return invalid("recurringEventId", "recurringEventId is required for an exception");
  }
  if (recurringEventId.value !== null && originalDate.value === null) {
    return invalid("originalDate", "originalDate is required for an exception");
  }

  if (request.reminders !== undefined && !Array.isArray(request.reminders)) {
    return invalid("reminders", "reminders must be an array");
  }
  const reminders: ScheduleCreationRecord["reminders"] = [];
  const seenReminderIntents = new Set<string>();
  for (const [index, input] of (request.reminders ?? []).entries()) {
    const reminder = normalizeReminder(input, index);
    if (!reminder.ok) return reminder;
    const intent = JSON.stringify({
      reminderType: reminder.value.reminderType,
      relativeMinutes: reminder.value.relativeMinutes,
      absoluteTime: reminder.value.absoluteTime,
      channels: [...reminder.value.channels].sort(),
    });
    if (seenReminderIntents.has(intent)) {
      return {
        ok: false,
        outcome: { type: "conflict", resource: "reminder" },
      };
    }
    seenReminderIntents.add(intent);
    reminders.push(reminder.value);
  }

  return {
    ok: true,
    value: {
      userId: userId.value,
      event: {
        title: title.value,
        description: description.value,
        startDate: startDate.value,
        startTime: startTime.value,
        endDate: endDate.value,
        endTime: endTime.value,
        location: location.value,
        color: color.value,
        categoryId: categoryId.value,
        isRecurring,
        recurrenceRule: recurrenceRule.value,
        endType,
        endDateRecurrence: endDateRecurrence.value,
        endCount,
        recurringEventId: recurringEventId.value,
        originalDate: originalDate.value,
        isException,
      },
      reminders,
    },
  };
}
