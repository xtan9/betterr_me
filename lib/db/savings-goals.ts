import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SavingsGoal,
  SavingsGoalInsert,
  SavingsGoalUpdate,
  GoalContribution,
  GoalContributionInsert,
  ViewMode,
} from "./types";

/**
 * Database access class for the savings_goals and goal_contributions tables.
 * Follows the same pattern as BudgetsDB (constructor takes SupabaseClient).
 */
export class SavingsGoalsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all goals for a household.
   * For linked goals, current_cents reflects the linked account balance.
   */
  async getByHousehold(householdId: string): Promise<SavingsGoal[]> {
    const { data, error } = await this.supabase
      .from("savings_goals")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get goals for a household filtered by view mode.
   * - 'mine': goals where owner_id = userId AND is_shared = false
   * - 'household': goals where is_shared = true
   */
  async getByHouseholdFiltered(
    householdId: string,
    userId: string,
    view: ViewMode
  ): Promise<SavingsGoal[]> {
    let query = this.supabase
      .from("savings_goals")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (view === "mine") {
      query = query.eq("owner_id", userId).eq("is_shared", false);
    } else {
      query = query.eq("is_shared", true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new savings goal.
   */
  async create(goal: SavingsGoalInsert): Promise<SavingsGoal> {
    const { data, error } = await this.supabase
      .from("savings_goals")
      .insert(goal)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update goal fields.
   */
  async update(id: string, updates: SavingsGoalUpdate): Promise<SavingsGoal> {
    const { data, error } = await this.supabase
      .from("savings_goals")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a goal (CASCADE deletes contributions).
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("savings_goals")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  /**
   * Add a contribution to a goal AND update goal.current_cents.
   */
  async addContribution(
    goalId: string,
    amountCents: number,
    note?: string
  ): Promise<GoalContribution> {
    // Insert the contribution record
    const insert: GoalContributionInsert = {
      goal_id: goalId,
      amount_cents: amountCents,
      note: note ?? null,
    };

    const { data: contribution, error: contribError } = await this.supabase
      .from("goal_contributions")
      .insert(insert)
      .select()
      .single();

    if (contribError) throw contribError;

    // Atomically increment current_cents via RPC to prevent race conditions
    const { error: rpcError } = await this.supabase.rpc(
      "increment_goal_current_cents",
      { p_goal_id: goalId, p_amount_cents: amountCents }
    );

    if (rpcError) throw rpcError;

    return contribution;
  }

  /**
   * Get contribution history for a goal, ordered by contributed_at DESC.
   */
  async getContributions(goalId: string): Promise<GoalContribution[]> {
    const { data, error } = await this.supabase
      .from("goal_contributions")
      .select("*")
      .eq("goal_id", goalId)
      .order("contributed_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
