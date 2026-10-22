import { normalizePreferenceRpcError } from "./preference-rpc-error";
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
    if (error) throw normalizePreferenceRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as AppearancePreferenceOutcome;
  }
}
