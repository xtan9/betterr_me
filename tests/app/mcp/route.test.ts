// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  handleRequest: vi.fn(async () => Response.json({ ok: true })),
  logError: vi.fn(),
}));

vi.mock("mcp-handler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mcp-handler")>();
  return {
    ...actual,
    createMcpHandler: vi.fn(() => mocks.handleRequest),
  };
});

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mocks.authenticateRequest,
  MCP_REQUEST_POLICY: {
    allowedCredentials: ["mcp"],
    requiredPermission: "read",
  },
}));

vi.mock("@/lib/mcp/tools", () => ({
  registerTools: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  log: { error: mocks.logError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/mcp/route";

describe("MCP route authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleRequest.mockImplementation(async () => Response.json({ ok: true }));
  });

  it("returns an invalid-credentials challenge for a rejected bearer token", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "invalid",
      error: "Invalid credentials",
      status: 401,
    });

    const response = await GET(
      new Request("https://betterr.test/mcp", {
        headers: {
          authorization: "Bearer rejected-token",
          "x-forwarded-host": "api.bettermirror.test",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer error="invalid_token", error_description="Invalid credentials", resource_metadata="https://api.bettermirror.test/.well-known/oauth-protected-resource"',
    );
  });

  it("returns an insufficient-scope challenge for a forbidden token", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "forbidden",
      error: "Forbidden",
      status: 403,
    });

    const response = await GET(
      new Request("https://betterr.test/mcp", {
        headers: { authorization: "Bearer read-only-token" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", error_description="Forbidden", resource_metadata="https://betterr.test/.well-known/oauth-protected-resource"',
    );
  });

  it("maps credential infrastructure failures to a 500 without a bearer challenge", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });

    const response = await GET(
      new Request("https://betterr.test/mcp", {
        headers: { authorization: "Bearer signed-mcp-token" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server misconfigured",
    });
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("maps an unexpected authentication failure to a logged 500 response", async () => {
    mocks.authenticateRequest.mockRejectedValue(
      new Error("credential internals must not be exposed"),
    );

    const response = await GET(
      new Request("https://betterr.test/mcp", {
        headers: { authorization: "Bearer signed-mcp-token" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server misconfigured",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[mcp] Request authentication failed",
      undefined,
      { failureType: "Error" },
    );
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(
      "credential internals must not be exposed",
    );
  });

  it("maps an unexpected MCP handler failure to a logged 500 response", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      ok: true,
      principal: {
        userId: "mcp-user",
        credential: "mcp",
        clientId: "mcp-client",
      },
      permissions: ["read"],
      client: { name: "service-client" },
    });
    mocks.handleRequest.mockRejectedValue(
      new Error("handler internals must not be exposed"),
    );

    const response = await GET(
      new Request("https://betterr.test/mcp", {
        headers: { authorization: "Bearer signed-mcp-token" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server misconfigured",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[mcp] Request handler failed",
      undefined,
      { failureType: "Error" },
    );
  });
});
