import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, TransactionInsert } from "./types";

/**
 * Options for filtering and paginating transaction queries.
 */
export interface TransactionQueryOptions {
  /** Filter by account ID */
  accountId?: string;
  /** Filter by source ('plaid' | 'manual') */
  source?: "plaid" | "manual";
  /** Filter by date range start (inclusive, YYYY-MM-DD) */
  dateFrom?: string;
  /** Filter by date range end (inclusive, YYYY-MM-DD) */
  dateTo?: string;
  /** Filter by category */
  category?: string;
  /** Number of records to return (default 50) */
  limit?: number;
  /** Number of records to skip (default 0) */
  offset?: number;
}

/**
 * Database access class for transactions table.
 * Follows the same pattern as HabitsDB (constructor takes SupabaseClient).
 */
export class TransactionsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get transactions for a household with optional filtering and pagination.
   */
  async getByHousehold(
    householdId: string,
    options?: TransactionQueryOptions
  ): Promise<Transaction[]> {
    let query = this.supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (options?.accountId) {
      query = query.eq("account_id", options.accountId);
    }
    if (options?.source) {
      query = query.eq("source", options.source);
    }
    if (options?.dateFrom) {
      query = query.gte("transaction_date", options.dateFrom);
    }
    if (options?.dateTo) {
      query = query.lte("transaction_date", options.dateTo);
    }
    if (options?.category) {
      query = query.eq("category", options.category);
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single transaction by ID.
   */
  async getById(id: string): Promise<Transaction | null> {
    const { data, error } = await this.supabase
      .from("transactions")
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
   * Create a new transaction (typically for manual entry).
   */
  async create(data: TransactionInsert): Promise<Transaction> {
    const { data: result, error } = await this.supabase
      .from("transactions")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Batch upsert Plaid transactions by plaid_transaction_id.
   * Uses onConflict for idempotent sync — safe to call multiple times
   * with the same transactions.
   */
  async upsertPlaidTransactions(
    transactions: TransactionInsert[]
  ): Promise<void> {
    if (transactions.length === 0) return;

    const { error } = await this.supabase
      .from("transactions")
      .upsert(transactions, { onConflict: "plaid_transaction_id" });

    if (error) throw error;
  }

  /**
   * Delete transactions by their Plaid transaction IDs.
   * Used when Plaid reports transactions as removed during sync.
   */
  async deleteByPlaidIds(plaidTransactionIds: string[]): Promise<void> {
    if (plaidTransactionIds.length === 0) return;

    const { error } = await this.supabase
      .from("transactions")
      .delete()
      .in("plaid_transaction_id", plaidTransactionIds);

    if (error) throw error;
  }
}
