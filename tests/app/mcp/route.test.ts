// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyMcpAuth, mockProtocolHandler } = vi.hoisted(() => ({
  mockVerifyMcpAuth: vi.fn(),
  mockProtocolHandler: vi.fn(async () => new Response(null, { status: 204 })),
}));

vi.mock("mcp-handler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mcp-handler")>();
  return {
    ...actual,
    createMcpHandler: vi.fn(() => mockProtocolHandler),
  };
});

vi.mock("@/lib/mcp/token", () => ({ verifyMcpAuth: mockVerifyMcpAuth }));
vi.mock("@/lib/mcp/tools", () => ({ registerTools: vi.fn() }));

import { DELETE, GET, POST } from "@/app/mcp/route";

describe("/mcp authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([GET, POST, DELETE])("requires authorization for every MCP method", async (handler) => {
    mockVerifyMcpAuth.mockResolvedValue(undefined);

    const response = await handler(new Request("https://betterr.example/mcp"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://betterr.example/.well-known/oauth-protected-resource"',
    );
    expect(mockProtocolHandler).not.toHaveBeenCalled();
  });

  it("passes the bearer token to authentication and serves an authenticated request", async () => {
    mockVerifyMcpAuth.mockResolvedValue({
      token: "valid-token",
      clientId: "desktop-client",
      scopes: ["read", "write"],
      extra: { userId: "user-id" },
    });
    const request = new Request("https://betterr.example/mcp", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(mockVerifyMcpAuth).toHaveBeenCalledExactlyOnceWith(request, "valid-token");
    expect(mockProtocolHandler).toHaveBeenCalledExactlyOnceWith(request);
    expect(request.auth).toMatchObject({
      token: "valid-token",
      clientId: "desktop-client",
    });
  });
});
