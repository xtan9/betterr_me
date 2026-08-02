import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import type { User } from "@supabase/supabase-js";

type AdminProfile = { role: "user" | "admin" };

interface AdminContext {
  user: User;
  profile: AdminProfile;
}

/**
 * Get the current user and their profile with role information.
 * Returns null values if the user is not authenticated or profile not found.
 */
async function getAdminContext(): Promise<{
  user: User | null;
  profile: AdminProfile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    log.error("Failed to fetch profile for admin check", profileError, { userId: user.id });
  }

  return { user, profile: profile as AdminProfile | null };
}

/**
 * Require admin role for server components / pages.
 * Redirects to /auth/login if not authenticated, or /dashboard if not admin.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { user, profile } = await getAdminContext();

  if (!user) {
    redirect("/auth/login");
  }

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return { user, profile };
}
