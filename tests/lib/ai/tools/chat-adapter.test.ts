import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toChatTools } from "@/lib/ai/tools/chat-adapter";
import type { ToolDefinition, ToolContext } from "@/lib/ai/tools/types";

describe("toChatTools", () => {
  const mockExecute = async () => "result";

  const tools: ToolDefinition[] = [
    {
      name: "testTool",
      description: "A test tool",
      parameters: z.object({ input: z.string() }),
      execute: mockExecute,
    },
    {
      name: "anotherTool",
      description: "Another tool",
      parameters: z.object({}),
      execute: mockExecute,
    },
  ];

  it("converts ToolDefinition[] to a Record keyed by tool name", () => {
    const ctx: ToolContext = {
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "America/Toronto",
    };
    const result = toChatTools(tools, ctx);

    expect(Object.keys(result)).toEqual(["testTool", "anotherTool"]);
    expect(result.testTool).toHaveProperty("description", "A test tool");
    expect(result.testTool).toHaveProperty("inputSchema");
    expect(result.testTool).toHaveProperty("execute");
  });

  it("wraps execute to inject context", async () => {
    const ctx: ToolContext = {
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "America/Toronto",
    };
    const executeSpy = async (params: { input: string }, c: ToolContext) => {
      return { params, userId: c.userId };
    };
    const toolDefs: ToolDefinition[] = [
      {
        name: "spy",
        description: "spy tool",
        parameters: z.object({ input: z.string() }),
        execute: executeSpy,
      },
    ];

    const chatTools = toChatTools(toolDefs, ctx);
    const result = await chatTools.spy.execute!({ input: "hello" }, { toolCallId: "tc1", messages: [] });

    expect(result).toEqual({ params: { input: "hello" }, userId: "u1" });
  });

  it("re-throws TypeError and ReferenceError instead of catching them", async () => {
    const ctx: ToolContext = {
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "America/Toronto",
    };
    const toolDefs: ToolDefinition[] = [
      {
        name: "buggy",
        description: "buggy tool",
        parameters: z.object({}),
        execute: async () => {
          throw new TypeError("cannot read property of undefined");
        },
      },
    ];

    const chatTools = toChatTools(toolDefs, ctx);
    await expect(
      chatTools.buggy.execute!({}, { toolCallId: "tc1", messages: [] }),
    ).rejects.toThrow(TypeError);
  });

  it("returns error object for runtime failures", async () => {
    const ctx: ToolContext = {
      userId: "u1",
      supabase: {} as ToolContext["supabase"],
      date: "2026-04-08",
      timezone: "America/Toronto",
    };
    const toolDefs: ToolDefinition[] = [
      {
        name: "failing",
        description: "failing tool",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("database timeout");
        },
      },
    ];

    const chatTools = toChatTools(toolDefs, ctx);
    const result = await chatTools.failing.execute!({}, { toolCallId: "tc1", messages: [] });
    expect(result).toEqual({ error: "Failed to execute failing: database timeout" });
  });
});
