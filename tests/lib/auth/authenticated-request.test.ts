// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileSingle: vi.fn(),
  verifyMcpToken: vi.fn(),
  logError: vi.fn(),
  serviceClient: { name: "service-client" },
  queryLog: [] as Array<{
    table: string;
    method: string;
    args: unknown[];
  }>,
}));

const profileQuery = {
  select: vi.fn((...args: unknown[]) => {
    mocks.queryLog.push({ table: "profiles", method: "select", args });
    return profileQuery;
  }),
  eq: vi.fn((...args: unknown[]) => {
    mocks.queryLog.push({ table: "profiles", method: "eq", args });
    return profileQuery;
  }),
  single: vi.fn((...args: unknown[]) => {
    mocks.queryLog.push({ table: "profiles", method: "single", args });
    return mocks.profileSingle(...args);
  }),
};
const cookieClient = {
  auth: { getUser: mocks.getUser },
  from: vi.fn((...args: unknown[]) => {
    mocks.queryLog.push({ table: String(args[0]), method: "from", args });
    return profileQuery;
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => cookieClient),
}));
vi.mock("@/lib/mcp/token", () => ({
  verifyMcpTokenCredential: mocks.verifyMcpToken,
}));
vi.mock("@/lib/logger", () => ({
  log: { error: mocks.logError, warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: vi.fn(() => mocks.serviceClient),
  };
});

import {
  authenticateAdminCredential,
  authenticateCookieCredential,
  authenticateMcpCredential,
} from "@/lib/auth/authenticated-request";

describe("authenticated request adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("API_KEY_HMAC_SECRET", "mcp-token-secret");
    mocks.queryLog.length = 0;
  });

  it("resolves a cookie session at the real cookie adapter boundary", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "cookie-user" } },
      error: null,
    });

    const result = await authenticateCookieCredential(
      new Request("https://example.test/tasks"),
    );

    expect(result).toEqual({
      outcome: "authenticated",
      principal: { userId: "cookie-user", credential: "cookie" },
      permissions: ["read", "write"],
      client: cookieClient,
    });
  });

  it("resolves a cookie session when an unrelated authorization scheme is present", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "cookie-user" } },
      error: null,
    });

    const result = await authenticateCookieCredential(
      new Request("https://example.test/tasks", {
        headers: { authorization: "Basic unrelated-credential" },
      }),
    );

    expect(result).toEqual({
      outcome: "authenticated",
      principal: { userId: "cookie-user", credential: "cookie" },
      permissions: ["read", "write"],
      client: cookieClient,
    });
  });

  it.each([
    ["cookie", authenticateCookieCredential],
    ["admin", authenticateAdminCredential],
  ])("maps a missing %s session to anonymous", async (_credential, authenticate) => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    await expect(
      authenticate(new Request("https://example.test/protected")),
    ).resolves.toEqual({ outcome: "anonymous" });
  });

  it.each([
    ["cookie", authenticateCookieCredential],
    ["admin", authenticateAdminCredential],
  ])("maps an invalid %s session to invalid", async (_credential, authenticate) => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Invalid JWT", 401, "bad_jwt"),
    });

    await expect(
      authenticate(new Request("https://example.test/protected")),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it.each([
    ["cookie", authenticateCookieCredential],
    ["admin", authenticateAdminCredential],
  ])(
    "maps a %s auth infrastructure failure to misconfigured",
    async (credential, authenticate) => {
      const authError = new AuthRetryableFetchError(
        "Auth service unavailable",
        503,
      );
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: authError,
      });

      await expect(
        authenticate(new Request("https://example.test/protected")),
      ).resolves.toEqual({ outcome: "misconfigured" });
      expect(mocks.logError).toHaveBeenCalledWith(
        "[auth] Credential validation failed",
        undefined,
        {
          credential,
          failureType: "AuthRetryableFetchError",
          status: 503,
        },
      );
    },
  );

  it.each([
    ["cookie", authenticateCookieCredential],
    ["admin", authenticateAdminCredential],
  ])(
    "maps a rate-limited %s auth service to misconfigured",
    async (_credential, authenticate) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: new AuthApiError("Rate limit exceeded", 429, "over_request_rate_limit"),
      });

      await expect(
        authenticate(new Request("https://example.test/protected")),
      ).resolves.toEqual({ outcome: "misconfigured" });
    },
  );

  it("resolves an admin session at the real admin adapter boundary", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "admin-123" } },
      error: null,
    });
    mocks.profileSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    });

    const result = await authenticateAdminCredential(
      new Request("https://example.test/admin"),
    );

    expect(result).toEqual({
      outcome: "authenticated",
      principal: { userId: "admin-123", credential: "admin" },
      permissions: ["read", "write", "admin"],
      client: mocks.serviceClient,
    });
    expect(mocks.queryLog).toEqual([
      { table: "profiles", method: "from", args: ["profiles"] },
      { table: "profiles", method: "select", args: ["role"] },
      { table: "profiles", method: "eq", args: ["id", "admin-123"] },
      { table: "profiles", method: "single", args: [] },
    ]);
  });

  it("maps a non-admin session to forbidden at the admin adapter boundary", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mocks.profileSingle.mockResolvedValue({
      data: { role: "user" },
      error: null,
    });

    const result = await authenticateAdminCredential(
      new Request("https://example.test/admin"),
    );

    expect(result).toEqual({ outcome: "forbidden" });
  });

  it("maps a missing admin profile to forbidden", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-without-profile" } },
      error: null,
    });
    mocks.profileSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "No rows returned" },
    });

    await expect(
      authenticateAdminCredential(new Request("https://example.test/admin")),
    ).resolves.toEqual({ outcome: "forbidden" });
  });

  it("maps an admin profile infrastructure failure to misconfigured", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "admin-123" } },
      error: null,
    });
    mocks.profileSingle.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "connection failure" },
    });

    await expect(
      authenticateAdminCredential(new Request("https://example.test/admin")),
    ).resolves.toEqual({ outcome: "misconfigured" });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] Admin profile lookup failed",
      undefined,
      { failureType: "object", code: "08006" },
    );
  });

  it("resolves an MCP bearer token at the real MCP adapter boundary", async () => {
    mocks.verifyMcpToken.mockResolvedValue({
      outcome: "authenticated",
      userId: "mcp-user",
      clientId: "mcp-client",
      scopes: ["read", "write"],
    });

    const result = await authenticateMcpCredential(
      new Request("https://example.test/mcp", {
        headers: { authorization: "Bearer signed-mcp-token" },
      }),
    );

    expect(result).toEqual({
      outcome: "authenticated",
      principal: {
        userId: "mcp-user",
        credential: "mcp",
        clientId: "mcp-client",
      },
      permissions: ["read", "write"],
      client: mocks.serviceClient,
    });
  });

  it("maps a request without a bearer token to anonymous at the MCP adapter boundary", async () => {
    await expect(
      authenticateMcpCredential(new Request("https://example.test/mcp")),
    ).resolves.toEqual({ outcome: "anonymous" });
    expect(mocks.verifyMcpToken).not.toHaveBeenCalled();
  });

  it("maps rejected MCP claims to invalid at the MCP adapter boundary", async () => {
    mocks.verifyMcpToken.mockResolvedValue({ outcome: "invalid" });

    await expect(
      authenticateMcpCredential(
        new Request("https://example.test/mcp", {
          headers: { authorization: "Bearer rejected-mcp-token" },
        }),
      ),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("maps missing MCP configuration to misconfigured at the MCP adapter boundary", async () => {
    vi.stubEnv("API_KEY_HMAC_SECRET", "");

    await expect(
      authenticateMcpCredential(
        new Request("https://example.test/mcp", {
          headers: { authorization: "Bearer signed-mcp-token" },
        }),
      ),
    ).resolves.toEqual({ outcome: "misconfigured" });
    expect(mocks.verifyMcpToken).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] MCP credential configuration is incomplete",
    );
  });
});
