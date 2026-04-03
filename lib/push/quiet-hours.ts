/**
 * Quiet hours check for push notifications.
 * Prevents push notifications from being sent during user-configured quiet hours.
 */

/**
 * Check if the current time (in the user's timezone) falls within quiet hours.
 *
 * @param quietStart - Start of quiet hours in HH:MM format, or null/undefined if not configured
 * @param quietEnd - End of quiet hours in HH:MM format, or null/undefined if not configured
 * @param userTimezone - IANA timezone string (e.g. "America/New_York"), or null for UTC
 * @returns true if current time is within quiet hours
 */
export function isInQuietHours(
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined,
  userTimezone: string | null
): boolean {
  if (!quietStart || !quietEnd) return false;

  const tz = userTimezone || "UTC";

  // Get current time in user's timezone as HH:MM
  let currentTime: string;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    currentTime = formatter.format(new Date());
  } catch {
    // Invalid timezone — fall back to not in quiet hours so reminders still dispatch
    return false;
  }

  // Handle overnight wrap: e.g. 22:00-07:00
  if (quietStart > quietEnd) {
    return currentTime >= quietStart || currentTime < quietEnd;
  }

  // Normal same-day range: e.g. 09:00-17:00
  return currentTime >= quietStart && currentTime < quietEnd;
}
