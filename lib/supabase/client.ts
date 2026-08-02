import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const MISSING_BROWSER_CONFIG_MESSAGE =
  "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

function deferredClientWithoutConfiguration(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(MISSING_BROWSER_CONFIG_MESSAGE);
    },
  });
}

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return deferredClientWithoutConfiguration();

  return createBrowserClient(url, anonKey);
}
