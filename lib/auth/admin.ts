import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";
import type { User } from "@supabase/supabase-js";

/**
 * Error thrown when a non-admin user attempts to access an admin API endpoint.
 */
export class AdminUnauthorizedError extends Error {
  constructor(message = "Unauthorized: authentication required") {
    super(message);
    this.name = "AdminUnauthorizedError";
  }
}

export class AdminForbiddenError extends Error {
  constructor(message = "Forbidden: admin role required") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

interface AdminContext {
  user: User;
  profile: Profile;
}

/**
 * Get the current user and their profile with role information.
 * Returns null values if the user is not authenticated or profile not found.
 */
async function getAdminContext(): Promise<{
  user: User | null;
  profile: Profile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile: profile as Profile | null };
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

/**
 * Require admin role for API routes.
 * Throws AdminForbiddenError if not authenticated or not admin.
 */
export async function requireAdminApi(): Promise<AdminContext> {
  const { user, profile } = await getAdminContext();

  if (!user) {
    throw new AdminUnauthorizedError();
  }

  if (profile?.role !== "admin") {
    throw new AdminForbiddenError();
  }

  return { user, profile };
}
