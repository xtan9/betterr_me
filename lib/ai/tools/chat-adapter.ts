import { type ToolSet } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): ToolSet {
  // Build tools as plain objects matching the AI SDK ToolSet shape.
  // We avoid the `tool()` helper because its strict overloads conflict
  // with our generic ToolDefinition<any> parameter types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const t of tools) {
    result[t.name] = {
      description: t.description,
      parameters: t.parameters,
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
