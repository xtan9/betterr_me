// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PublicClientEvidenceBoundary,
  PublicClientEvidenceBoundaryError,
  PUBLIC_CLIENT_EVIDENCE_BOUNDS,
  evaluatePublicClientFacts,
} from "../../e2e/mcp-access-grant-public-client-semantics";
import { s256CodeChallenge } from "../../e2e/mcp-access-grant-journey";

const sampledAtMillis = Date.parse("2026-08-08T00:00:00.000Z");

const semanticTarget = Object.freeze({
  name: "semantics-fixture",
  canonicalResource: "http://127.0.0.1:3000/mcp",
  supabaseUrl: "http://127.0.0.1:54321",
  expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
  loopbackHosts: Object.freeze(["127.0.0.1", "::1"]),
});

function registrationFact(family: "ipv4" | "ipv6" = "ipv4"): Record<string, unknown> {
  const host = family === "ipv4" ? "127.0.0.1" : "[::1]";
  return {
    kind: "registration",
    role: "primary",
    family,
    response: {
      complete: true,
      status: 201,
      body: {
        client_id: `client-${family}`,
        redirect_uris: [`http://${host}/oauth/callback`],
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

  it("evaluates an ordered immutable batch with explicit dependencies and sampled time", async () => {
    const boundary = new PublicClientEvidenceBoundary();
    await boundary.accept(registrationFact(), sampledAtMillis);
    const target = Object.freeze({
      name: "semantics-fixture",
      canonicalResource: "http://127.0.0.1:3000/mcp",
      supabaseUrl: "http://127.0.0.1:54321",
      expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
      loopbackHosts: Object.freeze(["127.0.0.1", "::1"]),
    });
    const evaluation = evaluatePublicClientFacts({
      facts: Object.freeze(boundary.facts),
      target,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
      includeRequests: false,
    });

    expect(evaluation.conclusions.find(({ key }) => key === "public-client-registration-ipv4")).toMatchObject({
      key: "public-client-registration-ipv4",
      family: "ipv4",
      status: "pass",
    });
  });

  it.each(["ipv4", "ipv6"] as const)("requires recognized credential-free negative registration evidence for %s", async (family) => {
    const negativeCases = [
      "unsupported-client-auth-method",
      "unsupported-grant-type",
      "unsupported-response-type",
      "malformed-metadata",
      "unsafe-redirect-metadata",
    ] as const;
    const boundary = new PublicClientEvidenceBoundary();
    for (const caseId of negativeCases) {
      await boundary.accept({
        kind: "registration",
        role: "negative",
        family,
        caseId,
        response: { complete: true, status: 400, body: { error_code: "invalid_client_metadata" } },
      }, sampledAtMillis);
    }
    const passing = evaluatePublicClientFacts({
      facts: Object.freeze(boundary.facts),
      target: Object.freeze({
        name: "semantics-fixture",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
        loopbackHosts: Object.freeze(["127.0.0.1", "::1"]),
      }),
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    expect(passing.conclusions.find(({ key }) => key === `registration-negative-validation-${family}`)).toMatchObject({ status: "pass" });

    const malformedBoundary = new PublicClientEvidenceBoundary();
    await malformedBoundary.accept({
      kind: "registration",
      role: "negative",
      family,
      caseId: "unsafe-redirect-metadata",
      response: { complete: true, status: 400, body: { error_code: "provider_failed" } },
    }, sampledAtMillis);
    const malformed = evaluatePublicClientFacts({
      facts: Object.freeze(malformedBoundary.facts),
      target: Object.freeze({
        name: "semantics-fixture",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
        loopbackHosts: Object.freeze(["127.0.0.1", "::1"]),
      }),
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    expect(malformed.conclusions.find(({ key }) => key === `registration-negative-validation-${family}`)).toMatchObject({ status: "not-proven" });
  });

  it.each(["ipv4", "ipv6"] as const)("keeps missing observations and dependencies deterministic for %s", async (family) => {
    const boundary = new PublicClientEvidenceBoundary();
    await boundary.accept(registrationFact(family), sampledAtMillis);
    const evaluation = evaluatePublicClientFacts({
      facts: Object.freeze(boundary.facts),
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass" }),
    });

    expect(evaluation.conclusions.find(({ key }) => key === `public-client-registration-${family}`)).toMatchObject({
      status: "not-proven",
      error: { kind: "missing-observation", code: "dependency-not-proven" },
    });
    expect(evaluation.conclusions.find(({ key }) => key === `loopback-${family}`)).toMatchObject({
      error: { kind: "missing-observation" },
    });
  });

  it.each(["ipv4", "ipv6"] as const)("reports conflicts and loopback/PKCE security failures for %s", async (family) => {
    const conflictBoundary = new PublicClientEvidenceBoundary();
    await conflictBoundary.accept(registrationFact(family), sampledAtMillis);
    await conflictBoundary.accept({
      ...registrationFact(family),
      response: {
        ...(registrationFact(family).response as Record<string, unknown>),
        body: {
          ...(registrationFact(family).response as Record<string, unknown>).body as Record<string, unknown>,
          client_id: `different-${family}`,
        },
      },
    }, sampledAtMillis);
    const conflict = evaluatePublicClientFacts({
      facts: Object.freeze(conflictBoundary.facts),
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    expect(conflict.conclusions.find(({ key }) => key === `public-client-registration-${family}`)).toMatchObject({
      status: "fail",
      error: { kind: "conflicting-observation" },
    });

    const host = family === "ipv4" ? "127.0.0.1" : "[::1]";
    const securityBoundary = new PublicClientEvidenceBoundary();
    await securityBoundary.accept(registrationFact(family), sampledAtMillis);
    await securityBoundary.accept({
      kind: "loopback",
      role: "callback",
      family,
      observation: {
        registeredRedirectUri: `http://${host}/oauth/callback`,
        callbackUrl: `https://${host}:43123/oauth/callback?code=unexpected`,
        callbackReceived: true,
      },
    }, sampledAtMillis);
    await securityBoundary.accept({
      kind: "pkce",
      role: "exchange",
      family,
      observation: {
        verifier: `verifier-${family}`,
        challenge: `plain-${family}`,
        method: "plain",
        requestResource: semanticTarget.canonicalResource,
      },
    }, sampledAtMillis);
    const security = evaluatePublicClientFacts({
      facts: Object.freeze(securityBoundary.facts),
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    expect(security.conclusions.find(({ key }) => key === `loopback-${family}`)).toMatchObject({ status: "fail" });
    expect(security.conclusions.find(({ key }) => key === `loopback-pkce-${family}`)).toMatchObject({ status: "fail" });
  });

  it("rejects malformed batch facts, targets, and dependency conclusions with one stable boundary error", () => {
    const base = {
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    };
    expect(() => evaluatePublicClientFacts({ ...base, facts: Object.freeze([undefined]) } as never))
      .toThrow(PublicClientEvidenceBoundaryError);
    expect(() => evaluatePublicClientFacts({
      ...base,
      facts: Object.freeze([]),
      target: { ...semanticTarget, loopbackHosts: ["not-loopback", "::1"] },
    } as never)).toThrow(PublicClientEvidenceBoundaryError);
    expect(() => evaluatePublicClientFacts({
      ...base,
      facts: Object.freeze([]),
      dependencies: Object.freeze({ providerDiscovery: "unexpected" }),
    } as never)).toThrow(PublicClientEvidenceBoundaryError);
  });

  it.each(["ipv4", "ipv6"] as const)("shares consent, authorization, loopback, and S256 semantics for %s", async (family) => {
    const host = family === "ipv4" ? "127.0.0.1" : "[::1]";
    const registeredRedirectUri = `http://${host}/oauth/callback`;
    const callbackUrl = `http://${host}:43123/oauth/callback?error=access_denied&state=state-value`;
    const requestCallbackUrl = `http://${host}:43123/oauth/callback`;
    const verifier = `verifier-${family}`;
    const boundary = new PublicClientEvidenceBoundary();
    const facts = [
      {
        kind: "registration" as const,
        role: "primary" as const,
        family,
        response: {
          complete: true,
          status: 201,
          body: {
            client_id: `client-${family}`,
            redirect_uris: [registeredRedirectUri],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
        },
      },
      {
        kind: "consent" as const,
        role: "metadata" as const,
        family,
        observation: {
          clientNameVisible: true,
          clientUriVisible: true,
          logoVisible: true,
          softwareIdVisible: true,
          softwareVersionVisible: true,
          untrustedDisclaimerVisible: true,
          endorsementText: "This client is not endorsed by BetterR.Me.",
        },
      },
      {
        kind: "authorization" as const,
        role: "approval" as const,
        family,
        observation: {
          affirmativeControlVisible: true,
          denialControlVisible: true,
          callbackBeforeDecision: false,
          decision: "affirmative" as const,
        },
      },
      {
        kind: "authorization" as const,
        role: "denial" as const,
        family,
        observation: {
          callbackComplete: true,
          callbackReceived: true,
          callbackUrl,
          expectedState: "state-value",
          callbackState: "state-value",
          authorizationError: true,
          tokenRequestObserved: false,
        },
      },
      {
        kind: "authorization" as const,
        role: "abandonment" as const,
        family,
        observation: {
          callbackComplete: true,
          callbackReceived: false,
          browserUrl: "http://provider.example.test/authorize",
          tokenRequestObserved: false,
        },
      },
      {
        kind: "loopback" as const,
        role: "callback" as const,
        family,
        observation: { registeredRedirectUri, callbackUrl: callbackUrl.replace("error=access_denied&state=state-value", "code=one-time-code&state=state-value"), callbackReceived: true },
      },
      {
        kind: "loopback" as const,
        role: "request" as const,
        family,
        observation: { registeredRedirectUri, requestCallbackUrl, requestResource: semanticTarget.canonicalResource, portSelectedAtRequest: true },
      },
      {
        kind: "pkce" as const,
        role: "exchange" as const,
        family,
        observation: { verifier, challenge: s256CodeChallenge(verifier), method: "S256", requestResource: semanticTarget.canonicalResource },
      },
    ];
    for (const fact of facts) await boundary.accept(fact, sampledAtMillis);

    const evaluation = evaluatePublicClientFacts({
      facts: Object.freeze(boundary.facts),
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    const status = (key: string) => evaluation.conclusions.find((conclusion) => conclusion.key === `${key}-${family}`)?.status;
    expect(status("public-client-registration")).toBe("pass");
    expect(status("untrusted-client-metadata")).toBe("pass");
    expect(status("authorization-consent")).toBe("pass");
    expect(status("consent-denial")).toBe("pass");
    expect(status("consent-abandonment")).toBe("pass");
    expect(status("loopback")).toBe("pass");
    expect(status("loopback-request")).toBe("pass");
    expect(status("loopback-pkce")).toBe("pass");

    const premature = new PublicClientEvidenceBoundary();
    await premature.accept({ ...facts[0] }, sampledAtMillis);
    await premature.accept({ ...facts[1] }, sampledAtMillis);
    await premature.accept({
      ...facts[2],
      observation: { ...facts[2].observation, callbackBeforeDecision: true },
    }, sampledAtMillis);
    const prematureEvaluation = evaluatePublicClientFacts({
      facts: Object.freeze(premature.facts),
      target: semanticTarget,
      sampledAtMillis,
      dependencies: Object.freeze({ resourceDiscovery: "pass", providerDiscovery: "pass" }),
    });
    expect(prematureEvaluation.conclusions.find(({ key }) => key === `authorization-consent-${family}`)).toMatchObject({ status: "fail" });
  });
});
