// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  createRefreshTokenRotator,
  type RefreshTokenRotationStore,
} from "@/lib/oauth/refresh-token";

describe("refresh-token rotation lifecycle", () => {
  it("atomically replaces a valid refresh token and returns credentials bound to its context", async () => {
    const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
      .mockResolvedValue({
        ok: true,
        context: {
          clientId: "client-123",
          userId: "user-456",
          scopes: ["read", "write"],
        },
      });
    const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>()
      .mockResolvedValue({
        ok: true,
        context: {
          clientId: "client-123",
          userId: "user-456",
          scopes: ["read", "write"],
        },
      });
    const issueAccessToken = vi.fn().mockResolvedValue("access-token");
    const rotator = createRefreshTokenRotator({
      store: { resolve, rotate },
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      generateToken: () => "next-refresh-token",
      issueAccessToken,
    });

    await expect(rotator.rotate({
      refreshToken: "current-refresh-token",
      clientId: "client-123",
    })).resolves.toEqual({
      ok: true,
      credentials: {
        accessToken: "access-token",
        tokenType: "bearer",
        expiresIn: 3600,
        refreshToken: "next-refresh-token",
        scope: "read write",
      },
    });
    expect(resolve).toHaveBeenCalledExactlyOnceWith({
      currentTokenHash:
        "7db682c0ea66a44ce7173de5f61b910eb3ff294376c9bedea2794109549efe08",
      clientId: "client-123",
      now: new Date("2026-07-28T12:00:00.000Z"),
    });
    expect(issueAccessToken).toHaveBeenCalledExactlyOnceWith({
      clientId: "client-123",
      userId: "user-456",
      scopes: ["read", "write"],
    });
    expect(rotate).toHaveBeenCalledExactlyOnceWith({
      currentTokenHash:
        "7db682c0ea66a44ce7173de5f61b910eb3ff294376c9bedea2794109549efe08",
      nextTokenHash:
        "7385182128f827bb459fe53a6c19cbe05bf0064d77bc5eca6c81c857bc3d5078",
      nextExpiresAt: new Date("2027-01-24T12:00:00.000Z"),
      clientId: "client-123",
      now: new Date("2026-07-28T12:00:00.000Z"),
    });
    expect(issueAccessToken.mock.invocationCallOrder[0])
      .toBeLessThan(rotate.mock.invocationCallOrder[0]);
  });

  it("leaves the refresh token usable when access-token issuance fails", async () => {
    const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
      .mockResolvedValue({
        ok: true,
        context: {
          clientId: "client-123",
          userId: "user-456",
          scopes: ["read", "write"],
        },
      });
    const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>()
      .mockResolvedValue({
        ok: true,
        context: {
          clientId: "client-123",
          userId: "user-456",
          scopes: ["read", "write"],
        },
      });
    const rotator = createRefreshTokenRotator({
      store: { resolve, rotate },
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      generateToken: () => "discarded-refresh-token",
      issueAccessToken: vi.fn().mockRejectedValue(new Error("signing failed")),
    });

    await expect(rotator.rotate({
      refreshToken: "current-refresh-token",
      clientId: "client-123",
    })).rejects.toThrow("signing failed");
    expect(rotate).not.toHaveBeenCalled();
  });

  it("revokes a reused token family without depending on token generation", async () => {
    const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
      .mockResolvedValue({ ok: false, error: "reused_token" });
    const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>()
      .mockResolvedValue({ ok: false, error: "reused_token" });
    const rotator = createRefreshTokenRotator({
      store: { resolve, rotate },
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      generateToken: vi.fn(() => {
        throw new Error("randomness unavailable");
      }),
      issueAccessToken: vi.fn(),
    });

    await expect(rotator.rotate({
      refreshToken: "reused-refresh-token",
      clientId: "client-123",
    })).resolves.toEqual({ ok: false, error: "reused_token" });
    expect(rotate).toHaveBeenCalledExactlyOnceWith({
      currentTokenHash:
        "c83cf2d32964eed2568e30f8895325087127a44538f330e78bc8b838674c1725",
      nextTokenHash: "0".repeat(64),
      nextExpiresAt: new Date("2027-01-24T12:00:00.000Z"),
      clientId: "client-123",
      now: new Date("2026-07-28T12:00:00.000Z"),
    });
  });

  it.each([
    "invalid_token",
    "expired_token",
    "mismatched_context",
    "revoked_token",
  ] as const)(
    "returns a preliminary %s outcome without issuing credentials",
    async (error) => {
      const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
        .mockResolvedValue({ ok: false, error });
      const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>();
      const generateToken = vi.fn(() => "must-not-be-generated");
      const issueAccessToken = vi.fn().mockResolvedValue("must-not-be-issued");
      const rotator = createRefreshTokenRotator({
        store: { resolve, rotate },
        generateToken,
        issueAccessToken,
      });

      await expect(rotator.rotate({
        refreshToken: "unusable-refresh-token",
        clientId: "client-123",
      })).resolves.toEqual({ ok: false, error });
      expect(rotate).not.toHaveBeenCalled();
      expect(generateToken).not.toHaveBeenCalled();
      expect(issueAccessToken).not.toHaveBeenCalled();
    },
  );

  it("rejects when a consumed token unexpectedly rotates", async () => {
    const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
      .mockResolvedValue({ ok: false, error: "reused_token" });
    const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>()
      .mockResolvedValue({
        ok: true,
        context: {
          clientId: "client-123",
          userId: "user-456",
          scopes: ["read"],
        },
      });
    const generateToken = vi.fn(() => "must-not-be-generated");
    const issueAccessToken = vi.fn().mockResolvedValue("must-not-be-issued");
    const rotator = createRefreshTokenRotator({
      store: { resolve, rotate },
      generateToken,
      issueAccessToken,
    });

    await expect(rotator.rotate({
      refreshToken: "reused-refresh-token",
      clientId: "client-123",
    })).rejects.toThrow("Consumed refresh token unexpectedly rotated");
    expect(generateToken).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_token",
    "expired_token",
    "mismatched_context",
    "revoked_token",
    "reused_token",
  ] as const)(
    "returns no credential when atomic rotation returns %s",
    async (error) => {
      const resolve = vi.fn<RefreshTokenRotationStore["resolve"]>()
        .mockResolvedValue({
          ok: true,
          context: {
            clientId: "client-123",
            userId: "user-456",
            scopes: ["read", "write"],
          },
        });
      const rotate = vi.fn<RefreshTokenRotationStore["rotate"]>()
        .mockResolvedValue({ ok: false, error });
      const issueAccessToken = vi.fn().mockResolvedValue("must-not-be-issued");
      const rotator = createRefreshTokenRotator({
        store: { resolve, rotate },
        generateToken: () => "discarded-refresh-token",
        issueAccessToken,
      });

      await expect(rotator.rotate({
        refreshToken: "current-refresh-token",
        clientId: "client-123",
      })).resolves.toEqual({ ok: false, error });
      expect(issueAccessToken).toHaveBeenCalledExactlyOnceWith({
        clientId: "client-123",
        userId: "user-456",
        scopes: ["read", "write"],
      });
    },
  );
});
