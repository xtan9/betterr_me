import { tool } from "ai";
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
      execute: async (params) => t.execute(params, ctx),
    });
  }

  return result;
}
