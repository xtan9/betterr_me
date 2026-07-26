import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpTools } from "@/lib/ai/tools";
import type { ToolContext } from "@/lib/ai/tools/types";
import { log } from "@/lib/logger";

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
    // MCP clients don't send timezone — use UTC date as fallback.
    // This is server-side only; the chat path uses client-supplied local date.
    const now = new Date();
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

    // Resolve household for money tools
    let _householdId: string | undefined;
    try {
    } catch (error) {
      log.info("[mcp] Household not available — money tools will have limited functionality", {
        error: error instanceof Error ? error.message : JSON.stringify(error),
        userId,
      });
    }

    return {
      userId,
      supabase,
      date: today,
      timezone: "UTC",
    };
  });
}
