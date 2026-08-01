import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarEvent,
  Reminder,
  ReminderChannel,
  ReminderType,
} from "@/lib/db/types";
import type { CalendarEventUpdateValues } from "@/lib/validations/calendar-events";
import {
  createSchedulingWrites,
  type CreateScheduleRequest,
  type CreateScheduleOutcome,
} from "./writes";

export {
  createSchedulingWrites,
  SchedulingWrites,
  SupabaseSchedulingCreationPersistence,
  toCalendarEventResponse,
  toReminderResponse,
} from "./writes";
export type {
  CreateScheduleRequest,
  CreateScheduleOutcome,
  ScheduleCreationOutcome,
  ScheduleCreationPersistence,
  ScheduleCreationPersistenceOutcome,
  ScheduleCreationRecord,
  ScheduleEventInput,
  ScheduleEventRecord,
  ScheduleReminderInput,
  ScheduleReminderRecord,
  ScheduleRecurrenceRule,
} from "./writes";

export interface RequestedEventReminder {
  reminder_type: ReminderType;
  relative_minutes: number | null;
  absolute_time: string | null;
  channels: ReminderChannel[];
}

export interface UpdateScheduleRequest {
  event: Omit<CalendarEventUpdateValues, "reminders">;
  /**
   * Omitted means preserve the existing reminder intent. An empty array
   * explicitly removes every reminder from the event.
   */
  reminders?: RequestedEventReminder[];
}

export interface UpdateScheduleOutcome {
  event: CalendarEvent;
  reminders: Reminder[];
}

export interface DeleteScheduleOutcome {
  event_id: string;
  deleted: boolean;
  reminders_deleted: number;
}

/**
 * Coordinates event and reminder changes through database transaction
 * boundaries so callers receive one complete lifecycle outcome.
 */
export class SchedulingLifecycle {
  constructor(private supabase: SupabaseClient) {}

  async create(
    request: CreateScheduleRequest,
  ): Promise<CreateScheduleOutcome> {
    return createSchedulingWrites(this.supabase).create(request);
  }

  async update(
    userId: string,
    eventId: string,
    request: UpdateScheduleRequest,
  ): Promise<UpdateScheduleOutcome> {
    const { data, error } = await this.supabase.rpc(
      "update_calendar_event_with_reminders",
      {
        p_user_id: userId,
        p_event_id: eventId,
        p_event: request.event,
        p_reminders: request.reminders ?? null,
      },
    );

    if (error) throw error;
    return data as UpdateScheduleOutcome;
  }

  async delete(
    userId: string,
    eventId: string,
  ): Promise<DeleteScheduleOutcome> {
    const { data, error } = await this.supabase.rpc(
      "delete_calendar_event_with_reminders",
      {
        p_user_id: userId,
        p_event_id: eventId,
      },
    );

    if (error) throw error;
    return data as DeleteScheduleOutcome;
  }
}
