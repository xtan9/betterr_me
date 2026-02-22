/**
 * @vitest-environment node
 *
 * jose v6 uses WebCrypto internally and requires native Uint8Array.
 * jsdom's polyfilled Uint8Array causes `payload must be an instance of Uint8Array`.
 * Using node environment avoids this incompatibility.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "crypto";
import {
  generateKeyPair,
  SignJWT,
  exportJWK,
  type GenerateKeyPairResult,
  type JWK,
} from "jose";
import { verifyPlaidWebhook } from "@/lib/plaid/webhooks";

// Helper to create a mock PlaidApi-like object with webhookVerificationKeyGet
function createMockPlaidClient(jwk: JWK) {
  return {
    webhookVerificationKeyGet: async () => ({
      data: {
        key: jwk,
        request_id: "test-request-id",
      },
    }),
  };
}

function createFailingPlaidClient() {
  return {
    webhookVerificationKeyGet: async () => {
      throw new Error("Network error");
    },
  };
}

// Helper to compute SHA-256 hash of a string
function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("verifyPlaidWebhook", () => {
  let keyPair: GenerateKeyPairResult;
  let publicJwk: JWK;

  beforeAll(async () => {
    keyPair = await generateKeyPair("ES256");
    publicJwk = await exportJWK(keyPair.publicKey);
    // jose exportJWK doesn't include alg/kid, add them manually
    publicJwk.alg = "ES256";
    publicJwk.kid = "test-key-id";
    publicJwk.kty = "EC";
    publicJwk.use = "sig";
    publicJwk.crv = "P-256";
  });

  async function createValidJWT(
    body: string,
    options?: {
      kid?: string;
      alg?: string;
      iat?: number;
    }
  ): Promise<string> {
    const bodyHash = sha256(body);
    const now = options?.iat ?? Math.floor(Date.now() / 1000);

    const jwt = await new SignJWT({ request_body_sha256: bodyHash })
      .setProtectedHeader({
        alg: options?.alg ?? "ES256",
        kid: options?.kid ?? "test-key-id",
        typ: "JWT",
      })
      .setIssuedAt(now)
      .sign(keyPair.privateKey);

    return jwt;
  }

  it("accepts a valid JWT with correct body hash", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "test-item" });
    const token = await createValidJWT(body);
    const mockClient = createMockPlaidClient(publicJwk);

    const result = await verifyPlaidWebhook(body, token, mockClient as never);
    expect(result).toBe(true);
  });

  it("rejects a valid JWT with wrong body hash", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "test-item" });
    const token = await createValidJWT(body);
    const tamperedBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "tampered" });
    const mockClient = createMockPlaidClient(publicJwk);

    const result = await verifyPlaidWebhook(tamperedBody, token, mockClient as never);
    expect(result).toBe(false);
  });

  it("rejects an expired JWT (iat > 5 minutes ago)", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", item_id: "test" });
    // Set iat to 6 minutes ago
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 6 * 60;
    const token = await createValidJWT(body, { iat: sixMinutesAgo });
    const mockClient = createMockPlaidClient(publicJwk);

    const result = await verifyPlaidWebhook(body, token, mockClient as never);
    expect(result).toBe(false);
  });

  it("rejects non-ES256 algorithms", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS" });
    // Create a JWT with RS256 in the header (but signed with ES256 key - the alg check should reject before signature verify)
    // We can't actually sign with RS256 using an EC key, so we test by manually checking alg rejection
    // Instead, we forge the header claim: create a JWT where the protected header says RS256
    // The simplest approach: create a token, then modify the header
    const bodyHash = sha256(body);
    // Create a valid ES256 JWT but with a modified algorithm claim
    // Since we can't actually sign with RS256 using an EC key,
    // we just need to test that the function checks alg === 'ES256'
    // We'll create a mock JWT with an RS256 header
    const jwt = await new SignJWT({ request_body_sha256: bodyHash })
      .setProtectedHeader({
        alg: "ES256",
        kid: "test-key-id",
        typ: "JWT",
      })
      .setIssuedAt()
      .sign(keyPair.privateKey);

    // Tamper with the header to change alg to RS256
    const parts = jwt.split(".");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    header.alg = "RS256";
    parts[0] = Buffer.from(JSON.stringify(header)).toString("base64url");
    const tamperedJwt = parts.join(".");

    const mockClient = createMockPlaidClient(publicJwk);
    const result = await verifyPlaidWebhook(body, tamperedJwt, mockClient as never);
    expect(result).toBe(false);
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS" });
    const token = await createValidJWT(body);

    // Corrupt the signature portion
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -5) + "XXXXX";
    const corruptedToken = parts.join(".");

    const mockClient = createMockPlaidClient(publicJwk);
    const result = await verifyPlaidWebhook(body, corruptedToken, mockClient as never);
    expect(result).toBe(false);
  });

  it("rejects when Plaid-Verification header is missing/empty", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS" });
    const mockClient = createMockPlaidClient(publicJwk);

    const result1 = await verifyPlaidWebhook(body, "", mockClient as never);
    expect(result1).toBe(false);

    const result2 = await verifyPlaidWebhook(body, " ", mockClient as never);
    expect(result2).toBe(false);
  });

  it("rejects when Plaid key fetch fails", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS" });
    const token = await createValidJWT(body);
    const failingClient = createFailingPlaidClient();

    const result = await verifyPlaidWebhook(body, token, failingClient as never);
    expect(result).toBe(false);
  });

  it("returns false for completely malformed JWT strings", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS" });
    const mockClient = createMockPlaidClient(publicJwk);

    const result = await verifyPlaidWebhook(body, "not-a-jwt", mockClient as never);
    expect(result).toBe(false);
  });
});
