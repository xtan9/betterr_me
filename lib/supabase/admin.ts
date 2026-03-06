import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase admin client using the service-role key.
 * This client bypasses Row Level Security entirely.
 *
 * ONLY use in server-side code: API routes, server components, cron jobs, webhooks.
 * NEVER import this in client-side code — the service-role key would be exposed.
 *
 * Returns a new client instance each time (no singleton).
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. " +
        "Ensure both environment variables are set for server-side operations."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
