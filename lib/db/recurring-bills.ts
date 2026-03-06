import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringBill, RecurringBillInsert, RecurringBillUpdate } from "./types";

/**
 * Detected bill from Plaid's recurring transaction streams.
 * Used as input to upsertFromPlaid for syncing detected bills.
 */
export interface DetectedBill {
  plaid_stream_id: string;
  account_id: string;
  merchant_name: string | null;
  description: string;
  amount_cents: number;
  frequency: string;
  predicted_next_date: string | null;
  first_date: string;
  last_date: string;
  is_active: boolean;
  status: string;
  category_primary: string | null;
}

/**
 * Database access class for the recurring_bills table.
 * Follows the same pattern as BudgetsDB (constructor takes SupabaseClient).
 */
export class RecurringBillsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all bills for a household, ordered by next_due_date.
   * Does NOT filter by user_status -- returns all bills so UI can group
   * them into active vs dismissed sections.
   */
  async getByHousehold(householdId: string): Promise<RecurringBill[]> {
    const { data, error } = await this.supabase
      .from("recurring_bills")
      .select("*")
      .eq("household_id", householdId)
      .order("next_due_date", { ascending: true, nullsFirst: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new recurring bill (for manual creation).
   */
  async create(bill: RecurringBillInsert): Promise<RecurringBill> {
    const { data, error } = await this.supabase
      .from("recurring_bills")
      .insert(bill)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update bill fields (name, amount_cents, frequency, next_due_date,
   * user_status, previous_amount_cents).
   */
  async update(id: string, updates: RecurringBillUpdate): Promise<RecurringBill> {
    const { data, error } = await this.supabase
      .from("recurring_bills")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Upsert detected bills from Plaid by plaid_stream_id.
   *
   * For existing bills: updates amount/frequency/predicted_next_date/is_active/plaid_status.
   * If amount changed, sets previous_amount_cents to old amount for price change detection.
   * For new bills: inserts with user_status='auto'.
   */
  async upsertFromPlaid(
    householdId: string,
    bills: DetectedBill[]
  ): Promise<void> {
    if (bills.length === 0) return;

    // Fetch existing bills by plaid_stream_id for price change detection
    const streamIds = bills.map((b) => b.plaid_stream_id);
    const { data: existing, error: fetchError } = await this.supabase
      .from("recurring_bills")
      .select("id, plaid_stream_id, amount_cents")
      .eq("household_id", householdId)
      .in("plaid_stream_id", streamIds);

    if (fetchError) throw fetchError;

    const existingMap = new Map(
      (existing || []).map((b: { plaid_stream_id: string; amount_cents: number }) => [
        b.plaid_stream_id,
        b.amount_cents,
      ])
    );

    const rows = bills.map((bill) => {
      const oldAmount = existingMap.get(bill.plaid_stream_id);
      const amountChanged = oldAmount !== undefined && oldAmount !== bill.amount_cents;

      return {
        household_id: householdId,
        plaid_stream_id: bill.plaid_stream_id,
        account_id: bill.account_id,
        name: bill.merchant_name || bill.description,
        description: bill.description,
        amount_cents: bill.amount_cents,
        frequency: bill.frequency,
        next_due_date: bill.predicted_next_date,
        is_active: bill.is_active,
        plaid_status: bill.status,
        category_primary: bill.category_primary,
        source: "plaid" as const,
        // If amount changed, record the old amount for price change detection
        ...(amountChanged ? { previous_amount_cents: oldAmount } : {}),
      };
    });

    const { error: upsertError } = await this.supabase
      .from("recurring_bills")
      .upsert(rows, {
        onConflict: "household_id,plaid_stream_id",
      });

    if (upsertError) throw upsertError;
  }

  /**
   * Delete a bill.
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("recurring_bills")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }
}
