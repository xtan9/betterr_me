import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RemindersDB } from "@/lib/db/reminders";
import { ProfilesDB } from "@/lib/db/profiles";
import { sendPushNotification } from "@/lib/push/send";
import { sendReminderEmail } from "@/lib/email/send";
import { isInQuietHours } from "@/lib/push/quiet-hours";
import { getVapidDetails } from "@/lib/push/vapid";
import { log } from "@/lib/logger";

/** Max age (ms) before a pending reminder is considered stale and marked failed */
const MAX_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours
const SUPPORTED_REMINDER_SOURCE_TYPES = new Set(["calendar_event", "task", "habit"]);

function secureCompare(a: string, b: string): boolean {
  const key = "cron-auth-compare";
  const hmacA = createHmac("sha256", key).update(a).digest();
  const hmacB = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

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
    // Verify CRON_SECRET (HMAC-based timing-safe comparison)
    if (!process.env.CRON_SECRET) {
      log.error("CRON_SECRET environment variable is not set");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

    if (!secureCompare(authHeader, expectedToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const remindersDB = new RemindersDB(adminClient);
    const profilesDB = new ProfilesDB(adminClient);

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
        if (!SUPPORTED_REMINDER_SOURCE_TYPES.has(reminder.source_type)) {
          await remindersDB.updateReminderStatus(
            reminder.user_id,
            reminder.id,
            "failed",
          );
          failed++;
          log.warn("Unsupported reminder source retired", {
            reminderId: reminder.id,
            userId: reminder.user_id,
            sourceType: reminder.source_type,
          });
          continue;
        }

        // Check staleness: skip reminders whose fire_at is too old
        const fireAtAge = Date.now() - new Date(reminder.fire_at).getTime();

        // Fetch user profile for quiet hours and timezone
        const profile = await profilesDB.getProfile(reminder.user_id);
        const inQuietHours = isInQuietHours(
          profile?.preferences?.quiet_hours_start,
          profile?.preferences?.quiet_hours_end,
          profile?.timezone ?? null
        );

        // Determine which channels to dispatch
        const channelsToSend = reminder.channels.filter(
          (ch) => ch === "email" || (ch === "push" && !inQuietHours && vapidAvailable)
        );

        // If no channels can be dispatched (push-only during quiet hours), skip
        if (channelsToSend.length === 0) {
          // If stale beyond threshold, mark as failed instead of retrying forever
          if (fireAtAge > MAX_STALE_MS) {
            await remindersDB.updateReminderStatus(reminder.user_id, reminder.id, "failed");
            failed++;
            log.warn("Stale reminder expired during quiet hours", {
              reminderId: reminder.id,
              userId: reminder.user_id,
              ageHours: Math.round(fireAtAge / 3600000),
            });
          } else {
            skippedQuietHours++;
          }
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
          try {
            await remindersDB.updateReminderStatus(
              reminder.user_id,
              reminder.id,
              "sent",
              new Date().toISOString()
            );
          } catch (statusError) {
            // Notification already sent — log but don't re-dispatch on next run risk
            log.error("Failed to mark reminder as sent (may cause duplicate)", statusError, {
              reminderId: reminder.id,
              userId: reminder.user_id,
            });
          }
          dispatched++;
        } else {
          await remindersDB.updateReminderStatus(
            reminder.user_id,
            reminder.id,
            "failed"
          );
          failed++;
        }
      } catch (error) {
        // Error isolation: one reminder failure doesn't stop the batch
        failed++;
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
