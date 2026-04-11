import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveHousehold } from "@/lib/db/households";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";
import { habitTools } from "./habits";
import { taskTools } from "./tasks";
import { calendarTools } from "./calendar";
import { journalTools } from "./journal";
import { moneyTools } from "./money";
import { workoutTools } from "./workouts";
import { projectTools } from "./projects";
import { reminderTools } from "./reminders";
import { categoryTools } from "./categories";
import { toChatTools } from "./chat-adapter";
import { registerSharedTools } from "./mcp-adapter";

export function getAllTools(): ToolDefinition[] {
  return [
    ...habitTools(),
    ...taskTools(),
    ...calendarTools(),
    ...journalTools(),
    ...moneyTools(),
    ...workoutTools(),
    ...projectTools(),
    ...reminderTools(),
    ...categoryTools(),
  ];
}

export async function createChatTools({
  userId,
  supabase,
  date,
  timezone,
}: {
  userId: string;
  supabase: SupabaseClient;
  date: string;
  timezone: string;
}) {
  let householdId: string | undefined;
  try {
    householdId = await resolveHousehold(supabase, userId);
  } catch (error) {
    log.warn("[chat] Could not resolve household for money tools", { error: String(error) });
  }

  const ctx: ToolContext = { userId, supabase, date, timezone, householdId };
  return toChatTools(getAllTools(), ctx);
}

export function createMcpTools(
  server: McpServer,
  getContext: (extra: Record<string, unknown>) => Promise<ToolContext>,
) {
  registerSharedTools(server, getAllTools(), getContext);
}

export type { ToolDefinition, ToolContext } from "./types";
