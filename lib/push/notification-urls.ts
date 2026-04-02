/**
 * Shared URL map for push notification click navigation.
 * Used when constructing notification payloads (send time)
 * so the service worker's notificationclick handler can
 * navigate to the correct page via data.url.
 */

export type NotificationSourceType =
  | "calendar_event"
  | "task"
  | "habit"
  | "bill";

export function getNotificationUrl(
  sourceType: NotificationSourceType,
  context?: { date?: string }
): string {
  switch (sourceType) {
    case "calendar_event":
      return context?.date ? `/calendar?date=${context.date}` : "/calendar";
    case "task":
      return "/tasks";
    case "habit":
      return "/habits";
    case "bill":
      return "/money/bills";
    default:
      return "/dashboard";
  }
}
