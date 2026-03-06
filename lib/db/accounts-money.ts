import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MoneyAccount,
  MoneyAccountInsert,
  AccountVisibility,
  ViewMode,
} from "./types";

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
      owner_id: null,
      visibility: "ours",
      shared_since: null,
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

  /**
   * Get accounts for a household filtered by view mode.
   * - 'mine': returns accounts owned by the user
   * - 'household': returns accounts with visibility 'ours' or 'hidden'
   */
  async getByHouseholdFiltered(
    householdId: string,
    userId: string,
    view: ViewMode
  ): Promise<MoneyAccount[]> {
    let query = this.supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .order("bank_connection_id", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (view === "mine") {
      query = query.eq("owner_id", userId);
    } else {
      // household view: show accounts with visibility 'ours' or 'hidden'
      query = query.in("visibility", ["ours", "hidden"]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Update account visibility.
   * When changing from 'mine' to 'ours': sets shared_since and bulk-hides
   * all existing transactions (historical transactions hidden by default).
   * When changing from 'ours' to 'mine': clears shared_since.
   */
  async updateVisibility(
    accountId: string,
    visibility: AccountVisibility,
    householdId: string
  ): Promise<MoneyAccount> {
    // Get current account to check current visibility
    const current = await this.getById(accountId);
    if (!current) throw new Error("Account not found");

    const updateData: Record<string, unknown> = { visibility };

    if (current.visibility === "mine" && visibility === "ours") {
      // Sharing for the first time: set shared_since, hide historical transactions
      updateData.shared_since = new Date().toISOString();

      // Bulk-hide all existing transactions for this account
      await this.supabase
        .from("transactions")
        .update({ is_hidden_from_household: true })
        .eq("account_id", accountId)
        .eq("household_id", householdId);
    } else if (
      (current.visibility === "ours" || current.visibility === "hidden") &&
      visibility === "mine"
    ) {
      // Unsharing: clear shared_since
      updateData.shared_since = null;
    }

    const { data, error } = await this.supabase
      .from("accounts")
      .update(updateData)
      .eq("id", accountId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
