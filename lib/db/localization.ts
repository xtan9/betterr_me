import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LocalizationPreferenceIntent,
  LocalizationPreferenceOutcome,
} from "@/lib/preferences/commands";
import type { WeekStartPreference } from "@/lib/preferences/types";

export class LocalizationDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async getWeekStartPreference(
    userId: string,
  ): Promise<WeekStartPreference | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("week_start:preferences->>week_start_day")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    const value = (data as { week_start?: unknown } | null)?.week_start;
    return value === 0 || value === "0"
      ? "sunday"
      : value === 1 || value === "1"
        ? "monday"
        : null;
  }

  async setWeekStartPreference(
    weekStart: LocalizationPreferenceIntent["weekStart"],
  ): Promise<LocalizationPreferenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "set_localization_preference",
      { week_start: weekStart },
    );
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as LocalizationPreferenceOutcome;
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
