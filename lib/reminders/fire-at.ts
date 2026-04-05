/**
 * Utility for computing reminder fire_at timestamps.
 *
 * - Relative reminders: subtract relative_minutes from the event start time.
 * - Absolute reminders: use the absolute_time directly.
 */

export interface FireAtInput {
  reminder_type: "relative" | "absolute";
  relative_minutes: number | null;
  absolute_time: string | null;
}

/**
 * Compute the fire_at ISO timestamp for a reminder.
 *
 * @param reminder - The reminder input (type + relative_minutes or absolute_time)
 * @param eventStartISO - The event's start time as an ISO 8601 string
 * @returns ISO 8601 timestamp string for when the reminder should fire
 * @throws Error if required fields are missing for the given reminder_type
 */
export function computeFireAt(
  reminder: FireAtInput,
  eventStartISO: string
): string {
  if (
    reminder.reminder_type === "absolute" &&
    reminder.absolute_time != null
  ) {
    return new Date(reminder.absolute_time).toISOString();
  }

  if (
    reminder.reminder_type === "relative" &&
    reminder.relative_minutes != null
  ) {
    const start = new Date(eventStartISO);
    start.setTime(start.getTime() - reminder.relative_minutes * 60 * 1000);
    return start.toISOString();
  }

  throw new Error(
    "Invalid reminder: missing relative_minutes or absolute_time"
  );
}
