import { tool, zodSchema, type ToolSet } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): ToolSet {
  const result: ToolSet = {};

  for (const t of tools) {
    // Wrap Zod schema with zodSchema() for proper JSON Schema conversion
    // (adds type: "object" required by the Claude API).
    // Cast tool() to work around strict generic overloads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result[t.name] = (tool as any)({
      description: t.description,
      parameters: zodSchema(t.parameters),
      execute: async (params: unknown) => {
        try {
          return await t.execute(params, ctx);
        } catch (error) {
          log.error(`[chat] Tool ${t.name} failed`, error, { userId: ctx.userId });
          return { error: `Failed to execute ${t.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
      },
    });
  }

  return result;
}
