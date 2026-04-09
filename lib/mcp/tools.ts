import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpTools } from "@/lib/ai/tools";
import type { ToolContext } from "@/lib/ai/tools/types";

// ---------------------------------------------------------------------------
// Service-role Supabase client (lazy singleton — avoids build-time crash
// when SUPABASE_SERVICE_ROLE_KEY is not set in CI)
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// Helper: extract userId from MCP extra context
// ---------------------------------------------------------------------------

function getUserId(extra: Record<string, unknown>): string | null {
  const authInfo = extra.authInfo as
    | { extra?: { userId?: string } }
    | undefined;
  return authInfo?.extra?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Register all MCP tools via shared layer
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  createMcpTools(server, async (extra: Record<string, unknown>): Promise<ToolContext> => {
    const userId = getUserId(extra);
    if (!userId) throw new Error("Authentication required");

    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];

    // Resolve household for money tools
    let householdId: string | undefined;
    try {
      const { resolveHousehold } = await import("@/lib/db/households");
      householdId = await resolveHousehold(supabase, userId);
    } catch {
      // User may not have a household — money tools will return errors
    }

    return {
      userId,
      supabase,
      date: today,
      timezone: "UTC",
      householdId,
    };
  });
}
