import { describe, expect, it, vi } from "vitest";

import { createSupabaseRefreshTokenStore } from "@/lib/oauth/supabase-refresh-token-store";

const ROTATION = {
  currentTokenHash: "current-hash",
  nextTokenHash: "next-hash",
  nextExpiresAt: new Date("2027-01-24T12:00:00.000Z"),
  clientId: "client-123",
  now: new Date("2026-07-28T12:00:00.000Z"),
};

const RESOLUTION = {
  currentTokenHash: "current-hash",
  clientId: "client-123",
  now: new Date("2026-07-28T12:00:00.000Z"),
};

describe("createSupabaseRefreshTokenStore", () => {
  it("resolves token context without rotating it", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "valid_token",
        client_id: "client-123",
        user_id: "user-456",
        scopes: ["read", "write"],
      }],
      error: null,
    });
    const store = createSupabaseRefreshTokenStore({ rpc });

    await expect(store.resolve(RESOLUTION)).resolves.toEqual({
      ok: true,
      context: {
        clientId: "client-123",
        userId: "user-456",
        scopes: ["read", "write"],
      },
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "resolve_oauth_refresh_token_context",
      {
        requested_token_hash: "current-hash",
        requested_client_id: "client-123",
        requested_at: "2026-07-28T12:00:00.000Z",
      },
    );
  });

  it("delegates the revalidating rotation to one database operation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outcome: "rotated",
        client_id: "client-123",
        user_id: "user-456",
        scopes: ["read", "write"],
      }],
      error: null,
    });
    const store = createSupabaseRefreshTokenStore({ rpc });

    await expect(store.rotate(ROTATION)).resolves.toEqual({
      ok: true,
      context: {
        clientId: "client-123",
        userId: "user-456",
        scopes: ["read", "write"],
      },
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("rotate_oauth_refresh_token", {
      requested_token_hash: "current-hash",
      replacement_token_hash: "next-hash",
      replacement_expires_at: "2027-01-24T12:00:00.000Z",
      requested_client_id: "client-123",
      requested_at: "2026-07-28T12:00:00.000Z",
    });
  });

  it.each(["resolve", "rotate"] as const)(
    "returns the database's explicit non-success outcome from %s",
    async (operation) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [{ outcome: "reused_token" }],
        error: null,
      });
      const store = createSupabaseRefreshTokenStore({ rpc });

      await expect(operation === "resolve"
        ? store.resolve(RESOLUTION)
        : store.rotate(ROTATION))
        .resolves.toEqual({ ok: false, error: "reused_token" });
    },
  );

  it.each([
    ["rotate", "RPC error", {
      data: null,
      error: new Error("database unavailable"),
    }],
    ["rotate", "empty response", { data: [], error: null }],
    ["resolve", "RPC error", {
      data: null,
      error: new Error("database unavailable"),
    }],
    ["resolve", "empty response", { data: [], error: null }],
    ["resolve", "incomplete valid response", {
      data: [{ outcome: "valid_token", client_id: "client-123" }],
      error: null,
    }],
    ["rotate", "incomplete rotated response", {
      data: [{ outcome: "rotated", client_id: "client-123" }],
      error: null,
    }],
  ])(
    "throws when %s receives a %s",
    async (operation, _name, response) => {
      const rpc = vi.fn().mockResolvedValue(response);
      const store = createSupabaseRefreshTokenStore({ rpc });

      await expect(operation === "resolve"
        ? store.resolve(RESOLUTION)
        : store.rotate(ROTATION))
        .rejects.toThrow("Failed to rotate refresh token");
    },
  );
});
