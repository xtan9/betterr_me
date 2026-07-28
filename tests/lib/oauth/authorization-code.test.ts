// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  createAuthorizationCodeLifecycle,
  type AuthorizationCodeExchangeMatch,
  type AuthorizationCodeRecord,
  type AuthorizationCodeStore,
  type ConsumeAuthorizationCodeResult,
} from "@/lib/oauth/authorization-code";

class InMemoryAuthorizationCodeStore implements AuthorizationCodeStore {
  private readonly records = new Map<string, AuthorizationCodeRecord>();

  async save(record: AuthorizationCodeRecord): Promise<void> {
    this.records.set(record.codeHash, record);
  }

  async consume(
    codeHash: string,
    matches: AuthorizationCodeExchangeMatch,
  ): Promise<ConsumeAuthorizationCodeResult> {
    const record = this.records.get(codeHash);
    if (!record) return { ok: false, error: "invalid_code" };
    if (record.used) return { ok: false, error: "reused_code" };
    if (record.expiresAt <= matches.now) {
      return { ok: false, error: "expired_code" };
    }
    if (
      record.clientId !== matches.clientId ||
      record.redirectUri !== matches.redirectUri ||
      record.codeChallenge !== matches.codeChallenge ||
      record.codeChallengeMethod !== matches.codeChallengeMethod
    ) return { ok: false, error: "mismatched_code" };

    record.used = true;
    return { ok: true, record };
  }
}

describe("authorization-code lifecycle", () => {
  it("exchanges an issued code once with its bound client, redirect, user, scopes, expiry, and proof key", async () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    const store = new InMemoryAuthorizationCodeStore();
    const issueCredentials = vi.fn(async (outcome) => ({
      accessToken: `access-for-${outcome.userId}`,
      tokenType: "bearer" as const,
      expiresIn: 3600,
      scope: outcome.scopes.join(" "),
    }));
    const lifecycle = createAuthorizationCodeLifecycle({
      store,
      now: () => now,
      generateCode: () => "issued-code",
      issueCredentials,
    });

    const issued = await lifecycle.issue({
      clientId: "client-123",
      redirectUri: "http://localhost:3000/callback",
      userId: "user-456",
      scopes: ["read", "write"],
      codeChallenge: "xLvLH77JnWW_WdhcjLYu4tuWPw_hBvSD2a-nO9Tjmoo",
      codeChallengeMethod: "S256",
    });
    const credentials = await lifecycle.exchange({
      code: issued.code,
      clientId: "client-123",
      redirectUri: "http://localhost:3000/callback",
      codeVerifier: "correct horse battery staple",
    });

    expect(issued).toEqual({
      code: "issued-code",
      expiresAt: new Date("2026-07-28T12:05:00.000Z"),
    });
    expect(credentials).toEqual({
      ok: true,
      credentials: {
        accessToken: "access-for-user-456",
        tokenType: "bearer",
        expiresIn: 3600,
        scope: "read write",
      },
    });
    expect(issueCredentials).toHaveBeenCalledWith({
      clientId: "client-123",
      userId: "user-456",
      scopes: ["read", "write"],
    });

    await expect(
      lifecycle.exchange({
        code: issued.code,
        clientId: "client-123",
        redirectUri: "http://localhost:3000/callback",
        codeVerifier: "correct horse battery staple",
      }),
    ).resolves.toEqual({ ok: false, error: "reused_code" });
    expect(issueCredentials).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "invalid",
      exchange: { code: "not-issued", clientId: "client-123", redirectUri: "http://localhost/callback", codeVerifier: "verifier" },
      expected: "invalid_code",
    },
    {
      name: "client-mismatched",
      exchange: { code: "issued-code", clientId: "other-client", redirectUri: "http://localhost/callback", codeVerifier: "verifier" },
      expected: "mismatched_code",
    },
    {
      name: "redirect-mismatched",
      exchange: { code: "issued-code", clientId: "client-123", redirectUri: "http://localhost/other", codeVerifier: "verifier" },
      expected: "mismatched_code",
    },
    {
      name: "proof-key-mismatched",
      exchange: { code: "issued-code", clientId: "client-123", redirectUri: "http://localhost/callback", codeVerifier: "wrong" },
      expected: "mismatched_code",
    },
  ])("issues no credentials for a $name code", async ({ exchange, expected }) => {
    const issueCredentials = vi.fn();
    const lifecycle = createAuthorizationCodeLifecycle({
      store: new InMemoryAuthorizationCodeStore(),
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      generateCode: () => "issued-code",
      issueCredentials,
    });
    await lifecycle.issue({
      clientId: "client-123",
      redirectUri: "http://localhost/callback",
      userId: "user-456",
      scopes: ["read"],
      codeChallenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      codeChallengeMethod: "S256",
    });

    await expect(lifecycle.exchange(exchange)).resolves.toEqual({
      ok: false,
      error: expected,
    });
    expect(issueCredentials).not.toHaveBeenCalled();
  });

  it("issues no credentials for an expired code", async () => {
    let now = new Date("2026-07-28T12:00:00.000Z");
    const issueCredentials = vi.fn();
    const lifecycle = createAuthorizationCodeLifecycle({
      store: new InMemoryAuthorizationCodeStore(),
      now: () => now,
      generateCode: () => "issued-code",
      issueCredentials,
    });
    await lifecycle.issue({
      clientId: "client-123",
      redirectUri: "http://localhost/callback",
      userId: "user-456",
      scopes: ["read"],
      codeChallenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      codeChallengeMethod: "S256",
    });
    now = new Date("2026-07-28T12:05:00.000Z");

    await expect(
      lifecycle.exchange({
        code: "issued-code",
        clientId: "client-123",
        redirectUri: "http://localhost/callback",
        codeVerifier: "verifier",
      }),
    ).resolves.toEqual({ ok: false, error: "expired_code" });
    expect(issueCredentials).not.toHaveBeenCalled();
  });

  it("keeps a code consumed when credential issuance fails", async () => {
    const issueCredentials = vi.fn()
      .mockRejectedValueOnce(new Error("credential store unavailable"))
      .mockResolvedValueOnce({
        accessToken: "access-token",
        tokenType: "bearer",
        expiresIn: 3600,
        scope: "read",
      });
    const lifecycle = createAuthorizationCodeLifecycle({
      store: new InMemoryAuthorizationCodeStore(),
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      generateCode: () => "issued-code",
      issueCredentials,
    });
    await lifecycle.issue({
      clientId: "client-123",
      redirectUri: "http://localhost/callback",
      userId: "user-456",
      scopes: ["read"],
      codeChallenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      codeChallengeMethod: "S256",
    });
    const exchange = {
      code: "issued-code",
      clientId: "client-123",
      redirectUri: "http://localhost/callback",
      codeVerifier: "verifier",
    };

    await expect(lifecycle.exchange(exchange)).rejects.toThrow(
      "credential store unavailable",
    );
    await expect(lifecycle.exchange(exchange)).resolves.toEqual({
      ok: false,
      error: "reused_code",
    });
    expect(issueCredentials).toHaveBeenCalledTimes(1);
  });
});
