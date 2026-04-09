import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerSharedTools } from "@/lib/ai/tools/mcp-adapter";
import type { ToolDefinition, ToolContext } from "@/lib/ai/tools/types";

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn() },
}));

describe("registerSharedTools", () => {
  const mockRegisterTool = vi.fn();
  const mockServer = { registerTool: mockRegisterTool } as unknown as Parameters<typeof registerSharedTools>[0];

  beforeEach(() => vi.clearAllMocks());

  it("registers each tool definition on the MCP server", () => {
    const tools: ToolDefinition[] = [
      {
        name: "myTool",
        description: "A tool",
        parameters: z.object({ x: z.string() }),
        execute: async () => "ok",
      },
    ];

    registerSharedTools(mockServer, tools, async () => ({
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "UTC",
    }));

    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool).toHaveBeenCalledWith(
      "myTool",
      expect.objectContaining({ description: "A tool" }),
      expect.any(Function),
    );
  });

  it("wraps execute with context and returns JSON response", async () => {
    const executeSpy = vi.fn().mockResolvedValue({ data: "result" });
    const tools: ToolDefinition[] = [
      {
        name: "spyTool",
        description: "spy",
        parameters: z.object({}),
        execute: executeSpy,
      },
    ];

    registerSharedTools(mockServer, tools, async () => ({
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "UTC",
    }));

    const handler = mockRegisterTool.mock.calls[0][2];
    const result = await handler({}, {});

    expect(executeSpy).toHaveBeenCalledWith({}, expect.objectContaining({ userId: "u1" }));
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ data: "result" }, null, 2) }],
    });
  });

  it("returns error response when execute throws", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "failTool",
        description: "fails",
        parameters: z.object({}),
        execute: async () => { throw new Error("DB connection failed"); },
      },
    ];

    registerSharedTools(mockServer, tools, async () => ({
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "UTC",
    }));

    const handler = mockRegisterTool.mock.calls[0][2];
    const result = await handler({}, {});

    expect(result).toEqual({
      content: [{ type: "text", text: "Error: DB connection failed" }],
      isError: true,
    });
  });
});
