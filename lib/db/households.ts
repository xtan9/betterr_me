import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the household_id for a given user.
 * If the user has no household, creates one and adds them as owner.
 *
 * Follows the same check-then-insert pattern as ensureProfile():
 * 1. Check household_members for existing membership
 * 2. If found, return household_id
 * 3. If not found (PGRST116), create household + insert membership
 * 4. Handle race condition (23505 unique_violation) with re-query
 *
 * @param supabase - Authenticated Supabase client (with user context for RLS)
 * @param userId - The authenticated user's ID
 * @returns The household_id string
 */
export async function resolveHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // 1. Check for existing membership
  const { data: membership, error: selectError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single();

  if (membership) return membership.household_id;

  // PGRST116 = "not found" — expected for first-time users
  if (selectError && selectError.code !== "PGRST116") {
    throw selectError;
  }

  // 2. Create household + membership in sequence
  const { data: household, error: insertError } = await supabase
    .from("households")
    .insert({ name: "My Household" })
    .select("id")
    .single();

  if (insertError) throw insertError;

  const { error: memberError } = await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });

  if (memberError) {
    // 23505 = unique_violation — race condition, another request created it
    if (memberError.code === "23505") {
      const { data: retry } = await supabase
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
