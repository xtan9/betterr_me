import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  UserTimeZoneCommand,
  UserTimeZoneOutcome,
} from "@/lib/preferences/commands";

export class UserTimeZoneDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async setUserTimeZone(
    timeZone: UserTimeZoneCommand["timeZone"],
  ): Promise<UserTimeZoneOutcome> {
    const { data, error } = await this.supabase.rpc("set_user_time_zone", {
      time_zone: timeZone,
    });
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as UserTimeZoneOutcome;
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
