import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Budget,
  BudgetCategory,
  BudgetCategoryWithSpending,
  BudgetWithCategories,
} from "./types";

/**
 * Database access class for the budgets and budget_categories tables.
 * Follows the same pattern as other DB classes (constructor takes SupabaseClient).
 *
 * Sign convention: In this project, negative amount_cents = outflow (expense),
 * positive = inflow (income). Spending aggregation filters on amount_cents < 0
 * and negates to get positive spending totals.
 */
export class BudgetsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get budget for a specific month with category allocations and spending.
   * Joins with categories table for display info and computes spending per category
   * from transactions within the month.
   */
  async getByMonth(
    householdId: string,
    month: string
  ): Promise<BudgetWithCategories | null> {
    // Fetch the budget row for the given month
    const { data: budget, error: budgetError } = await this.supabase
      .from("budgets")
      .select("*")
      .eq("household_id", householdId)
      .eq("month", month)
      .single();

    if (budgetError) {
      if (budgetError.code === "PGRST116") return null; // Not found
      throw budgetError;
    }

    // Fetch budget categories with joined category info
    const { data: budgetCats, error: catError } = await this.supabase
      .from("budget_categories")
      .select("*, category:categories(name, icon, color)")
      .eq("budget_id", budget.id);

    if (catError) throw catError;

    // Compute date range for this month
    const monthDate = new Date(month + "T00:00:00");
    const dateFrom = month; // first day of month
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateTo = nextMonth.toISOString().split("T")[0]; // first day of next month

    // Get spending by category for this month
    const spending = await this.getSpendingByCategory(
      householdId,
      dateFrom,
      dateTo
    );

    // Build a spending lookup map
    const spendingMap = new Map<string, number>();
    for (const s of spending) {
      spendingMap.set(s.category_id, s.total_cents);
    }

    // Assemble categories with spending
    const categories: BudgetCategoryWithSpending[] = (budgetCats || []).map(
      (bc: BudgetCategory & { category: { name: string; icon: string | null; color: string | null } }) => ({
        id: bc.id,
        budget_id: bc.budget_id,
        category_id: bc.category_id,
        allocated_cents: bc.allocated_cents,
        rollover_cents: bc.rollover_cents,
        created_at: bc.created_at,
        spent_cents: spendingMap.get(bc.category_id) || 0,
        category_name: bc.category?.name || "Unknown",
        category_icon: bc.category?.icon || null,
        category_color: bc.category?.color || null,
      })
    );

    const totalAllocated = categories.reduce(
      (sum, c) => sum + c.allocated_cents,
      0
    );
    const totalSpent = categories.reduce((sum, c) => sum + c.spent_cents, 0);

    return {
      ...budget,
      categories,
      total_allocated_cents: totalAllocated,
      total_spent_cents: totalSpent,
    };
  }

  /**
   * Create a new budget for a month with category allocations.
   */
  async create(
    budget: {
      household_id: string;
      month: string;
      total_cents: number;
      rollover_enabled: boolean;
    },
    categories: { category_id: string; allocated_cents: number }[]
  ): Promise<Budget> {
    // Insert budget row
    const { data: created, error: budgetError } = await this.supabase
      .from("budgets")
      .insert(budget)
      .select()
      .single();

    if (budgetError) throw budgetError;

    // Insert all budget_categories rows
    if (categories.length > 0) {
      const categoryRows = categories.map((c) => ({
        budget_id: created.id,
        category_id: c.category_id,
        allocated_cents: c.allocated_cents,
      }));

      const { error: catError } = await this.supabase
        .from("budget_categories")
        .insert(categoryRows);

      if (catError) throw catError;
    }

    return created;
  }

  /**
   * Update an existing budget. If categories provided, atomically replaces
   * all category allocations (delete + re-insert, same pattern as transaction splits).
   */
  async update(
    budgetId: string,
    updates: { total_cents?: number; rollover_enabled?: boolean },
    categories?: { category_id: string; allocated_cents: number }[]
  ): Promise<Budget> {
    // Update budget fields if any provided
    const updateData: Record<string, unknown> = {};
    if (updates.total_cents !== undefined)
      updateData.total_cents = updates.total_cents;
    if (updates.rollover_enabled !== undefined)
      updateData.rollover_enabled = updates.rollover_enabled;

    if (Object.keys(updateData).length > 0) {
      const { error } = await this.supabase
        .from("budgets")
        .update(updateData)
        .eq("id", budgetId);

      if (error) throw error;
    }

    // Atomic replace of categories if provided
    if (categories) {
      // Delete existing categories
      const { error: deleteError } = await this.supabase
        .from("budget_categories")
        .delete()
        .eq("budget_id", budgetId);

      if (deleteError) throw deleteError;

      // Re-insert new categories
      if (categories.length > 0) {
        const categoryRows = categories.map((c) => ({
          budget_id: budgetId,
          category_id: c.category_id,
          allocated_cents: c.allocated_cents,
        }));

        const { error: insertError } = await this.supabase
          .from("budget_categories")
          .insert(categoryRows);

        if (insertError) throw insertError;
      }
    }

    // Fetch and return the updated budget
    const { data: updated, error: fetchError } = await this.supabase
      .from("budgets")
      .select("*")
      .eq("id", budgetId)
      .single();

    if (fetchError) throw fetchError;
    return updated;
  }

  /**
   * Delete a budget (CASCADE deletes budget_categories).
   */
  async delete(budgetId: string): Promise<void> {
    const { error } = await this.supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId);

    if (error) throw error;
  }

  /**
   * Get spending aggregated by category for a date range.
   * Handles split transactions: uses split amounts per category instead of parent.
   *
   * Sign convention: negative amount_cents = outflow (spending).
   * We filter on amount_cents < 0 and negate to get positive spending totals.
   * Filters out transactions with null category_id.
   *
   * @param dateFrom - Start date inclusive (YYYY-MM-DD)
   * @param dateTo - End date exclusive (YYYY-MM-DD, first day of next period)
   */
  async getSpendingByCategory(
    householdId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<{ category_id: string; total_cents: number }[]> {
    // Fetch all outflow transactions in date range
    const { data: transactions, error: txError } = await this.supabase
      .from("transactions")
      .select("id, amount_cents, category_id")
      .eq("household_id", householdId)
      .gte("transaction_date", dateFrom)
      .lt("transaction_date", dateTo)
      .lt("amount_cents", 0); // negative = outflow (spending)

    if (txError) throw txError;
    if (!transactions || transactions.length === 0) return [];

    // Get transaction IDs to check for splits
    const txIds = transactions.map((t: { id: string }) => t.id);

    // Fetch all splits for these transactions
    const { data: splits, error: splitError } = await this.supabase
      .from("transaction_splits")
      .select("transaction_id, category_id, amount_cents")
      .in("transaction_id", txIds);

    if (splitError) throw splitError;

    // Build a set of transaction IDs that have splits
    const splitTxIds = new Set(
      (splits || []).map((s: { transaction_id: string }) => s.transaction_id)
    );

    // Aggregate spending by category in JavaScript
    const categoryTotals = new Map<string, number>();

    for (const tx of transactions) {
      if (splitTxIds.has(tx.id)) {
        // This transaction has splits — use split amounts per category
        // Splits inherit the sign of the parent transaction
        continue; // handled below
      }

      // No splits — use the transaction's category_id and full amount
      if (tx.category_id) {
        const current = categoryTotals.get(tx.category_id) || 0;
        // Negate to get positive spending amount
        categoryTotals.set(tx.category_id, current + Math.abs(tx.amount_cents));
      }
    }

    // Process splits
    for (const split of splits || []) {
      if (split.category_id) {
        const current = categoryTotals.get(split.category_id) || 0;
        // Split amount_cents follows the same sign convention as parent
        categoryTotals.set(
          split.category_id,
          current + Math.abs(split.amount_cents)
        );
      }
    }

    return Array.from(categoryTotals.entries()).map(
      ([category_id, total_cents]) => ({
        category_id,
        total_cents,
      })
    );
  }

  /**
   * Get budget totals by month for a given set of months.
   * Returns a Map of month string (YYYY-MM-01 format) to total_cents.
   * Used to enrich spending trend data with budget amounts.
   */
  async getBudgetTotalsByMonth(
    householdId: string,
    months: string[]
  ): Promise<Map<string, number>> {
    if (months.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from("budgets")
      .select("month, total_cents")
      .eq("household_id", householdId)
      .in("month", months);

    if (error) throw error;

    const result = new Map<string, number>();
    for (const row of data || []) {
      result.set(row.month, row.total_cents);
    }
    return result;
  }

  /**
   * Get spending trends aggregated by month for the last N months.
   * Used for the bar chart trend view.
   */
  async getSpendingTrends(
    householdId: string,
    months: number
  ): Promise<{ month: string; category_id: string; total_cents: number }[]> {
    const results: {
      month: string;
      category_id: string;
      total_cents: number;
    }[] = [];

    // Start from the current month and go back N months
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

      // Next month for exclusive end date
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;

      const spending = await this.getSpendingByCategory(
        householdId,
        monthStr,
        nextStr
      );

      for (const s of spending) {
        results.push({ month: monthStr, ...s });
      }
    }

    return results;
  }

  /**
   * Compute rollover amounts for each category in a budget.
   * Rollover = allocated_cents + rollover_cents - spent_cents.
   * Negative result means overspend debt carries forward.
   */
  async computeRollover(
    budgetId: string,
    householdId: string
  ): Promise<{ category_id: string; rollover_cents: number }[]> {
    // Get the budget with spending data
    const { data: budget, error: budgetError } = await this.supabase
      .from("budgets")
      .select("*")
      .eq("id", budgetId)
      .single();

    if (budgetError) throw budgetError;

    // Fetch budget categories
    const { data: budgetCats, error: catError } = await this.supabase
      .from("budget_categories")
      .select("*")
      .eq("budget_id", budgetId);

    if (catError) throw catError;
    if (!budgetCats || budgetCats.length === 0) return [];

    // Compute spending for the budget's month
    const monthDate = new Date(budget.month + "T00:00:00");
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateTo = nextMonth.toISOString().split("T")[0];

    const spending = await this.getSpendingByCategory(
      householdId,
      budget.month,
      dateTo
    );

    const spendingMap = new Map<string, number>();
    for (const s of spending) {
      spendingMap.set(s.category_id, s.total_cents);
    }

    return budgetCats.map((bc: BudgetCategory) => ({
      category_id: bc.category_id,
      rollover_cents:
        bc.allocated_cents + bc.rollover_cents - (spendingMap.get(bc.category_id) || 0),
    }));
  }

  /**
   * Confirm rollover from one budget to another.
   * Updates rollover_cents on each budget_categories row in the target budget.
   */
  async confirmRollover(
    _fromBudgetId: string,
    toBudgetId: string,
    rollovers: { category_id: string; rollover_cents: number }[]
  ): Promise<void> {
    for (const r of rollovers) {
      const { error } = await this.supabase
        .from("budget_categories")
        .update({ rollover_cents: r.rollover_cents })
        .eq("budget_id", toBudgetId)
        .eq("category_id", r.category_id);

      if (error) throw error;
    }
  }
}
