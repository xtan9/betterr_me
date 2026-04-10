import { zodSchema, type ToolSet } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): ToolSet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const t of tools) {
    // Use inputSchema (not parameters) — streamText accesses tool.inputSchema
    // internally, and parameters is ignored. zodSchema() converts the Zod schema
    // to JSON Schema with type: "object" required by the Claude API.
    result[t.name] = {
      description: t.description,
      inputSchema: zodSchema(t.parameters),
      execute: async (params: unknown) => {
        try {
          return await t.execute(params, ctx);
        } catch (error) {
          log.error(`[chat] Tool ${t.name} failed`, error, { userId: ctx.userId });
          return { error: `Failed to execute ${t.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
      },
    };
  }

  return result as ToolSet;
}
