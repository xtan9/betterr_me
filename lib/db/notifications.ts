import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationPreferenceIntent,
  NotificationPreferenceOutcome,
} from "@/lib/preferences/commands";
import type { PreferenceStorage } from "@/lib/preferences/types";

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
