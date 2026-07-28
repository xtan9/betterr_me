import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarEvent,
  CalendarEventInsert,
  Reminder,
  ReminderChannel,
  ReminderType,
} from "@/lib/db/types";

export interface RequestedEventReminder {
  reminder_type: ReminderType;
  relative_minutes: number | null;
  absolute_time: string | null;
  channels: ReminderChannel[];
}

export interface CreateScheduleRequest {
  event: Omit<CalendarEventInsert, "user_id">;
  reminders?: RequestedEventReminder[];
}

export interface CreateScheduleOutcome {
  event: CalendarEvent;
  reminders: Reminder[];
}

/**
 * Creates an event and its requested reminders as one database transaction.
 * The RPC is the transaction boundary: it either returns the complete schedule
 * or raises, rolling back every insert made by the function.
 */
export class SchedulingLifecycle {
  constructor(private supabase: SupabaseClient) {}

  async create(
    userId: string,
    request: CreateScheduleRequest,
  ): Promise<CreateScheduleOutcome> {
    const { data, error } = await this.supabase.rpc(
      "create_calendar_event_with_reminder",
      {
        p_user_id: userId,
        p_event: request.event,
        p_reminders: request.reminders ?? [],
      },
    );

    if (error) throw error;
    return data as CreateScheduleOutcome;
  }
}
