import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppearancePreferenceIntent,
  AppearancePreferenceOutcome,
} from "@/lib/preferences/commands";

export class AppearanceDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async setAppearancePreference(
    theme: AppearancePreferenceIntent["theme"],
  ): Promise<AppearancePreferenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "set_appearance_preference",
      { theme },
    );
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as AppearancePreferenceOutcome;
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
