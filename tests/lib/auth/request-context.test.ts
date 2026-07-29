// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: mocks.logError, warn: vi.fn(), info: vi.fn() },
}));

import {
  resolveAuthenticatedRequestContext,
  type AuthenticatedRequestAdapters,
} from "@/lib/auth/request-context";

const privilegedClient = { name: "privileged-client" };

function adapters(
  overrides: Partial<AuthenticatedRequestAdapters<typeof privilegedClient>> = {},
): AuthenticatedRequestAdapters<typeof privilegedClient> {
  return {
    cookie: async () => ({ outcome: "anonymous" }),
    apiKey: async () => ({ outcome: "anonymous" }),
    admin: async () => ({ outcome: "anonymous" }),
    mcp: async () => ({ outcome: "anonymous" }),
    ...overrides,
  };
}

describe("resolveAuthenticatedRequestContext", () => {
  it("returns the API-key principal, permissions, and privileged client when policy allows it", async () => {
    const request = new Request("https://example.test/api/tasks", {
      headers: { authorization: "Bearer brm_valid" },
    });

    const result = await resolveAuthenticatedRequestContext(
      request,
      {
        allowedCredentials: ["apiKey"],
        requiredPermission: "read",
      },
      adapters({
        apiKey: async () => ({
          outcome: "authenticated",
          principal: { userId: "user-123", credential: "apiKey" },
          permissions: ["read", "write"],
          client: privilegedClient,
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      principal: { userId: "user-123", credential: "apiKey" },
      permissions: ["read", "write"],
      client: privilegedClient,
    });
  });

  it("runs the authorization hook exactly once after permission succeeds", async () => {
    const events: string[] = [];

    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks"),
      {
        allowedCredentials: ["apiKey"],
        requiredPermission: "write",
      },
      adapters({
        apiKey: async () => {
          events.push("credential-resolved");
          return {
            outcome: "authenticated",
            principal: { userId: "user-123", credential: "apiKey" },
            permissions: ["read", "write"],
            client: privilegedClient,
            onAuthorized: () => events.push("authorized"),
          };
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(events).toEqual(["credential-resolved", "authorized"]);
  });

  it("maps a request without credentials to the anonymous response", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks"),
      {
        allowedCredentials: ["cookie", "apiKey"],
        requiredPermission: "read",
      },
      adapters(),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });
  });

  it("maps a rejected credential to the invalid response", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks", {
        headers: { authorization: "Bearer brm_invalid" },
      }),
      {
        allowedCredentials: ["apiKey"],
        requiredPermission: "read",
      },
      adapters({ apiKey: async () => ({ outcome: "invalid" }) }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "invalid",
      error: "Invalid credentials",
      status: 401,
    });
  });

  it("maps an authenticated principal without the route permission to forbidden", async () => {
    const onAuthorized = vi.fn();
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks", { method: "POST" }),
      {
        allowedCredentials: ["apiKey"],
        requiredPermission: "write",
      },
      adapters({
        apiKey: async () => ({
          outcome: "authenticated",
          principal: { userId: "user-123", credential: "apiKey" },
          permissions: ["read"],
          client: privilegedClient,
          onAuthorized,
        }),
      }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "forbidden",
      error: "Forbidden",
      status: 403,
    });
    expect(onAuthorized).not.toHaveBeenCalled();
  });

  it("maps an adapter-level forbidden outcome to the forbidden response", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/admin"),
      {
        allowedCredentials: ["admin"],
        requiredPermission: "admin",
      },
      adapters({ admin: async () => ({ outcome: "forbidden" }) }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "forbidden",
      error: "Forbidden",
      status: 403,
    });
  });

  it("maps unavailable credential infrastructure to the misconfigured response", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks", {
        headers: { authorization: "Bearer brm_valid" },
      }),
      {
        allowedCredentials: ["apiKey"],
        requiredPermission: "read",
      },
      adapters({ apiKey: async () => ({ outcome: "misconfigured" }) }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] Credential adapter reported misconfiguration",
      undefined,
      { credential: "apiKey" },
    );
  });

  it.each(["cookie", "admin", "mcp"] as const)(
    "accepts a %s principal only when that credential is in the route policy",
    async (credential) => {
      const result = await resolveAuthenticatedRequestContext(
        new Request("https://example.test/protected"),
        {
          allowedCredentials: [credential],
          requiredPermission: credential === "admin" ? "admin" : "read",
        },
        adapters({
          [credential]: async () => ({
            outcome: "authenticated",
            principal: { userId: `${credential}-user`, credential },
            permissions:
              credential === "admin"
                ? ["read", "write", "admin"]
                : ["read", "write"],
            client: privilegedClient,
          }),
        }),
      );

      expect(result).toEqual({
        ok: true,
        principal: { userId: `${credential}-user`, credential },
        permissions:
          credential === "admin"
            ? ["read", "write", "admin"]
            : ["read", "write"],
        client: privilegedClient,
      });
    },
  );

  it("does not consult a credential adapter omitted from the route policy", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/cookie-only", {
        headers: { authorization: "Bearer brm_valid" },
      }),
      {
        allowedCredentials: ["cookie"],
        requiredPermission: "read",
      },
      adapters({
        apiKey: async () => ({
          outcome: "authenticated",
          principal: { userId: "api-user", credential: "apiKey" },
          permissions: ["read", "write"],
          client: privilegedClient,
        }),
      }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "invalid",
      error: "Invalid credentials",
      status: 401,
    });
  });

  it("maps an empty allowed-credential policy to misconfigured", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/unconfigured"),
      {
        allowedCredentials: [],
        requiredPermission: "read",
      },
      adapters(),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] Request policy has no allowed credentials",
    );
  });

  it("maps a credential adapter failure to misconfigured without exposing details", async () => {
    const adapterError = new Error("database password appeared here");
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/api/tasks"),
      {
        allowedCredentials: ["cookie"],
        requiredPermission: "read",
      },
      adapters({
        cookie: async () => {
          throw adapterError;
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] Credential adapter failed",
      undefined,
      { credential: "cookie", failureType: "Error" },
    );
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(
      "database password appeared here",
    );
  });

  it("rejects an adapter principal whose credential is not allowed by the route", async () => {
    const result = await resolveAuthenticatedRequestContext(
      new Request("https://example.test/cookie-only"),
      {
        allowedCredentials: ["cookie"],
        requiredPermission: "read",
      },
      adapters({
        cookie: async () => ({
          outcome: "authenticated",
          principal: { userId: "user-123", credential: "apiKey" },
          permissions: ["read"],
          client: privilegedClient,
        }),
      }),
    );

    expect(result).toEqual({
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "[auth] Credential adapter returned a mismatched principal",
      undefined,
      { adapterCredential: "cookie", principalCredential: "apiKey" },
    );
  });
});
