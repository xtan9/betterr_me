// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PublicClientEvidenceBoundary,
  PublicClientEvidenceBoundaryError,
  PUBLIC_CLIENT_EVIDENCE_BOUNDS,
  evaluatePublicClientFacts,
} from "../../e2e/mcp-access-grant-public-client-semantics";

const sampledAtMillis = Date.parse("2026-08-08T00:00:00.000Z");

function registrationFact(): Record<string, unknown> {
  return {
    kind: "registration",
    role: "primary",
    family: "ipv4",
    response: {
      complete: true,
      status: 201,
      body: {
        client_id: "client-ipv4",
        redirect_uris: ["http://127.0.0.1/oauth/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    },
  };
}

describe("canonical public-client evidence boundary", () => {
  it("snapshots and normalizes accepted facts before caller mutation can affect them", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    const fact = registrationFact();
    const pending = boundary.accept(fact, sampledAtMillis);

    (fact.response as Record<string, unknown>).body = { client_id: "mutated" };

    const accepted = await pending;
    expect(accepted.disposition).toBe("accepted");
    expect(accepted.fact.identity).toBe("registration|primary|ipv4|primary");
    expect(accepted.fact.data.clientId).toBe("client-ipv4");
  });

  it("gives equal canonical input one identity, fingerprint, and duplicate/conflict policy", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    const first = await boundary.accept(registrationFact(), sampledAtMillis);
    const duplicate = await boundary.accept(registrationFact(), sampledAtMillis);
    const conflict = await boundary.accept({
      ...registrationFact(),
      response: {
        ...(registrationFact().response as Record<string, unknown>),
        body: {
          ...(registrationFact().response as Record<string, unknown>).body as Record<string, unknown>,
          client_id: "different-client",
        },
      },
    }, sampledAtMillis);

    expect(duplicate.disposition).toBe("duplicate");
    expect(conflict.disposition).toBe("accepted");
    expect(first.fact.identity).toBe(duplicate.fact.identity);
    expect(first.fingerprint).toBe(duplicate.fingerprint);
    expect(boundary.conflictingIdentities).toEqual([first.fact.identity]);
  });

  it.each([
    "accessor",
    "custom-prototype",
    "sparse-array",
    "conclusion-field",
  ])("rejects the same unsupported %s input at the shared boundary", async (kind) => {
    const boundary = new PublicClientEvidenceBoundary();
    let input: unknown = registrationFact();

    if (kind === "accessor") {
      Object.defineProperty(input, "observation", { enumerable: true, get: () => ({}) });
    } else if (kind === "custom-prototype") {
      input = Object.assign(Object.create({ inherited: true }), registrationFact());
    } else if (kind === "sparse-array") {
      const bodyFields = new Array(1);
      input = { ...registrationFact(), request: { method: "POST", url: "https://example.test", bodyFields } };
    } else {
      input = { ...registrationFact(), status: "pass" };
    }

    await expect(boundary.accept(input, sampledAtMillis)).rejects.toBeInstanceOf(PublicClientEvidenceBoundaryError);
  });

  it("redacts cycles and unsupported nested values without invoking them", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    const cycle: Record<string, unknown> = { unsupported: () => "must not run" };
    cycle.self = cycle;
    const accepted = await boundary.accept({
      ...registrationFact(),
      response: {
        complete: true,
        status: 201,
        body: cycle,
      },
    }, sampledAtMillis);

    const body = accepted.fact.data.response as { readonly body: Record<string, unknown> };
    expect(body.body).toEqual({
      unsupported: "[REDACTED: unsupported value]",
      self: "[REDACTED: cyclic value]",
    });
  });

  it("enforces shared depth, collection, string, token, and JWKS bounds", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    const oversizedObject = Object.fromEntries(
      Array.from({ length: PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxObjectKeys + 1 }, (_, index) => [`key-${index}`, index]),
    );
    await expect(boundary.accept({ ...registrationFact(), ...oversizedObject }, sampledAtMillis))
      .rejects.toBeInstanceOf(PublicClientEvidenceBoundaryError);

    const deepValue: Record<string, unknown> = {};
    let cursor = deepValue;
    for (let index = 0; index <= PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxDepth; index += 1) {
      cursor.child = {};
      cursor = cursor.child as Record<string, unknown>;
    }
    const deep = await boundary.accept({
      ...registrationFact(),
      response: { complete: true, status: 201, body: deepValue },
    }, sampledAtMillis);
    expect(JSON.stringify(deep.fact)).toContain("[REDACTED: depth limit]");

    const oversizedArray = Array.from({ length: PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxArrayItems + 1 }, () => "item");
    const collection = await boundary.accept({
      ...registrationFact(),
      response: { complete: true, status: 201, body: { redirect_uris: oversizedArray } },
    }, sampledAtMillis);
    expect((collection.fact.data.response as { readonly body: Record<string, unknown> }).body.redirect_uris)
      .toBe("[REDACTED: array limit]");

    const longString = "x".repeat(PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxStringLength + 1);
    const stringBound = await boundary.accept({
      ...registrationFact(),
      response: { complete: true, status: 201, body: { client_id: longString } },
    }, sampledAtMillis);
    expect(JSON.stringify(stringBound.fact)).not.toContain(longString);

    const tokenBound = await boundary.accept({
      kind: "delegated-token",
      role: "validation",
      family: "ipv4",
      token: "x".repeat(PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxTokenLength + 1),
      jwks: "{}",
    }, sampledAtMillis);
    expect((tokenBound.fact.data as { readonly tokenMalformed: boolean }).tokenMalformed).toBe(true);

    const jwksBound = await boundary.accept({
      kind: "delegated-token",
      role: "validation",
      family: "ipv4",
      token: "not-a-jwt",
      jwks: "x".repeat(PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxJwksLength + 1),
    }, sampledAtMillis);
    expect((jwksBound.fact.data as { readonly jwksMalformed: boolean }).jwksMalformed).toBe(true);
  });

  it("minimizes credentials on surfaces, URLs, and request bodies", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    const accepted = await boundary.accept({
      ...registrationFact(),
      request: {
        method: "POST",
        url: "https://example.test/token?code=one-time-code&state=state-value",
        bodyFields: ["client_secret", "code_verifier"],
      },
      response: {
        complete: true,
        status: 201,
        body: {
          client_id: "client-ipv4",
          access_token: "secret-access-token",
        },
        location: "https://example.test/callback?code=one-time-code",
      },
    }, sampledAtMillis);

    const serialized = JSON.stringify(accepted.fact);
    expect(serialized).not.toContain("one-time-code");
    expect(serialized).not.toContain("secret-access-token");
    expect(serialized).not.toContain("client_secret");
    expect((accepted.fact.data.response as { readonly credentialPresence: string }).credentialPresence).toBe("present");
    expect(accepted.fact.request?.request.url).not.toContain("one-time-code");
  });

  it("classifies equal canonical facts identically without profile authority", async () => {
    const facts = [
      {
        kind: "resource-discovery" as const,
        role: "primary" as const,
        response: { complete: true, status: 200, body: { resource: "http://127.0.0.1:3000/mcp", authorization_server: "http://127.0.0.1:54321/auth/v1" } },
      },
      {
        kind: "provider-discovery" as const,
        role: "primary" as const,
        response: { complete: true, status: 200, body: { issuer: "http://127.0.0.1:54321/auth/v1", registration_endpoint: "http://127.0.0.1:54321/auth/v1/clients", response_types_supported: ["code"], grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"] } },
      },
      registrationFact(),
    ];
    const target = {
      name: "semantics-fixture",
      canonicalResource: "http://127.0.0.1:3000/mcp",
      supabaseUrl: "http://127.0.0.1:54321",
      expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
      loopbackHosts: ["127.0.0.1", "::1"],
    } as const;
    const firstBoundary = new PublicClientEvidenceBoundary();
    const secondBoundary = new PublicClientEvidenceBoundary();
    for (const fact of facts) {
      await firstBoundary.accept(fact, sampledAtMillis);
      await secondBoundary.accept(JSON.parse(JSON.stringify(fact)) as unknown, sampledAtMillis);
    }

    expect(evaluatePublicClientFacts(firstBoundary.facts, target)).toEqual(
      evaluatePublicClientFacts(secondBoundary.facts, target),
    );
  });
});
