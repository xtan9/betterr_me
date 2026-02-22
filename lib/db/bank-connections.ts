import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankConnection, BankConnectionInsert } from "./types";

/**
 * Database access class for bank_connections table.
 * Follows the same pattern as HabitsDB, TasksDB (constructor takes SupabaseClient).
 */
export class BankConnectionsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all bank connections for a household.
   */
  async getByHousehold(householdId: string): Promise<BankConnection[]> {
    const { data, error } = await this.supabase
      .from("bank_connections")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single bank connection by ID.
   */
  async getById(id: string): Promise<BankConnection | null> {
    const { data, error } = await this.supabase
      .from("bank_connections")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /**
   * Create a new bank connection.
   */
  async create(data: BankConnectionInsert): Promise<BankConnection> {
    const { data: result, error } = await this.supabase
      .from("bank_connections")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Update the status (and optional error info) for a bank connection.
   */
  async updateStatus(
    id: string,
    status: BankConnection["status"],
    errorCode?: string | null,
    errorMessage?: string | null
  ): Promise<BankConnection> {
    const { data, error } = await this.supabase
      .from("bank_connections")
      .update({
        status,
        error_code: errorCode ?? null,
        error_message: errorMessage ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update the sync cursor and last_synced_at timestamp.
   */
  async updateSyncCursor(
    id: string,
    cursor: string,
    lastSyncedAt: string
  ): Promise<BankConnection> {
    const { data, error } = await this.supabase
      .from("bank_connections")
      .update({
        sync_cursor: cursor,
        last_synced_at: lastSyncedAt,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Set a bank connection to disconnected status.
   */
  async disconnect(id: string): Promise<BankConnection> {
    return this.updateStatus(id, "disconnected");
  }
}
