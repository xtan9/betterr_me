import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HouseholdInvitation,
  HouseholdMemberWithProfile,
} from "./types";

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
      // 23505 = unique_violation -- race condition
      if (memberError.code === "23505") {
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
  ): Promise<string | null> {
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
   * Uses adminClient to bypass RLS (invitee is not yet a household member).
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
    if ((count ?? 0) >= 5) {
      throw new Error("Household has reached the maximum of 5 members");
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
    await adminClient
      .from("accounts")
      .update({
        household_id: targetHouseholdId,
        visibility: "mine",
      })
      .eq("household_id", sourceHouseholdId);

    // Move transactions
    await adminClient
      .from("transactions")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);

    // Move budgets: set is_shared to false (private by default)
    await adminClient
      .from("budgets")
      .update({
        household_id: targetHouseholdId,
        is_shared: false,
      })
      .eq("household_id", sourceHouseholdId);

    // Move savings goals: set is_shared to false
    await adminClient
      .from("savings_goals")
      .update({
        household_id: targetHouseholdId,
        is_shared: false,
      })
      .eq("household_id", sourceHouseholdId);

    // Move recurring bills
    await adminClient
      .from("recurring_bills")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);

    // Move manual assets
    await adminClient
      .from("manual_assets")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);

    // Move merchant category rules
    await adminClient
      .from("merchant_category_rules")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);

    // Move bank connections
    await adminClient
      .from("bank_connections")
      .update({ household_id: targetHouseholdId })
      .eq("household_id", sourceHouseholdId);

    // Handle categories: skip duplicates by name, remap transactions
    await this.mergeCategories(
      adminClient,
      sourceHouseholdId,
      targetHouseholdId
    );

    // Delete net worth snapshots for source (will be recalculated)
    await adminClient
      .from("net_worth_snapshots")
      .delete()
      .eq("household_id", sourceHouseholdId);

    // Update membership: move to target household as 'member'
    await adminClient
      .from("household_members")
      .update({
        household_id: targetHouseholdId,
        role: "member",
      })
      .eq("household_id", sourceHouseholdId)
      .eq("user_id", userId);

    // Delete source household (CASCADE cleans up any remaining references)
    await adminClient
      .from("households")
      .delete()
      .eq("id", sourceHouseholdId);
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
    const { data: sourceCategories } = await adminClient
      .from("categories")
      .select("id, name")
      .eq("household_id", sourceHouseholdId);

    if (!sourceCategories || sourceCategories.length === 0) return;

    // Get target categories for name matching
    const { data: targetCategories } = await adminClient
      .from("categories")
      .select("id, name")
      .eq("household_id", targetHouseholdId);

    const targetNameMap = new Map<string, string>();
    for (const tc of targetCategories || []) {
      targetNameMap.set(tc.name.toLowerCase(), tc.id);
    }

    for (const sc of sourceCategories) {
      const matchingTargetId = targetNameMap.get(sc.name.toLowerCase());

      if (matchingTargetId) {
        // Duplicate name: remap transactions and budget categories, then delete source
        await adminClient
          .from("transactions")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);

        await adminClient
          .from("budget_categories")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);

        await adminClient
          .from("merchant_category_rules")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);

        await adminClient
          .from("transaction_splits")
          .update({ category_id: matchingTargetId })
          .eq("category_id", sc.id);

        await adminClient
          .from("categories")
          .delete()
          .eq("id", sc.id);
      } else {
        // Unique category: move to target household
        await adminClient
          .from("categories")
          .update({ household_id: targetHouseholdId })
          .eq("id", sc.id);
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
    const { data: ownedAccounts } = await adminClient
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .eq("owner_id", userId);

    if (ownedAccounts && ownedAccounts.length > 0) {
      const accountIds = ownedAccounts.map((a: { id: string }) => a.id);

      // Move transactions for owned accounts
      await adminClient
        .from("transactions")
        .update({ household_id: newHouseholdId })
        .in("account_id", accountIds);

      // Move the accounts themselves
      await adminClient
        .from("accounts")
        .update({
          household_id: newHouseholdId,
          visibility: "mine",
        })
        .eq("household_id", householdId)
        .eq("owner_id", userId);
    }

    // 3. Move member's private budgets to new household
    await adminClient
      .from("budgets")
      .update({
        household_id: newHouseholdId,
        is_shared: false,
      })
      .eq("household_id", householdId)
      .eq("owner_id", userId)
      .eq("is_shared", false);

    // Transfer ownership of shared budgets to household owner
    const { data: householdOwner } = await adminClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("role", "owner")
      .single();

    if (householdOwner) {
      await adminClient
        .from("budgets")
        .update({ owner_id: householdOwner.user_id })
        .eq("household_id", householdId)
        .eq("owner_id", userId)
        .eq("is_shared", true);

      await adminClient
        .from("savings_goals")
        .update({ owner_id: householdOwner.user_id })
        .eq("household_id", householdId)
        .eq("owner_id", userId)
        .eq("is_shared", true);
    }

    // 4. Move member's private goals to new household
    await adminClient
      .from("savings_goals")
      .update({
        household_id: newHouseholdId,
        is_shared: false,
      })
      .eq("household_id", householdId)
      .eq("owner_id", userId)
      .eq("is_shared", false);

    // 5. Move member's bank connections
    await adminClient
      .from("bank_connections")
      .update({ household_id: newHouseholdId })
      .eq("household_id", householdId)
      .eq("connected_by", userId);

    // 6. Update membership: new household, role = 'owner'
    await adminClient
      .from("household_members")
      .update({
        household_id: newHouseholdId,
        role: "owner",
      })
      .eq("household_id", householdId)
      .eq("user_id", userId);
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
