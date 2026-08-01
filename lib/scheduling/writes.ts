import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduleReminderType = "relative" | "absolute";
export type ScheduleReminderChannel = "push" | "email";
export type ScheduleReminderStatus = "pending" | "sent" | "failed" | "snoozed";
export type ScheduleEndType = "never" | "after_count" | "on_date";
export type ScheduleWeekPosition = "first" | "second" | "third" | "fourth" | "last";

export type ScheduleRecurrenceRule =
  | { frequency: "daily"; interval: number }
  | { frequency: "weekly"; interval: number; daysOfWeek: number[] }
  | { frequency: "monthly"; interval: number; dayOfMonth: number }
  | {
      frequency: "monthly";
      interval: number;
      weekPosition: ScheduleWeekPosition;
      dayOfWeekMonthly: number;
    }
  | {
      frequency: "yearly";
      interval: number;
      monthOfYear: number;
      dayOfMonth: number;
    };

export type ScheduleReminderInput =
  | {
      reminderType: "relative";
      relativeMinutes: number;
      channels: readonly ScheduleReminderChannel[];
    }
  | {
      reminderType: "absolute";
      absoluteTime: string;
      channels: readonly ScheduleReminderChannel[];
    };

export interface ScheduleEventInput {
  title: string;
  description?: string | null;
  startDate: string;
  startTime?: string | null;
  endDate?: string;
  endTime?: string | null;
  location?: string | null;
  color?: string | null;
  categoryId?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: ScheduleRecurrenceRule | null;
  endType?: ScheduleEndType | null;
  endDateRecurrence?: string | null;
  endCount?: number | null;
  recurringEventId?: string | null;
  originalDate?: string | null;
  isException?: boolean;
}

export interface ScheduleCreationRequest {
  /** The adapter supplies this from its authenticated principal. */
  userId: string;
  event: ScheduleEventInput;
  reminders?: readonly ScheduleReminderInput[];
}

export interface ScheduleEventRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  location: string | null;
  color: string | null;
  categoryId: string | null;
  isRecurring: boolean;
  recurrenceRule: ScheduleRecurrenceRule | null;
  endType: ScheduleEndType | null;
  endDateRecurrence: string | null;
  endCount: number | null;
  recurringEventId: string | null;
  originalDate: string | null;
  isException: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleReminderRecord {
  id: string;
  userId: string;
  eventId: string;
  reminderType: ScheduleReminderType;
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: ScheduleReminderChannel[];
  status: ScheduleReminderStatus;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface ScheduleCreationRecord {
  userId: string;
  event: Required<
    Omit<ScheduleEventInput, "title" | "startDate" | "endDate">
  > & {
    title: string;
    startDate: string;
    endDate: string;
  };
  reminders: Array<{
    reminderType: ScheduleReminderType;
    relativeMinutes: number | null;
    absoluteTime: string | null;
    channels: ScheduleReminderChannel[];
  }>;
}

export type ScheduleCreationPersistenceOutcome =
  | {
      type: "created";
      event: ScheduleEventRecord;
      reminders: ScheduleReminderRecord[];
    }
  | { type: "not-found"; related?: "category" | "recurringEvent" }
  | { type: "conflict"; resource?: "event" | "reminder"; reason?: string }
  | { type: "invalid"; field: string; message: string };

export interface ScheduleCreationPersistence {
  createSchedule(
    record: ScheduleCreationRecord,
  ): Promise<ScheduleCreationPersistenceOutcome>;
}

export type ScheduleCreationOutcome = ScheduleCreationPersistenceOutcome;
export type CreateScheduleRequest = ScheduleCreationRequest;
export type CreateScheduleOutcome = ScheduleCreationOutcome;

type InvalidResult = { ok: false; field: string; message: string };
type NormalizedResult<T> = { ok: true; value: T } | InvalidResult;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/;
const CHANNELS = new Set<ScheduleReminderChannel>(["push", "email"]);
const WEEK_POSITIONS = new Set<ScheduleWeekPosition>([
  "first",
  "second",
  "third",
  "fourth",
  "last",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
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

function normalizeRequest(
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

export class SchedulingWrites {
  constructor(private readonly persistence: ScheduleCreationPersistence) {}

  async create(request: ScheduleCreationRequest): Promise<ScheduleCreationOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      if ("outcome" in normalized) return normalized.outcome;
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }
    return this.persistence.createSchedule(normalized.value);
  }
}

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

export function createSchedulingWrites(supabase: SupabaseClient): SchedulingWrites {
  return new SchedulingWrites(new SupabaseSchedulingCreationPersistence(supabase));
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

function toStoredRecurrenceRule(rule: ScheduleRecurrenceRule): Record<string, unknown> {
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

export function toCalendarEventResponse(event: ScheduleEventRecord) {
  return {
    id: event.id,
    user_id: event.userId,
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
    recurrence_rule: event.recurrenceRule
      ? toStoredRecurrenceRule(event.recurrenceRule)
      : null,
    end_type: event.endType,
    end_date_recurrence: event.endDateRecurrence,
    end_count: event.endCount,
    recurring_event_id: event.recurringEventId,
    original_date: event.originalDate,
    is_exception: event.isException,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}

export function toReminderResponse(reminder: ScheduleReminderRecord) {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    source_type: "calendar_event" as const,
    source_id: reminder.eventId,
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
    status: reminder.status,
    fire_at: reminder.fireAt,
    sent_at: reminder.sentAt,
    created_at: reminder.createdAt,
  };
}
