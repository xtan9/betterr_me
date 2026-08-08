import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedRecurringTaskPrincipal } from "@/lib/recurring-tasks/capabilities";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDefinition, ToolContext } from "./types";
import { habitTools } from "./habits";
import { taskTools } from "./tasks";
import { calendarTools } from "./calendar";
import { journalTools } from "./journal";
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
  principal,
}: {
  userId: string;
  supabase: SupabaseClient;
  date: string;
  timezone: string;
  principal: AuthenticatedRecurringTaskPrincipal;
}) {
  const ctx: ToolContext = { userId, supabase, date, timezone, principal };
  return toChatTools(getAllTools(), ctx);
}

export function createMcpTools(
  server: McpServer,
  getContext: (extra: Record<string, unknown>) => Promise<ToolContext>,
) {
  registerSharedTools(server, getAllTools(), getContext);
}

export type { ToolDefinition, ToolContext } from "./types";
