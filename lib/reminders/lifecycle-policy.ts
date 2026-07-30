export const CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR =
  "Calendar event reminders must be updated through the calendar event lifecycle";

export function isCalendarEventReminder(sourceType: string | undefined) {
  return sourceType === "calendar_event";
}
