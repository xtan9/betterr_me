import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransactionSplit, TransactionSplitInsert } from "./types";

/**
 * Database access class for the transaction_splits table.
 * Supports splitting a single transaction across multiple categories.
 */
export class TransactionSplitsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all splits for a transaction, joined with categories for display.
   */
  async getByTransaction(
    transactionId: string
  ): Promise<(TransactionSplit & { category: { name: string; icon: string | null; display_name: string | null } })[]> {
    const { data, error } = await this.supabase
      .from("transaction_splits")
      .select("*, category:categories(name, icon, display_name)")
      .eq("transaction_id", transactionId)
      .order("amount_cents", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Batch insert splits for a transaction.
   * Caller must validate that split amounts sum to the original transaction amount.
   */
  async create(splits: TransactionSplitInsert[]): Promise<TransactionSplit[]> {
    if (splits.length === 0) return [];

    const { data, error } = await this.supabase
      .from("transaction_splits")
      .insert(splits)
      .select();

    if (error) throw error;
    return data || [];
  }

  /**
   * Delete all splits for a transaction (used before re-splitting).
   */
  async deleteByTransaction(transactionId: string): Promise<void> {
    const { error } = await this.supabase
      .from("transaction_splits")
      .delete()
      .eq("transaction_id", transactionId);

    if (error) throw error;
  }
}
