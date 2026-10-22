import { normalizePreferenceRpcError } from "./preference-rpc-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWeightUnitPreference } from "@/lib/preferences/owners";
import type { FitnessPreferenceIntent, FitnessPreferenceOutcome } from "@/lib/preferences/commands";
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
    if (error) throw normalizePreferenceRpcError(error);
    if (!data) throw new Error("Profile not found");
    return data as FitnessPreferenceOutcome;
  }
}
