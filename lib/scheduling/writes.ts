/** Scheduling commands, production composition, and delivery response mapping. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScheduleCreationPersistence,
  ScheduleCreationRequest,
  ScheduleCreationOutcome,
  ScheduleEventRecord,
  ScheduleReminderRecord,
} from "./write-contract";

import { normalizeRequest } from "./write-validation";

import {
  SupabaseSchedulingCreationPersistence,
  toStoredRecurrenceRule,
} from "./schedule-persistence";

export type {
  ScheduleReminderType,
  ScheduleReminderChannel,
  ScheduleReminderStatus,
  ScheduleEndType,
  ScheduleWeekPosition,
  ScheduleRecurrenceRule,
  ScheduleReminderInput,
  ScheduleEventInput,
  ScheduleCreationRequest,
  ScheduleEventRecord,
  ScheduleReminderRecord,
  ScheduleCreationRecord,
  ScheduleCreationPersistenceOutcome,
  ScheduleCreationPersistence,
  ScheduleCreationOutcome,
  CreateScheduleRequest,
  CreateScheduleOutcome,
} from "./write-contract";

export { SupabaseSchedulingCreationPersistence } from "./schedule-persistence";

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

export function createSchedulingWrites(supabase: SupabaseClient): SchedulingWrites {
  return new SchedulingWrites(new SupabaseSchedulingCreationPersistence(supabase));
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
