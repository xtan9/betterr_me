import { zodSchema, type ToolSet } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

interface ChatToolEntry {
  description: string;
  inputSchema: ReturnType<typeof zodSchema>;
  execute: (params: unknown) => Promise<unknown>;
}

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): ToolSet {
  const result: Record<string, ChatToolEntry> = {};

  for (const t of tools) {
    // Use inputSchema (not parameters) — streamText accesses tool.inputSchema
    // internally, and parameters is ignored. zodSchema() converts the Zod schema
    // to JSON Schema with type: "object" required by the model API.
    result[t.name] = {
      description: t.description,
      inputSchema: zodSchema(t.parameters),
      execute: async (params: unknown) => {
        try {
          return await t.execute(params, ctx);
        } catch (error) {
          // Re-throw programming bugs so they surface immediately
          if (error instanceof TypeError || error instanceof ReferenceError) {
            log.error(`[chat] Tool ${t.name} bug`, error, { userId: ctx.userId });
            throw error;
          }
          log.error(`[chat] Tool ${t.name} failed`, error, { userId: ctx.userId });
          return { error: `Failed to execute ${t.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
      },
    };
  }

  return result as ToolSet;
}
