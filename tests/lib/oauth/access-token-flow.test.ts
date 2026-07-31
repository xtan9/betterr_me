// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  issueAccessToken,
  verifyAccessToken,
} from "@/lib/oauth/access-token";
import { createAuthorizationCodeExchanger } from "@/lib/oauth/authorization-code";
import { createRefreshTokenRotator } from "@/lib/oauth/refresh-token";

describe("OAuth access-token flow", () => {
  it("issues, refreshes, and verifies credentials through the same policy", async () => {
    vi.stubEnv("API_KEY_HMAC_SECRET", "end-to-end-access-token-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://betterr.test");
    let issuedAt = new Date("2026-07-31T12:00:00.000Z");
    const issue = (context: {
      userId: string;
      clientId: string;
      scopes: string[];
    }) => issueAccessToken(context, () => issuedAt);

    const exchanger = createAuthorizationCodeExchanger({
      store: {
        save: vi.fn(),
        consume: vi.fn().mockResolvedValue({
          ok: true,
          record: {
            codeHash: "stored-hash",
            clientId: "client-123",
            redirectUri: "http://localhost/callback",
            userId: "user-123",
            scopes: ["read", "write"],
            expiresAt: new Date("2026-07-31T12:05:00.000Z"),
            codeChallenge: "challenge",
            codeChallengeMethod: "S256",
            used: true,
          },
        }),
      },
      issueCredentials: async (context) => ({
        ...(await issue(context)),
        refreshToken: "refresh-token-1",
      }),
    });
    const authorization = await exchanger.exchange({
      code: "authorization-code",
      clientId: "client-123",
      redirectUri: "http://localhost/callback",
      codeVerifier: "verifier",
    });
    expect(authorization.ok).toBe(true);
    if (!authorization.ok) throw new Error("authorization exchange failed");
    await expect(
      verifyAccessToken(authorization.credentials.accessToken, () => issuedAt),
    ).resolves.toMatchObject({
      outcome: "verified",
      userId: "user-123",
      clientId: "client-123",
      scopes: ["read", "write"],
    });

    issuedAt = new Date("2026-07-31T12:01:00.000Z");
    const rotator = createRefreshTokenRotator({
      store: {
        resolve: vi.fn().mockResolvedValue({
          ok: true,
          context: {
            userId: "user-123",
            clientId: "client-123",
            scopes: ["read", "write"],
          },
        }),
        rotate: vi.fn().mockResolvedValue({
          ok: true,
          context: {
            userId: "user-123",
            clientId: "client-123",
            scopes: ["read", "write"],
          },
        }),
      },
      now: () => issuedAt,
      generateToken: () => "refresh-token-2",
      issueAccessToken: issue,
    });
    const refresh = await rotator.rotate({
      refreshToken: authorization.credentials.refreshToken!,
      clientId: "client-123",
    });
    expect(refresh.ok).toBe(true);
    if (!refresh.ok) throw new Error("refresh exchange failed");
    expect(refresh.credentials.refreshToken).toBe("refresh-token-2");
    await expect(
      verifyAccessToken(refresh.credentials.accessToken, () => issuedAt),
    ).resolves.toMatchObject({
      outcome: "verified",
      userId: "user-123",
      clientId: "client-123",
      scopes: ["read", "write"],
    });
  });
});
