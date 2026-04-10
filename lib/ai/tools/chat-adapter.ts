import { tool, type ToolSet } from "ai";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function toChatTools(
  tools: ToolDefinition[],
  ctx: ToolContext,
): ToolSet {
  const result: ToolSet = {};

  for (const t of tools) {
    // Use tool() helper for proper Zod→JSON Schema conversion.
    // Cast to work around strict generic overloads on tool().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result[t.name] = (tool as any)({
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
    });
  }

  return result;
}
