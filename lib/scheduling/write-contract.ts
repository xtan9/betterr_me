/** Transport-neutral Schedule creation, reminder, and persistence contracts. */

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
