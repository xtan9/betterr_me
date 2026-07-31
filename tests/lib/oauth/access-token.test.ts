// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  ACCESS_TOKEN_POLICY,
  issueAccessToken,
  verifyAccessToken,
} from "@/lib/oauth/access-token";

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const NOW = new Date("2026-07-31T12:00:00.000Z");

describe("OAuth access-token policy", () => {
  it("issues and verifies every required claim through one policy", async () => {
    vi.stubEnv("API_KEY_HMAC_SECRET", "test-access-token-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://betterr.test");

    const credential = await issueAccessToken(
      {
        userId: "user-123",
        clientId: "client-123",
        scopes: ["read", "write"],
      },
      () => NOW,
    );

    expect(credential).toMatchObject({
      tokenType: "bearer",
      expiresIn: ACCESS_TOKEN_POLICY.lifetimeSeconds,
      scope: "read write",
    });

    const payload = JSON.parse(
      Buffer.from(credential.accessToken.split(".")[1], "base64url").toString(),
    );
    expect(payload).toEqual({
      iss: "https://betterr.test",
      aud: ACCESS_TOKEN_POLICY.audience,
      sub: "user-123",
      client_id: "client-123",
      scope: "read write",
      iat: Math.floor(NOW.getTime() / 1000),
      exp:
        Math.floor(NOW.getTime() / 1000) +
        ACCESS_TOKEN_POLICY.lifetimeSeconds,
    });

    await expect(
      verifyAccessToken(credential.accessToken, () => NOW),
    ).resolves.toEqual({
      outcome: "verified",
      userId: "user-123",
      clientId: "client-123",
      scopes: ["read", "write"],
    });
  });

  it("rejects a token when the configured issuer no longer matches", async () => {
    vi.stubEnv("API_KEY_HMAC_SECRET", "test-access-token-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://issuer-a.test");
    const credential = await issueAccessToken(
      { userId: "user-123", clientId: "client-123", scopes: ["read"] },
      () => NOW,
    );

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://issuer-b.test");
    await expect(
      verifyAccessToken(credential.accessToken, () => NOW),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("does not issue unsupported or empty scopes", async () => {
    vi.stubEnv("API_KEY_HMAC_SECRET", "test-access-token-secret");

    await expect(
      issueAccessToken({
        userId: "user-123",
        clientId: "client-123",
        scopes: ["admin"],
      }),
    ).rejects.toThrow("Unsupported access-token scope");
    await expect(
      issueAccessToken({
        userId: "user-123",
        clientId: "client-123",
        scopes: [],
      }),
    ).rejects.toThrow("Access token requires at least one scope");
  });
});
