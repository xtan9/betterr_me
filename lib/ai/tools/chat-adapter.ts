import { tool } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): Record<string, ReturnType<typeof tool>> {
  const result: Record<string, ReturnType<typeof tool>> = {};

  for (const t of tools) {
    result[t.name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (params) => {
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
