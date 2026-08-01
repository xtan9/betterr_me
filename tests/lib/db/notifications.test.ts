import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationsDB } from "@/lib/db/notifications";
import { mockSupabaseClient } from "../../setup";

describe("NotificationsDB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse({
      preferences: {
        email_notifications_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
      },
      timezone: null,
    });
  });

  it("reads only the Notifications preference projection", async () => {
    const db = new NotificationsDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getNotificationPreferenceProjection("user-123")).resolves.toEqual({
      preferences: {
        email_notifications_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
      },
      timezone: null,
    });

    expect(
      mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")
        ?.args[0],
    ).toBe("preferences, timezone");
  });

  it("returns the Notifications-owned Push Quiet Window state", async () => {
    const db = new NotificationsDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    mockSupabaseClient.setMockResponse({
      preferences: { quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
      timezone: "America/Los_Angeles",
    });
    await expect(db.getPushQuietWindow("user-123")).resolves.toEqual({
      pushQuietWindow: {
        status: "ready",
        value: { status: "enabled", startLocal: "22:00", endLocal: "07:00" },
      },
      userTimeZone: { status: "resolved", value: "America/Los_Angeles" },
    });

    mockSupabaseClient.setMockResponse({
      preferences: { quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
      timezone: "not/a-time-zone",
    });
    await expect(db.getPushQuietWindow("user-123")).resolves.toEqual({
      pushQuietWindow: {
        status: "unavailable",
        reason: "userTimeZoneUnresolved",
      },
      userTimeZone: { status: "unresolved" },
    });
  });

  it("reads only the Notifications-owned Reminder Email Preference", async () => {
    const db = new NotificationsDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    mockSupabaseClient.setMockResponse({
      preferences: { email_notifications_enabled: true },
    });

    await expect(
      db.getReminderEmailPreference("user-123", "person@example.test"),
    ).resolves.toEqual({
      status: "ready",
      value: { enabled: true },
    });
    expect(
      mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")
        ?.args[0],
    ).toBe("preferences");
  });

  it("submits the discriminated Notification Intent and returns its owner outcome", async () => {
    const outcome = {
      reminderEmail: { enabled: false },
      preferenceRevision: 4,
      changed: true,
    };
    const rpc = vi.fn().mockResolvedValue({ data: outcome, error: null });
    const db = new NotificationsDB({ rpc } as unknown as SupabaseClient);

    await expect(
      db.setNotificationPreference({
        type: "setReminderEmail",
        enabled: false,
      }),
    ).resolves.toEqual(outcome);
    expect(rpc).toHaveBeenCalledWith("set_notification_preference", {
      intent: { type: "setReminderEmail", enabled: false },
    });
  });

  it("uses the service-only adapter to honor an email unsubscribe", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "user-123" }, error: null });
    const db = new NotificationsDB({ rpc } as unknown as SupabaseClient);

    await expect(db.disableReminderEmail("user-123")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("update_profile_preferences_for_service", {
      profile_id: "user-123",
      preference_patch: { email_notifications_enabled: false },
    });
  });
});
