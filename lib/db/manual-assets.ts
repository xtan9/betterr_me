import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualAsset, ManualAssetInsert, ManualAssetUpdate } from "./types";

/**
 * Database access class for the manual_assets table.
 * Follows the same pattern as BudgetsDB (constructor takes SupabaseClient).
 */
export class ManualAssetsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all manual assets for a household.
   */
  async getByHousehold(householdId: string): Promise<ManualAsset[]> {
    const { data, error } = await this.supabase
      .from("manual_assets")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new manual asset.
   */
  async create(asset: ManualAssetInsert): Promise<ManualAsset> {
    const { data, error } = await this.supabase
      .from("manual_assets")
      .insert(asset)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a manual asset.
   */
  async update(id: string, updates: ManualAssetUpdate): Promise<ManualAsset> {
    const { data, error } = await this.supabase
      .from("manual_assets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a manual asset.
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("manual_assets")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }
}
