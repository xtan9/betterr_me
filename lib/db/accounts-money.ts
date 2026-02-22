import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoneyAccount, MoneyAccountInsert } from "./types";

/**
 * Database access class for accounts table (money accounts).
 * Named MoneyAccountsDB to avoid collision with authentication Account concepts.
 * Follows the same pattern as HabitsDB (constructor takes SupabaseClient).
 */
export class MoneyAccountsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all accounts for a household, ordered by bank_connection_id then name.
   */
  async getByHousehold(householdId: string): Promise<MoneyAccount[]> {
    const { data, error } = await this.supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .order("bank_connection_id", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all accounts for a specific bank connection.
   */
  async getByBankConnection(bankConnectionId: string): Promise<MoneyAccount[]> {
    const { data, error } = await this.supabase
      .from("accounts")
      .select("*")
      .eq("bank_connection_id", bankConnectionId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single account by ID.
   */
  async getById(id: string): Promise<MoneyAccount | null> {
    const { data, error } = await this.supabase
      .from("accounts")
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
   * Create a new account.
   */
  async create(data: MoneyAccountInsert): Promise<MoneyAccount> {
    const { data: result, error } = await this.supabase
      .from("accounts")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Update the balance for an account.
   */
  async updateBalance(id: string, balanceCents: number): Promise<MoneyAccount> {
    const { data, error } = await this.supabase
      .from("accounts")
      .update({ balance_cents: balanceCents })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get the Cash pseudo-account for a household.
   * The Cash account has no bank_connection_id and name='Cash'.
   * Returns null if no Cash account exists yet (lazy-created on first manual entry).
   */
  async getCashAccount(householdId: string): Promise<MoneyAccount | null> {
    const { data, error } = await this.supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .is("bank_connection_id", null)
      .eq("name", "Cash")
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /**
   * Find or create the Cash pseudo-account for a household.
   * Used when a manual transaction targets "cash" instead of a linked bank account.
   */
  async findOrCreateCash(householdId: string): Promise<MoneyAccount> {
    const existing = await this.getCashAccount(householdId);
    if (existing) return existing;

    return this.create({
      household_id: householdId,
      bank_connection_id: null,
      name: "Cash",
      account_type: "other",
      balance_cents: 0,
      currency: "USD",
      is_hidden: false,
      plaid_account_id: null,
      official_name: null,
      mask: null,
      subtype: null,
    });
  }
}
