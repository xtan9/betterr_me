import { normalizePreferenceRpcError } from "./preference-rpc-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTimeZoneCommand, UserTimeZoneOutcome } from "@/lib/preferences/commands";

export class UserTimeZoneDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async setUserTimeZone(
    timeZone: UserTimeZoneCommand["timeZone"],
  ): Promise<UserTimeZoneOutcome> {
    const { data, error } = await this.supabase.rpc("set_user_time_zone", {
      time_zone: timeZone,
    });
    if (error) throw normalizePreferenceRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as UserTimeZoneOutcome;
  }
}
