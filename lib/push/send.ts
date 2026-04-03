/**
 * Push notification send utility.
 * Dispatches web push notifications to all of a user's registered subscriptions.
 * Handles expired subscription cleanup (410 Gone) and error isolation.
 */

import webpush from "web-push";
import { getVapidDetails } from "@/lib/push/vapid";
import { getNotificationUrl } from "@/lib/push/notification-urls";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import type { ReminderSourceType } from "@/lib/db/types";

export interface PushPayload {
  title: string;
  body: string;
  sourceType: ReminderSourceType;
  sourceId?: string;
  date?: string;
}

/**
 * Send a push notification to all of a user's registered push subscriptions.
 *
 * @param userId - The user whose subscriptions to send to
 * @param payload - Notification content (title, body, source info)
 * @returns Counts of sent and failed notifications
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const vapid = getVapidDetails();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const supabase = createAdminClient();
  const pushSubsDB = new PushSubscriptionsDB(supabase);
  const subscriptions = await pushSubsDB.getSubscriptions(userId);

  const url = getNotificationUrl(payload.sourceType, { date: payload.date });
  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url,
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        notificationPayload
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      const statusCode = (error as { statusCode?: number }).statusCode;

      if (statusCode === 410) {
        // Subscription expired — clean it up
        try {
          await pushSubsDB.deleteSubscription(userId, sub.endpoint);
        } catch (deleteError) {
          log.error("Failed to delete expired push subscription", deleteError, {
            userId,
            endpoint: sub.endpoint,
          });
        }
      } else {
        log.error("Push notification send failed", error, {
          userId,
          endpoint: sub.endpoint,
        });
      }
    }
  }

  return { sent, failed };
}
