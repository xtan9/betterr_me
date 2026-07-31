import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockCreateClient, mockRpc } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn() },
}));

import { registerTools } from "@/lib/mcp/tools";

describe("MCP calendar deletion", () => {
  const mockRegisterTool = vi.fn();
  const server = {
    registerTool: mockRegisterTool,
  } as unknown as McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    mockCreateClient.mockReturnValue({ rpc: mockRpc });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("deletes only the validated MCP user's supplied schedule", async () => {
    const outcome = {
      event_id: "event-499",
      deleted: true,
      reminders_deleted: 1,
    };
    mockRpc.mockResolvedValue({ data: outcome, error: null });
    registerTools(server);

    const registration = mockRegisterTool.mock.calls.find(
      ([name]) => name === "deleteEvent",
    );
    expect(registration).toBeDefined();
    const handler = registration?.[2] as (
      params: { eventId: string },
      extra: Record<string, unknown>,
    ) => Promise<unknown>;

    const result = await handler(
      { eventId: "event-499" },
      {
        authInfo: {
          extra: { userId: "validated-mcp-user" },
        },
      },
    );

    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://supabase.example.test",
      "test-service-role-key",
    );
    expect(mockRpc).toHaveBeenCalledWith(
      "delete_calendar_event_with_reminders",
      {
        p_user_id: "validated-mcp-user",
        p_event_id: "event-499",
      },
    );
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
    });
  });
});
