import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "@/lib/logger";
import type { ToolDefinition, ToolContext } from "./types";

export function registerSharedTools(
  server: McpServer,
  tools: ToolDefinition[],
  getContext: (extra: Record<string, unknown>) => Promise<ToolContext>,
): void {
  // Cast to avoid "Type instantiation is excessively deep" errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = server.registerTool.bind(server) as any;

  for (const t of tools) {
    register(
      t.name,
      { description: t.description, inputSchema: t.parameters },
      async (params: unknown, extra: unknown) => {
        try {
          const ctx = await getContext(extra as Record<string, unknown>);
          const result = await t.execute(params, ctx);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          log.error(`MCP tool ${t.name} failed`, error);
          return {
            content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true as const,
          };
        }
      },
    );
  }
}
