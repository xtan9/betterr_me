import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProfileDetailsCommand,
  ProfileDetailsOutcome,
} from "@/lib/preferences/commands";

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
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as ProfileDetailsOutcome;
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
