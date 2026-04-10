import { createAnthropic } from "@ai-sdk/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChatMemoriesDB } from "@/lib/db/chat-memories";
import { log } from "@/lib/logger";

const anthropic = createAnthropic({
  baseURL: process.env.LLM_BASE_URL || "https://llm.betterr.me/v1",
  // CLIProxyAPI uses Bearer auth, not x-api-key header
  authToken: process.env.LLM_API_KEY ?? "",
});
// Note: Empty authToken is guarded at the route level (503 if LLM_API_KEY not set).

export const llmProvider = anthropic;

// Anthropic built-in web search tool — gives the model real-time web access
export const webSearchTool = anthropic.tools.webSearch_20250305({
  maxUses: 5,
});

// Anthropic built-in web fetch tool — retrieves content from specific URLs
export const webFetchTool = anthropic.tools.webFetch_20250910({
  maxUses: 3,
});

// Anthropic built-in memory tool — remembers user preferences across conversations
export function createMemoryTool(supabase: SupabaseClient, userId: string) {
  const db = new ChatMemoriesDB(supabase);
  return anthropic.tools.memory_20250818({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (action: any) => {
      try {
        switch (action.command) {
          case "view": {
            if (action.path === "/memories") {
              const memories = await db.list(userId);
              if (memories.length === 0) return "Directory is empty.";
              return memories.map((m) => m.path).join("\n");
            }
            const memory = await db.get(userId, action.path);
            return memory?.content ?? `File not found: ${action.path}`;
          }
          case "create": {
            await db.upsert(userId, action.path, action.file_text ?? "");
            return `Created ${action.path}`;
          }
          case "str_replace": {
            const existing = await db.get(userId, action.path);
            if (!existing) return `File not found: ${action.path}`;
            const oldStr = action.old_str ?? "";
            if (!existing.content.includes(oldStr))
              return `String not found in ${action.path}: ${oldStr}`;
            const updated = existing.content.replace(
              oldStr,
              action.new_str ?? "",
            );
            await db.upsert(userId, action.path, updated);
            return `Updated ${action.path}`;
          }
          case "insert": {
            const file = await db.get(userId, action.path);
            if (!file) return `File not found: ${action.path}`;
            const lines = file.content.split("\n");
            lines.splice(action.insert_line ?? 0, 0, action.new_str ?? "");
            await db.upsert(userId, action.path, lines.join("\n"));
            return `Inserted at line ${action.insert_line ?? 0} in ${action.path}`;
          }
          case "delete": {
            const toDelete = await db.get(userId, action.path);
            if (!toDelete) return `File not found: ${action.path}`;
            await db.delete(userId, action.path);
            return `Deleted ${action.path}`;
          }
          case "rename": {
            const toRename = await db.get(userId, action.path);
            if (!toRename) return `File not found: ${action.path}`;
            await db.rename(userId, action.path, action.new_path);
            return `Renamed ${action.path} to ${action.new_path}`;
          }
          default:
            return `Unknown command: ${action.command}`;
        }
      } catch (error) {
        log.error("[memory] Tool execution failed", error, { userId, action });
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
