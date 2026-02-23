import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, TransactionInsert } from "./types";

/**
 * Escape special ILIKE pattern characters (% and _) in user input.
 */
export function escapeIlike(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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
  /** Filter by category (text column) */
  category?: string;
  /** Filter by category_id (UUID FK) */
  categoryId?: string;
  /** Keyword search across description and merchant_name */
  search?: string;
  /** Minimum amount in cents (inclusive) */
  amountMin?: number;
  /** Maximum amount in cents (inclusive) */
  amountMax?: number;
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
   * Returns transactions array and total count for pagination.
   */
  async getByHousehold(
    householdId: string,
    options?: TransactionQueryOptions
  ): Promise<{ transactions: Transaction[]; total: number }> {
    let query = this.supabase
      .from("transactions")
      .select("*", { count: "exact" })
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
    if (options?.categoryId) {
      query = query.eq("category_id", options.categoryId);
    }
    if (options?.search) {
      const escaped = escapeIlike(options.search);
      query = query.or(
        `description.ilike.%${escaped}%,merchant_name.ilike.%${escaped}%`
      );
    }
    if (options?.amountMin !== undefined) {
      query = query.gte("amount_cents", options.amountMin);
    }
    if (options?.amountMax !== undefined) {
      query = query.lte("amount_cents", options.amountMax);
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;
    return { transactions: data || [], total: count ?? 0 };
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

  /**
   * Update transaction fields (category_id, notes, category).
   * Returns the updated transaction.
   */
  async update(
    id: string,
    data: Partial<Pick<Transaction, "category_id" | "notes" | "category">>
  ): Promise<Transaction> {
    const { data: result, error } = await this.supabase
      .from("transactions")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return result;
  }
}
