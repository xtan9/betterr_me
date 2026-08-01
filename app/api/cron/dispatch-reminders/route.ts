import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { RemindersDB } from "@/lib/db/reminders";
import { NotificationsDB } from "@/lib/db/notifications";
import { sendPushNotification } from "@/lib/push/send";
import { sendReminderEmail } from "@/lib/email/send";
import { isPushQuietWindowActive } from "@/lib/preferences/push-quiet-window";
import { getVapidDetails } from "@/lib/push/vapid";
import { log } from "@/lib/logger";
import {
  isSupportedSourceType,
  trustedOperationalDispatchContext,
} from "@/lib/reminders/delivery";
import { createReminderDelivery } from "@/lib/reminders/delivery-service";

/**
 * GET /api/cron/dispatch-reminders
 * Vercel Cron job: dispatch pending reminders via push and email channels.
 * Runs every minute. Protected by CRON_SECRET bearer token.
 *
 * - Push notifications respect quiet hours (skipped if in quiet hours)
 * - Email is exempt from quiet hours (always dispatched)
 * - Failed deliveries are marked status='failed'
 * - Successful deliveries are marked status='sent' with sent_at timestamp
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = authorizeCronRequest(request.headers.get("Authorization"));
    if (!authorization.ok) {
      if (authorization.status === 500) {
        log.error("CRON_SECRET environment variable is not set");
      }
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }

    const adminClient = createAdminClient();
    const remindersDB = new RemindersDB(adminClient);
    const reminderDelivery = createReminderDelivery(adminClient);
    const notificationsDB = new NotificationsDB(adminClient);

    const now = new Date().toISOString();
    const pending = await remindersDB.getPendingReminders(now);

    // Check VAPID keys once before the loop to avoid N identical errors
    let vapidAvailable = false;
    try {
      getVapidDetails();
      vapidAvailable = true;
    } catch {
      log.warn("VAPID keys not configured — push notifications will be skipped");
    }

    let dispatched = 0;
    let failed = 0;
    let skippedQuietHours = 0;

    for (const reminder of pending) {
      try {
        // Retire legacy rows defensively if they are encountered before the
        // forward migration has run in a deployment environment.
        if (!isSupportedSourceType(reminder.source_type)) {
          const retirement = await reminderDelivery.transition({
            reminderId: reminder.id,
            context: trustedOperationalDispatchContext(reminder.user_id),
            transition: { type: "retire-unsupported-source" },
          });
          failed++;
          if (!isAppliedDeliveryOutcome(retirement)) {
            log.warn("Unsupported reminder source could not be retired", {
              reminderId: reminder.id,
              userId: reminder.user_id,
              sourceType: reminder.source_type,
              outcome: retirement.type,
            });
          }
          log.warn("Unsupported reminder source retired", {
            reminderId: reminder.id,
            userId: reminder.user_id,
            sourceType: reminder.source_type,
          });
          continue;
        }

        // Let the shared state machine decide whether the delivery is stale.
        // An invalid transition here means the reminder is still within the
        // retry horizon; every other non-success outcome is a real dispatch
        // failure and must not be sent again in this batch.
        const stale = await reminderDelivery.transition({
          reminderId: reminder.id,
          context: trustedOperationalDispatchContext(reminder.user_id),
          transition: { type: "stale" },
        });
        if (isAppliedDeliveryOutcome(stale)) {
          failed++;
          continue;
        }
        if (stale.type !== "invalid-transition") {
          failed++;
          log.warn("Stale reminder could not be evaluated", {
            reminderId: reminder.id,
            userId: reminder.user_id,
            outcome: stale.type,
          });
          continue;
        }

        // Read only the Notifications-owned Push Quiet Window state. An
        // unavailable legacy window fails open for push while remaining
        // visible as unavailable through Current Profile.
        const pushQuietWindow = await notificationsDB.getPushQuietWindow(
          reminder.user_id,
        );
        const inQuietHours = isPushQuietWindowActive(
          pushQuietWindow?.pushQuietWindow,
          pushQuietWindow?.userTimeZone,
        );

        // Determine which channels to dispatch
        const channelsToSend = reminder.channels.filter(
          (ch) => ch === "email" || (ch === "push" && !inQuietHours && vapidAvailable)
        );

        // If no channels can be dispatched (push-only during quiet hours), skip
        if (channelsToSend.length === 0) {
          skippedQuietHours++;
          continue;
        }

        let pushSuccess = false;
        let emailSuccess = false;

        // Dispatch push channel
        if (channelsToSend.includes("push")) {
          const sourceLabel = reminder.source_type.replace(/_/g, " ");
          const result = await sendPushNotification(reminder.user_id, {
            title: "Reminder",
            body: `Reminder for your ${sourceLabel}`,
            sourceType: reminder.source_type,
            sourceId: reminder.source_id,
            date: reminder.fire_at.split("T")[0],
          }, adminClient);
          pushSuccess = result.sent > 0;
        }

        // Dispatch email channel
        if (channelsToSend.includes("email")) {
          const sourceLabel = reminder.source_type.replace(/_/g, " ");
          const result = await sendReminderEmail(reminder.user_id, {
            sourceType: reminder.source_type,
            itemName: sourceLabel,
            date: reminder.fire_at.split("T")[0],
          });
          emailSuccess = result.success && !result.skipped;
          if (!result.success && result.error) {
            log.error("Email dispatch failed", result.error, { reminderId: reminder.id });
          }
        }

        // Update reminder status based on dispatch results
        if (pushSuccess || emailSuccess) {
          const sent = await reminderDelivery.transition({
            reminderId: reminder.id,
            context: trustedOperationalDispatchContext(reminder.user_id),
            transition: { type: "sent", sentAt: new Date().toISOString() },
          });
          if (!isAppliedDeliveryOutcome(sent)) {
            // Notification already sent — log but don't re-dispatch on next run risk
            log.error("Failed to mark reminder as sent (may cause duplicate)", sent, {
              reminderId: reminder.id,
              userId: reminder.user_id,
            });
          }
          dispatched++;
        } else {
          const failure = await reminderDelivery.transition({
            reminderId: reminder.id,
            context: trustedOperationalDispatchContext(reminder.user_id),
            transition: { type: "failed" },
          });
          if (!isAppliedDeliveryOutcome(failure)) {
            log.error("Failed to mark reminder delivery as failed", failure, {
              reminderId: reminder.id,
              userId: reminder.user_id,
            });
          }
          failed++;
        }
      } catch (error) {
        // Error isolation: one reminder failure doesn't stop the batch
        failed++;
        try {
          const failure = await reminderDelivery.transition({
            reminderId: reminder.id,
            context: trustedOperationalDispatchContext(reminder.user_id),
            transition: { type: "failed" },
          });
          if (!isAppliedDeliveryOutcome(failure)) {
            log.error("Failed to record reminder delivery failure", failure, {
              reminderId: reminder.id,
              userId: reminder.user_id,
            });
          }
        } catch (failureError) {
          log.error("Failed to record reminder delivery failure", failureError, {
            reminderId: reminder.id,
            userId: reminder.user_id,
          });
        }
        log.error("Failed to dispatch reminder", error, {
          reminderId: reminder.id,
          userId: reminder.user_id,
        });
      }
    }

    log.info("Cron dispatch completed", { dispatched, failed, skippedQuietHours });
    return NextResponse.json({
      dispatched,
      failed,
      skipped_quiet_hours: skippedQuietHours,
    });
  } catch (error) {
    log.error("GET /api/cron/dispatch-reminders error", error);
    return NextResponse.json(
      { error: "Cron dispatch failed" },
      { status: 500 }
    );
  }
}

function isAppliedDeliveryOutcome(
  outcome: { type: string },
): boolean {
  return outcome.type === "transitioned" || outcome.type === "already-applied";
}
