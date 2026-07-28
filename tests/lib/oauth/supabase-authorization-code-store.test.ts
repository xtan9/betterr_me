import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAuthorizationCodeStore } from "@/lib/oauth/supabase-authorization-code-store";
import { mockSupabaseClient } from "../../setup";

const RECORD = {
  codeHash: "code-hash",
  clientId: "client-123",
  redirectUri: "http://localhost:3000/callback",
  userId: "user-123",
  scopes: ["read", "write"],
  expiresAt: new Date("2026-07-28T20:05:00.000Z"),
  codeChallenge: "challenge",
  codeChallengeMethod: "S256" as const,
  used: false,
};

const MATCHES = {
  clientId: "client-123",
  redirectUri: "http://localhost:3000/callback",
  codeChallenge: "challenge",
  codeChallengeMethod: "S256" as const,
  now: new Date("2026-07-28T20:00:00.000Z"),
};

function makeClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{
      outcome: "consumed",
      code_hash: RECORD.codeHash,
      client_id: RECORD.clientId,
      redirect_uri: RECORD.redirectUri,
      user_id: RECORD.userId,
      scopes: RECORD.scopes,
      expires_at: RECORD.expiresAt.toISOString(),
      code_challenge: RECORD.codeChallenge,
      code_challenge_method: RECORD.codeChallengeMethod,
      used: true,
    }],
    error: null,
  });
  return {
    client: { from: mockSupabaseClient.from, rpc },
    rpc,
  };
}

describe("createSupabaseAuthorizationCodeStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null, null);
  });

  it("saves every authorization-code binding with an exact insert", async () => {
    const { client } = makeClient();

    await createSupabaseAuthorizationCodeStore(client).save(RECORD);

    expect(mockSupabaseClient.queryLog).toEqual([
      { table: "oauth_codes", method: "from", args: ["oauth_codes"] },
      {
        table: "oauth_codes",
        method: "insert",
        args: [{
          code_hash: "code-hash",
          client_id: "client-123",
          redirect_uri: "http://localhost:3000/callback",
          user_id: "user-123",
          scopes: ["read", "write"],
          expires_at: "2026-07-28T20:05:00.000Z",
          code_challenge: "challenge",
          code_challenge_method: "S256",
          used: false,
        }],
      },
    ]);
  });

  it("throws when saving the authorization code fails", async () => {
    const { client } = makeClient();
    mockSupabaseClient.setMockResponse(null, new Error("database down"));

    await expect(createSupabaseAuthorizationCodeStore(client).save(RECORD))
      .rejects.toThrow("Failed to save authorization code");
  });

  it("consumes with every binding and maps the complete record", async () => {
    const { client, rpc } = makeClient();

    await expect(createSupabaseAuthorizationCodeStore(client).consume(
      "code-hash",
      MATCHES,
    )).resolves.toEqual({ ok: true, record: { ...RECORD, used: true } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "consume_oauth_authorization_code",
      {
        requested_code_hash: "code-hash",
        requested_client_id: "client-123",
        requested_redirect_uri: "http://localhost:3000/callback",
        requested_code_challenge: "challenge",
        requested_code_challenge_method: "S256",
        requested_at: "2026-07-28T20:00:00.000Z",
      },
    );
  });

  it("returns the database's explicit non-consumed outcome", async () => {
    const { client, rpc } = makeClient();
    rpc.mockResolvedValue({ data: [{ outcome: "expired_code" }], error: null });

    await expect(createSupabaseAuthorizationCodeStore(client).consume(
      "code-hash",
      MATCHES,
    )).resolves.toEqual({ ok: false, error: "expired_code" });
  });

  it.each([
    ["RPC error", { data: null, error: new Error("RPC failed") }],
    ["empty response", { data: [], error: null }],
    ["incomplete consumed response", {
      data: [{ outcome: "consumed", code_hash: "code-hash" }],
      error: null,
    }],
  ])("throws on a consume %s", async (_name, response) => {
    const { client, rpc } = makeClient();
    rpc.mockResolvedValue(response);

    await expect(createSupabaseAuthorizationCodeStore(client).consume(
      "code-hash",
      MATCHES,
    )).rejects.toThrow("Failed to consume authorization code");
  });
});
