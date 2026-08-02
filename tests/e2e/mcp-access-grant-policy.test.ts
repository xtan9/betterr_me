// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  evaluateDelegatedJwtPolicy,
  isExactCanonicalResource,
  matchesS256CodeChallenge,
  publicBoundaryRejects,
  s256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwtClaims,
} from "../../e2e/mcp-access-grant-policy";

const CANONICAL_RESOURCE = "http://127.0.0.1:3000/mcp";
const ISSUER = "http://127.0.0.1:54321/auth/v1";
const CLIENT_ID = "compatibility-client";
const NOW = 1_783_000_000;

function validClaims(): DelegatedJwtClaims {
  return {
    aud: CANONICAL_RESOURCE,
    client_id: CLIENT_ID,
    exp: NOW + 3600,
    iat: NOW - 10,
    iss: ISSUER,
    sub: "user-123",
  };
}

function validPolicy() {
  return {
    canonicalResource: CANONICAL_RESOURCE,
    expectedClientId: CLIENT_ID,
    expectedIssuer: ISSUER,
    nowSeconds: NOW,
    tokenRequest: {
      clientId: CLIENT_ID,
      grantType: "authorization_code",
      resource: CANONICAL_RESOURCE,
    },
  };
}

describe("MCP Access Grant deterministic policy", () => {
  it("proves the RFC 7636 S256 vector and rejects missing, plain, and wrong proof", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    expect(s256CodeChallenge(verifier)).toBe(challenge);
    expect(matchesS256CodeChallenge(verifier, challenge, "S256")).toBe(true);
    expect(matchesS256CodeChallenge(undefined, challenge, "S256")).toBe(false);
    expect(matchesS256CodeChallenge(verifier, challenge, "plain")).toBe(false);
    expect(matchesS256CodeChallenge("wrong-verifier", challenge, "S256")).toBe(false);
  });

  it("requires exact Canonical MCP Resource equality", () => {
    expect(isExactCanonicalResource(CANONICAL_RESOURCE, CANONICAL_RESOURCE)).toBe(true);
    expect(isExactCanonicalResource(CANONICAL_RESOURCE, undefined)).toBe(false);
    expect(isExactCanonicalResource(CANONICAL_RESOURCE, "mcp")).toBe(false);
    expect(isExactCanonicalResource(CANONICAL_RESOURCE, "http://127.0.0.1:3000")).toBe(false);
    expect(isExactCanonicalResource(CANONICAL_RESOURCE, "https://unrelated.example/mcp")).toBe(false);
  });

  it.each([
    ["HS256", "unexpected-algorithm"],
    [undefined, "unexpected-algorithm"],
  ])("rejects an unsupported JWT algorithm (%s)", (algorithm, failure) => {
    const result = selectDelegatedSigningJwk(
      { alg: algorithm, kid: "key-1" },
      [{ alg: "RS256", kid: "key-1", kty: "RSA", use: "sig", key_ops: ["verify"] }],
    );

    expect(result).toEqual({ ok: false, reason: failure });
  });

  it.each([
    [{ alg: "RS256", kid: undefined }, "missing-key-id"],
    [{ alg: "RS256", kid: "unknown-key" }, "unknown-key"],
    [{ alg: "RS256", kid: "key-1" }, "key-algorithm-mismatch"],
    [{ alg: "RS256", kid: "key-1" }, "key-not-for-signing"],
  ] as const)("rejects a key-selection failure (%j)", (header, failure) => {
    const key =
      failure === "key-algorithm-mismatch"
        ? { alg: "ES256", kid: "key-1", kty: "RSA", use: "sig", key_ops: ["verify"] }
        : failure === "key-not-for-signing"
          ? { alg: "RS256", kid: "key-1", kty: "RSA", use: "enc", key_ops: ["verify"] }
          : { alg: "RS256", kid: "key-1", kty: "RSA", use: "sig", key_ops: ["verify"] };
    const keys = failure === "unknown-key" ? [] : [key];

    expect(selectDelegatedSigningJwk(header, keys)).toEqual({ ok: false, reason: failure });
  });

  it("accepts only a matching signing key and asymmetric key type", () => {
    expect(
      selectDelegatedSigningJwk(
        { alg: "RS256", kid: "key-1", typ: "JWT" },
        [{ alg: "RS256", kid: "key-1", kty: "RSA", use: "sig", key_ops: ["verify"] }],
      ),
    ).toMatchObject({ ok: true });
    expect(
      selectDelegatedSigningJwk(
        { alg: "ES256", kid: "key-2", typ: "JWT" },
        [{ alg: "ES256", kid: "key-2", crv: "P-256", kty: "EC", use: "sig", key_ops: ["verify"] }],
      ),
    ).toMatchObject({ ok: true });
  });

  it("accepts the complete delegated JWT policy only for the exact context", () => {
    const result = evaluateDelegatedJwtPolicy(
      { alg: "RS256", kid: "key-1", typ: "JWT" },
      validClaims(),
      validPolicy(),
    );

    expect(result).toEqual({
      valid: true,
      failures: [],
      checks: {
        algorithmAllowed: true,
        keyIdPresent: true,
        issuerMatches: true,
        subjectPresent: true,
        audienceMatches: true,
        timeBoundsValid: true,
        clientContextMatches: true,
        grantContextMatches: true,
        resourceContextMatches: true,
      },
    });
  });

  it.each([
    ["wrong issuer", { iss: "https://unrelated.example/issuer" }, "issuer-mismatch"],
    ["empty subject", { sub: "" }, "missing-subject"],
    ["generic audience", { aud: "mcp" }, "audience-mismatch"],
    ["inferred URL audience", { aud: "http://127.0.0.1:3000" }, "audience-mismatch"],
    ["unrelated audience", { aud: "https://unrelated.example/mcp" }, "audience-mismatch"],
    ["expired token", { exp: NOW }, "invalid-expiry"],
    ["future issued-at", { iat: NOW + 120 }, "invalid-issued-at"],
    ["future not-before", { nbf: NOW + 120 }, "invalid-not-before"],
    ["wrong client", { client_id: "other-client" }, "client-context-mismatch"],
  ] as const)("rejects delegated JWT %s", (_name, mutation, failure) => {
    const result = evaluateDelegatedJwtPolicy(
      { alg: "RS256", kid: "key-1", typ: "JWT" },
      { ...validClaims(), ...mutation },
      validPolicy(),
    );

    expect(result.valid).toBe(false);
    expect(result.failures).toContain(failure);
  });

  it.each([
    ["missing resource", { resource: undefined }, "resource-context-mismatch"],
    ["generic resource", { resource: "mcp" }, "resource-context-mismatch"],
    ["unrelated resource", { resource: "https://unrelated.example/mcp" }, "resource-context-mismatch"],
    ["wrong grant", { grantType: "refresh_token" }, "grant-context-mismatch"],
    ["wrong registered client", { clientId: "other-client" }, "grant-context-mismatch"],
  ] as const)("rejects token request context: %s", (_name, mutation, failure) => {
    const result = evaluateDelegatedJwtPolicy(
      { alg: "RS256", kid: "key-1", typ: "JWT" },
      validClaims(),
      {
        ...validPolicy(),
        tokenRequest: { ...validPolicy().tokenRequest, ...mutation },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.failures).toContain(failure);
  });

  it.each([
    [401, false],
    [403, false],
  ])("treats an unauthenticated public MCP response as a rejection (%s)", (status, containsCredentials) => {
    expect(publicBoundaryRejects(status, containsCredentials)).toBe(true);
  });

  it.each([
    [200, false],
    [401, true],
    [undefined, false],
  ])("does not call a successful or credential-bearing response a rejection (%s)", (status, containsCredentials) => {
    expect(publicBoundaryRejects(status, containsCredentials)).toBe(false);
  });
});
