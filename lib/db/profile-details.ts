import { normalizePreferenceRpcError } from "./preference-rpc-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileDetailsCommand, ProfileDetailsOutcome } from "@/lib/preferences/commands";

export class ProfileDetailsDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async updateProfileDetails(
    details: ProfileDetailsCommand,
  ): Promise<ProfileDetailsOutcome> {
    const { data, error } = await this.supabase.rpc("update_profile_details", {
      details_patch: {
        ...(details.fullName !== undefined && {
          full_name: details.fullName || null,
        }),
        ...(details.avatarUrl !== undefined && {
          avatar_url: details.avatarUrl || null,
        }),
      },
    });
    if (error) throw normalizePreferenceRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as ProfileDetailsOutcome;
  }
}
