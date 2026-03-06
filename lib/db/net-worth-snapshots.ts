import type { SupabaseClient } from "@supabase/supabase-js";
import type { NetWorthSnapshot } from "./types";

/**
 * Database access class for the net_worth_snapshots table.
 * Follows the same pattern as BudgetsDB (constructor takes SupabaseClient).
 */
export class NetWorthSnapshotsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Upsert a net worth snapshot (one per household per day).
   * Uses Supabase .upsert() which maps to ON CONFLICT on the
   * (household_id, snapshot_date) unique constraint.
   */
  async upsert(
    householdId: string,
    date: string,
    totalCents: number,
    assetsCents: number,
    liabilitiesCents: number
  ): Promise<NetWorthSnapshot> {
    const { data, error } = await this.supabase
      .from("net_worth_snapshots")
      .upsert(
        {
          household_id: householdId,
          snapshot_date: date,
          total_cents: totalCents,
          assets_cents: assetsCents,
          liabilities_cents: liabilitiesCents,
        },
        { onConflict: "household_id,snapshot_date" }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get snapshots in a date range, ordered by snapshot_date ASC for chart display.
   */
  async getHistory(
    householdId: string,
    fromDate: string,
    toDate: string
  ): Promise<NetWorthSnapshot[]> {
    const { data, error } = await this.supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .gte("snapshot_date", fromDate)
      .lte("snapshot_date", toDate)
      .order("snapshot_date", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get the most recent snapshot for a household.
   */
  async getLatest(householdId: string): Promise<NetWorthSnapshot | null> {
    const { data, error } = await this.supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }
    return data;
  }
}
