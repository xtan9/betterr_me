import type { SupabaseClient } from "@supabase/supabase-js";
import { isWeightUnitPreference } from "@/lib/preferences/owners";
import type {
  FitnessPreferenceIntent,
  FitnessPreferenceOutcome,
} from "@/lib/preferences/commands";
import type { WeightUnitPreference } from "@/lib/preferences/types";

export class FitnessDB {
  constructor(private readonly supabase: SupabaseClient) {}

  async getWeightUnitPreference(
    userId: string,
  ): Promise<WeightUnitPreference | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("weight_unit:preferences->>weight_unit")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    const value = (data as { weight_unit?: unknown } | null)?.weight_unit;
    return isWeightUnitPreference(value) ? value : null;
  }

  async setFitnessPreference(
    weightUnit: FitnessPreferenceIntent["weightUnit"],
  ): Promise<FitnessPreferenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "set_fitness_preference",
      { weight_unit: weightUnit },
    );
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as FitnessPreferenceOutcome;
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
