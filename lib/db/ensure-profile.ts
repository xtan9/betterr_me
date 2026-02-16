import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Ensure a profile row exists for the given user.
 * If no profile exists, creates one with sensible defaults.
 *
 * Handles race conditions: if another request (or a DB trigger) already
 * created the profile between our SELECT and INSERT, the unique_violation
 * (23505) is caught and silently ignored.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  // Check if profile already exists
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (existing) {
    return; // Profile exists, nothing to do
  }

  // PGRST116 = "not found" — expected when profile is missing
  if (selectError && selectError.code !== "PGRST116") {
    throw selectError;
  }

  // Profile missing — create one
  const email = user.email ?? `no-email-${user.id}`;
  const fullName = user.user_metadata?.full_name || null;
  const avatarUrl = user.user_metadata?.avatar_url || null;

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    email,
    full_name: fullName,
    avatar_url: avatarUrl,
  });

  if (insertError) {
    // 23505 = unique_violation — another request or trigger already created it
    if (insertError.code === "23505") {
      return;
    }
    throw insertError;
  }
}
