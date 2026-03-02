import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HouseholdInvitation,
  HouseholdMemberWithProfile,
} from "./types";

const MAX_HOUSEHOLD_MEMBERS = 5;

/**
 * Database access class for household management.
 * Handles invitation lifecycle, member management, and data merge/split
 * when members join or leave households.
 */
export class HouseholdsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Resolve the household_id for a given user.
   * If the user has no household, creates one and adds them as owner.
   */
  async resolveHousehold(userId: string): Promise<string> {
    // Check for existing membership
    const { data: membership, error: selectError } = await this.supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .single();

    if (membership) return membership.household_id;

    // PGRST116 = "not found" -- expected for first-time users
    if (selectError && selectError.code !== "PGRST116") {
      throw selectError;
    }

    // Create household + membership
    const { data: household, error: insertError } = await this.supabase
      .from("households")
      .insert({ name: "My Household" })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: memberError } = await this.supabase
      .from("household_members")
      .insert({ household_id: household.id, user_id: userId, role: "owner" });

    if (memberError) {
      // 23505 = unique_violation -- race condition: another request already
      // created a membership. Delete the orphaned household and retry lookup.
      if (memberError.code === "23505") {
        await this.supabase
          .from("households")
          .delete()
          .eq("id", household.id);
        const { data: retry } = await this.supabase
          .from("household_members")
          .select("household_id")
          .eq("user_id", userId)
          .single();
        if (retry) return retry.household_id;
      }
      throw memberError;
    }

    return household.id;
  }

  /**
   * Get all members of a household with profile info.
   */
  async getMembers(
    householdId: string
  ): Promise<HouseholdMemberWithProfile[]> {
    const { data, error } = await this.supabase
      .from("household_members")
      .select("*, profile:profiles(email, full_name, avatar_url)")
      .eq("household_id", householdId);

    if (error) throw error;

    return (data || []).map(
      (m: {
        id: string;
        household_id: string;
        user_id: string;
        role: "owner" | "member";
        created_at: string;
        profile: {
          email: string;
          full_name: string | null;
          avatar_url: string | null;
        };
      }) => ({
        id: m.id,
        household_id: m.household_id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        email: m.profile?.email || "",
        full_name: m.profile?.full_name || null,
        avatar_url: m.profile?.avatar_url || null,
      })
    );
  }

  /**
   * Get a member's role in a household.
   */
  async getMemberRole(
    householdId: string,
    userId: string
  ): Promise<"owner" | "member" | null> {
    const { data, error } = await this.supabase
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data.role;
  }

  /**
   * Get the number of members in a household.
   */
  async getMemberCount(householdId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", householdId);

    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Create an invitation to join a household.
   * Handles 23505 (duplicate) gracefully.
   */
  async createInvite(
    householdId: string,
    invitedBy: string,
    email: string
  ): Promise<HouseholdInvitation> {
    const { data, error } = await this.supabase
      .from("household_invitations")
      .insert({ household_id: householdId, invited_by: invitedBy, email })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("An invitation has already been sent to this email");
      }
      throw error;
    }
    return data;
  }

  /**
   * Get all pending invitations for a household.
   */
  async getInvitations(householdId: string): Promise<HouseholdInvitation[]> {
    const { data, error } = await this.supabase
      .from("household_invitations")
      .select("*")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get an invitation by its token.
   * Returns null if not found, expired, or already used.
   */
  async getInvitationByToken(
    token: string
  ): Promise<HouseholdInvitation | null> {
    const { data, error } = await this.supabase
      .from("household_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /**
   * Accept an invitation and merge the user's data into the target household.
   *
   * Flow:
   * 1. Validate token (exists, pending, not expired)
   * 2. Check household size limit (max 5)
   * 3. If user owns a solo household, merge all data into target
   * 4. If user has no household, just insert as member
   * 5. Mark invitation as 'accepted'
   *
   * MUST use adminClient (service role) since it updates data across
   * household boundaries that RLS would block.
   */
  async acceptInvite(
    token: string,
    userId: string,
    adminClient: SupabaseClient
  ): Promise<void> {
    // 1. Validate token
    const { data: invitation, error: invError } = await adminClient
      .from("household_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (invError || !invitation) {
      throw new Error("Invalid or expired invitation");
    }

    const targetHouseholdId = invitation.household_id;

    // 2. Check household size limit
    const { count, error: countError } = await adminClient
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", targetHouseholdId);

    if (countError) throw countError;
    if ((count ?? 0) >= MAX_HOUSEHOLD_MEMBERS) {
      throw new Error(`Household has reached the maximum of ${MAX_HOUSEHOLD_MEMBERS} members`);
    }

    // 3. Get user's current household membership
    const { data: currentMembership, error: memberError } = await adminClient
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", userId)
      .single();

    if (memberError && memberError.code !== "PGRST116") {
      throw memberError;
    }

    if (currentMembership) {
      const sourceHouseholdId = currentMembership.household_id;

      // Check if user is sole owner of a solo household
      const { count: sourceCount } = await adminClient
        .from("household_members")
        .select("*", { count: "exact", head: true })
        .eq("household_id", sourceHouseholdId);

      if ((sourceCount ?? 0) === 1) {
        // Merge: move all data from source to target household
        await this.mergeHouseholdData(
          adminClient,
          sourceHouseholdId,
          targetHouseholdId,
          userId
        );
      } else {
        // User is in a multi-member household — just move their membership
        const { error: moveError } = await adminClient
          .from("household_members")
          .update({ household_id: targetHouseholdId, role: "member" })
          .eq("household_id", sourceHouseholdId)
          .eq("user_id", userId);

        if (moveError) throw moveError;
      }
    } else {
      // User has no household -- just insert as member
      const { error: insertError } = await adminClient
        .from("household_members")
        .insert({
          household_id: targetHouseholdId,
          user_id: userId,
          role: "member",
        });

      if (insertError) throw insertError;
    }

    // 5. Mark invitation as accepted
    const { error: updateError } = await adminClient
      .from("household_invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);

    if (updateError) throw updateError;
  }

  /**
   * Merge all data from source household into target household.
   * Moves accounts, transactions, budgets, goals, bills, rules, etc.
   * Then updates membership and deletes the source household.
   */
  private async mergeHouseholdData(
    adminClient: SupabaseClient,
    sourceHouseholdId: string,
    targetHouseholdId: string,
    userId: string
  ): Promise<void> {
    // Move accounts: keep owner_id, set visibility to 'mine' (private by default)
    const { error: accountsError } = await adminClient
      .from("accounts")
      .update({
        household_id: targetHouseholdId,
        visibility: "mine",
      })
      .eq("household_id", sourceHouseholdId);
    if (accountsError) throw accountsError;

    // Move transactions
    const { error: txnError } = await adminClient
      .from("transactions")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);
    if (txnError) throw txnError;

    // Move budgets: set is_shared to false (private by default)
    const { error: budgetsError } = await adminClient
      .from("budgets")
      .update({
        household_id: targetHouseholdId,
        is_shared: false,
      })
      .eq("household_id", sourceHouseholdId);
    if (budgetsError) throw budgetsError;

    // Move savings goals: set is_shared to false
    const { error: goalsError } = await adminClient
      .from("savings_goals")
      .update({
        household_id: targetHouseholdId,
        is_shared: false,
      })
      .eq("household_id", sourceHouseholdId);
    if (goalsError) throw goalsError;

    // Move recurring bills
    const { error: billsError } = await adminClient
      .from("recurring_bills")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);
    if (billsError) throw billsError;

    // Move manual assets
    const { error: assetsError } = await adminClient
      .from("manual_assets")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);
    if (assetsError) throw assetsError;

    // Move merchant category rules
    const { error: rulesError } = await adminClient
      .from("merchant_category_rules")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);
    if (rulesError) throw rulesError;

    // Move bank connections
    const { error: bankError } = await adminClient
      .from("bank_connections")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);
    if (bankError) throw bankError;

    // Handle categories: skip duplicates by name, remap transactions
    await this.mergeCategories(
      adminClient,
      sourceHouseholdId,
      targetHouseholdId
    );

    // Delete net worth snapshots for source (will be recalculated)
    const { error: snapshotsError } = await adminClient
      .from("net_worth_snapshots")
      .delete()
      .eq("household_id", sourceHouseholdId);
    if (snapshotsError) throw snapshotsError;

    // Update membership: move to target household as 'member'
    const { error: membershipError } = await adminClient
      .from("household_members")
      .update({
        household_id: targetHouseholdId,
        role: "member",
      })
      .eq("household_id", sourceHouseholdId)
      .eq("user_id", userId);
    if (membershipError) throw membershipError;

    // Delete source household (CASCADE cleans up any remaining references)
    const { error: deleteError } = await adminClient
      .from("households")
      .delete()
      .eq("id", sourceHouseholdId);
    if (deleteError) throw deleteError;
  }

  /**
   * Merge categories from source household into target.
   * For categories with matching names, remap transaction references.
   * For unique categories, move them to the target household.
   */
  private async mergeCategories(
    adminClient: SupabaseClient,
    sourceHouseholdId: string,
    targetHouseholdId: string
  ): Promise<void> {
    // Get source categories
    const { data: sourceCategories, error: srcError } = await adminClient
      .from("categories")
      .select("id, name")
      .eq("household_id", sourceHouseholdId);
    if (srcError) throw srcError;

    if (!sourceCategories || sourceCategories.length === 0) return;

    // Get target categories for name matching
    const { data: targetCategories, error: tgtError } = await adminClient
      .from("categories")
      .select("id, name")
      .eq("household_id", targetHouseholdId);
    if (tgtError) throw tgtError;

    const targetNameMap = new Map<string, string>();
    for (const tc of targetCategories || []) {
      targetNameMap.set(tc.name.toLowerCase(), tc.id);
    }

    for (const sc of sourceCategories) {
      const matchingTargetId = targetNameMap.get(sc.name.toLowerCase());

      if (matchingTargetId) {
        // Duplicate name: remap transactions and budget categories, then delete source
        const { error: e1 } = await adminClient
          .from("transactions")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);
        if (e1) throw e1;

        const { error: e2 } = await adminClient
          .from("budget_categories")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);
        if (e2) throw e2;

        const { error: e3 } = await adminClient
          .from("merchant_category_rules")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);
        if (e3) throw e3;

        const { error: e4 } = await adminClient
          .from("transaction_splits")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);
        if (e4) throw e4;

        const { error: e5 } = await adminClient
          .from("categories")
          .delete()
          .eq("id", sc.id);
        if (e5) throw e5;
      } else {
        // Unique category: move to target household
        const { error: moveError } = await adminClient
          .from("categories")
          .update({ household_id: targetHouseholdId })
          .eq("id", sc.id);
        if (moveError) throw moveError;
      }
    }
  }

  /**
   * Remove a member from a household.
   * Creates a new solo household for the departing member and moves their owned data.
   * Shared budgets/goals stay in the original household (ownership transferred to household owner).
   *
   * MUST use adminClient since it updates data across household boundaries.
   */
  async removeMember(
    householdId: string,
    userId: string,
    adminClient: SupabaseClient
  ): Promise<void> {
    // 1. Create new household for departing member
    const { data: newHousehold, error: createError } = await adminClient
      .from("households")
      .insert({ name: "My Household" })
      .select("id")
      .single();

    if (createError) throw createError;

    const newHouseholdId = newHousehold.id;

    // 2. Move departing member's owned accounts + their transactions
    const { data: ownedAccounts, error: acctError } = await adminClient
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .eq("owner_id", userId);
    if (acctError) throw acctError;

    if (ownedAccounts && ownedAccounts.length > 0) {
      const accountIds = ownedAccounts.map((a: { id: string }) => a.id);

      // Move transactions for owned accounts
      const { error: txnError } = await adminClient
        .from("transactions")
        .update({ household_id: newHouseholdId })
        .in("account_id", accountIds);
      if (txnError) throw txnError;

      // Move the accounts themselves
      const { error: moveAcctError } = await adminClient
        .from("accounts")
        .update({
          household_id: newHouseholdId,
          visibility: "mine",
        })
        .eq("household_id", householdId)
        .eq("owner_id", userId);
      if (moveAcctError) throw moveAcctError;
    }

    // 3. Move member's private budgets to new household
    const { error: budgetsError } = await adminClient
      .from("budgets")
      .update({
        household_id: newHouseholdId,
        is_shared: false,
      })
      .eq("household_id", householdId)
      .eq("owner_id", userId)
      .eq("is_shared", false);
    if (budgetsError) throw budgetsError;

    // Transfer ownership of shared budgets to household owner
    const { data: householdOwner, error: ownerError } = await adminClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("role", "owner")
      .single();
    if (ownerError && ownerError.code !== "PGRST116") throw ownerError;

    if (householdOwner) {
      const { error: transferBudgetError } = await adminClient
        .from("budgets")
        .update({ owner_id: householdOwner.user_id })
        .eq("household_id", householdId)
        .eq("owner_id", userId)
        .eq("is_shared", true);
      if (transferBudgetError) throw transferBudgetError;

      const { error: transferGoalError } = await adminClient
        .from("savings_goals")
        .update({ owner_id: householdOwner.user_id })
        .eq("household_id", householdId)
        .eq("owner_id", userId)
        .eq("is_shared", true);
      if (transferGoalError) throw transferGoalError;
    }

    // 4. Move member's private goals to new household
    const { error: goalsError } = await adminClient
      .from("savings_goals")
      .update({
        household_id: newHouseholdId,
        is_shared: false,
      })
      .eq("household_id", householdId)
      .eq("owner_id", userId)
      .eq("is_shared", false);
    if (goalsError) throw goalsError;

    // 5. Move member's bank connections
    const { error: bankError } = await adminClient
      .from("bank_connections")
      .update({ household_id: newHouseholdId })
      .eq("household_id", householdId)
      .eq("connected_by", userId);
    if (bankError) throw bankError;

    // 6. Update membership: new household, role = 'owner'
    const { error: memberError } = await adminClient
      .from("household_members")
      .update({
        household_id: newHouseholdId,
        role: "owner",
      })
      .eq("household_id", householdId)
      .eq("user_id", userId);
    if (memberError) throw memberError;
  }

  /**
   * Revoke a pending invitation.
   */
  async revokeInvite(invitationId: string): Promise<void> {
    const { error } = await this.supabase
      .from("household_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId);

    if (error) throw error;
  }

  /**
   * Get pending invitations for a specific email address.
   * Used on login to check if user has pending invites.
   * Must use adminClient since the user is not yet a household member.
   */
  async getPendingInvitesForEmail(
    email: string,
    adminClient: SupabaseClient
  ): Promise<HouseholdInvitation[]> {
    const { data, error } = await adminClient
      .from("household_invitations")
      .select("*")
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

/**
 * Backward compatibility wrapper.
 * Existing code uses `resolveHousehold(supabase, userId)` as a standalone function.
 */
export async function resolveHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const db = new HouseholdsDB(supabase);
  return db.resolveHousehold(userId);
}
