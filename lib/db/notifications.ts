import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationPreferenceIntent,
  NotificationPreferenceOutcome,
} from "@/lib/preferences/commands";
import {
  decodeReminderEmailPreference,
  decodePushQuietWindow,
  decodeUserTimeZone,
} from "@/lib/preferences/owners";
import type {
  NotificationPreferences,
  PreferenceStorage,
  UserTimeZone,
} from "@/lib/preferences/types";

export interface NotificationPreferenceProjection {
  preferences: PreferenceStorage;
  timezone: string | null;
}

export class NotificationsDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async getNotificationPreferenceProjection(
    userId: string,
  ): Promise<NotificationPreferenceProjection | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("preferences, timezone")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data as NotificationPreferenceProjection | null;
  }

  async getPushQuietWindow(userId: string): Promise<{
    pushQuietWindow: NotificationPreferences["pushQuietWindow"];
    userTimeZone: UserTimeZone;
  } | null> {
    const projection = await this.getNotificationPreferenceProjection(userId);
    if (!projection) return null;

    const userTimeZone = decodeUserTimeZone(projection.timezone);
    return {
      pushQuietWindow: decodePushQuietWindow(
        projection.preferences,
        userTimeZone,
      ),
      userTimeZone,
    };
  }

  async getReminderEmailPreference(
    userId: string,
    identityEmail: string | null,
  ): Promise<NotificationPreferences["reminderEmail"] | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    if (!data) return null;

    return decodeReminderEmailPreference(
      (data as { preferences: PreferenceStorage }).preferences,
      identityEmail,
    );
  }

  async setNotificationPreference(
    intent: NotificationPreferenceIntent,
  ): Promise<NotificationPreferenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "set_notification_preference",
      { intent },
    );
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as NotificationPreferenceOutcome;
  }

  async disableReminderEmail(userId: string): Promise<void> {
    const { data, error } = await this.supabase.rpc(
      "update_profile_preferences_for_service",
      {
        profile_id: userId,
        preference_patch: { email_notifications_enabled: false },
      },
    );
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
  }

  private normalizeRpcError(error: unknown) {
    const normalized = new Error(
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error),
    );
    if (typeof error === "object" && error !== null && "code" in error) {
      Object.assign(normalized, { code: (error as { code: unknown }).code });
    }
    return normalized;
  }
}
