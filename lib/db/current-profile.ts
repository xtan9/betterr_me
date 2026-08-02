import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfileProjection } from "@/lib/current-profile";
import type { PreferenceStorage } from "@/lib/preferences/types";

/** The only storage read used to compose the canonical Current Profile. */
export class CurrentProfileDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCurrentProfileProjection(
    userId: string,
  ): Promise<CurrentProfileProjection | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("full_name, avatar_url, timezone, preferences, preference_revision")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    if (!data) return null;

    return {
      full_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
      timezone: data.timezone ?? null,
      preferences: data.preferences as PreferenceStorage,
      preference_revision: data.preference_revision,
    };
  }
}
