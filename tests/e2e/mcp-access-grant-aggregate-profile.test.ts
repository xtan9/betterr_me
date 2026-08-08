// @vitest-environment node
import { createHash } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_PROFILE,
  MCP_ACCESS_GRANT_FAMILIES,
} from "../../e2e/mcp-access-grant-catalogs";
import { s256CodeChallenge } from "../../e2e/mcp-access-grant-journey";
import {
  runAggregateCompatibilityEvidence,
  type AggregateCompatibilityArtifact,
  type AggregateCompatibilityFact,
  type AggregateCompatibilityEvidenceOptions,
  type AggregateCompatibilityJsonValue,
  type AggregateCompatibilityRequest,
  type AggregateCompatibilityResponseSurface,
  type AggregatePublicClientFact,
} from "../../e2e/mcp-access-grant-aggregate-profile";

const target = {
  name: "aggregate-profile-fixture",
  canonicalResource: "http://127.0.0.1:3000/mcp",
  supabaseUrl: "http://127.0.0.1:54321",
  expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
} as const;

const versions = {
  "@modelcontextprotocol/sdk": "1.28.0",
  "@playwright/test": "1.58.1",
  "@supabase/supabase-js": "2.95.2",
  "mcp-handler": "1.1.0",
  "supabase-auth-provider-image": "ghcr.io/supabase/gotrue:v2.192.0",
  "supabase-cli": "2.109.1",
} as const;

const startedAt = "2026-08-08T00:00:00.000Z";
const finishedAt = "2026-08-08T00:01:00.000Z";
const clientId = "aggregate-client";
const grantId = "aggregate-grant";
const registeredRedirectUri = "http://127.0.0.1/oauth/callback";
const callbackUrl = "http://127.0.0.1:43123/oauth/callback?code=one-time-code&state=state-value";
const requestCallbackUrl = "http://127.0.0.1:43123/oauth/callback";
const verifier = "aggregate-verifier";

function surface(
  body: AggregateCompatibilityJsonValue,
  status = 200,
): AggregateCompatibilityResponseSurface {
  return { complete: true, status, body };
}

function request(
  url: string,
  overrides: Partial<AggregateCompatibilityRequest> = {},
): AggregateCompatibilityRequest {
  return {
    method: "POST",
    url,
    bodyFields: [],
    authorizationHeaderPresent: false,
    status: 200,
    ...overrides,
  };
}

function configurationAndDiscoveryFacts(): AggregateCompatibilityFact[] {
  return [
    {
      kind: "configuration",
      role: "snapshot",
      observation: {
        loopbackHosts: ["127.0.0.1", "::1"],
        providerCredentialsAvailable: false,
      },
    },
    { kind: "versions", role: "snapshot", values: versions },
    {
      kind: "resource-discovery",
      role: "primary",
      response: surface({
        resource: target.canonicalResource,
        authorization_server: target.expectedAuthorizationServer,
      }),
      request: request(`${target.canonicalResource}/.well-known/oauth-protected-resource`, {
        method: "GET",
        status: 200,
      }),
    },
    {
      kind: "provider-discovery",
      role: "primary",
      response: surface({
        issuer: target.expectedAuthorizationServer,
        authorization_endpoint: `${target.expectedAuthorizationServer}/authorize`,
        registration_endpoint: `${target.expectedAuthorizationServer}/clients`,
        token_endpoint: `${target.expectedAuthorizationServer}/token`,
        jwks_uri: `${target.expectedAuthorizationServer}/jwks`,
        grant_types_supported: ["authorization_code"],
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      }),
      request: request(`${target.expectedAuthorizationServer}/.well-known/oauth-authorization-server`, {
        method: "GET",
        status: 200,
      }),
    },
  ];
}

function compatibilityCoreFacts(): AggregateCompatibilityFact[] {
  return [
    {
      kind: "registration",
      role: "primary",
      response: surface({
        client_id: clientId,
        redirect_uris: [registeredRedirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }, 201),
      request: request(`${target.expectedAuthorizationServer}/clients`, {
        status: 201,
        bodyFields: ["client_name", "grant_types", "redirect_uris", "response_types", "token_endpoint_auth_method"],
      }),
    },
    {
      kind: "authorization",
      role: "primary",
      observation: {
        authorizationRequestObserved: true,
        authorizationEndpoint: `${target.expectedAuthorizationServer}/authorize`,
        responseType: "code",
        redirectUri: registeredRedirectUri,
        resource: target.canonicalResource,
        codeChallenge: s256CodeChallenge(verifier),
        codeChallengeMethod: "S256",
        callbackReceived: true,
        callbackUrl,
        expectedState: "state-value",
        callbackState: "state-value",
      },
      request: request(`${target.expectedAuthorizationServer}/authorize?response_type=code`, {
        method: "GET",
        status: 302,
        requestRedirectUri: registeredRedirectUri,
        requestResource: target.canonicalResource,
        requestCodeChallengePresent: true,
        requestCodeChallengeMethod: "S256",
      }),
    },
    {
      kind: "loopback",
      role: "callback",
      observation: {
        registeredRedirectUri,
        callbackUrl,
        callbackReceived: true,
      },
    },
    {
      kind: "loopback",
      role: "request",
      observation: {
        registeredRedirectUri,
        requestCallbackUrl,
        requestResource: target.canonicalResource,
        portSelectedAtRequest: true,
      },
    },
    {
      kind: "pkce",
      role: "positive",
      observation: {
        verifier,
        challenge: s256CodeChallenge(verifier),
        method: "S256",
        requestResource: target.canonicalResource,
        redirectUri: registeredRedirectUri,
      },
      request: request(`${target.expectedAuthorizationServer}/token`, {
        bodyFields: ["client_id", "code", "code_verifier", "grant_type", "redirect_uri", "resource"],
        requestClientId: clientId,
        requestCodePresent: true,
        requestCodeVerifierPresent: true,
        requestGrantType: "authorization_code",
        requestRedirectUri: registeredRedirectUri,
        requestResource: target.canonicalResource,
      }),
    },
  ];
}

const pkceNegativeCases = [
  "missing-code-challenge",
  "plain-code-challenge-method",
  "missing-code-verifier",
  "incorrect-code-verifier",
] as const;

const resourceNegativeCases = [
  "missing-resource",
  "generic-resource",
  "inferred-resource",
  "unrelated-resource",
] as const;

const delegatedNegativeCases = [
  "modified-signature",
  "unexpected-algorithm",
  "unexpected-key",
  "wrong-issuer",
  "missing-subject",
  "missing-audience",
  "generic-audience",
  "inferred-resource-audience",
  "unrelated-resource-audience",
  "invalid-time",
  "missing-client-context",
] as const;

function negativeFacts(): AggregateCompatibilityFact[] {
  return [
    ...pkceNegativeCases.map((caseId, index) => ({
      kind: "pkce" as const,
      role: "negative" as const,
      caseId,
      request: request(`${target.expectedAuthorizationServer}/token`, {
        status: [400, 422, 400, 403][index],
        bodyFields: ["client_id", "grant_type"],
        requestClientId: clientId,
        requestGrantType: "authorization_code",
        requestResource: target.canonicalResource,
        response: surface({ error: "invalid_request" }, [400, 422, 400, 403][index]),
      }),
      response: surface({ error: "invalid_request" }, [400, 422, 400, 403][index]),
    })),
    ...resourceNegativeCases.map((caseId, index) => ({
      kind: "resource-binding" as const,
      role: "negative" as const,
      caseId,
      request: request(`${target.expectedAuthorizationServer}/authorize`, {
        method: "GET",
        status: [400, 422, 400, 403][index],
        requestResource: caseId === "unrelated-resource" ? "https://unrelated.example/mcp" : undefined,
        response: surface({ error: "invalid_resource" }, [400, 422, 400, 403][index]),
      }),
      response: surface({ error: "invalid_resource" }, 400),
    })),
    ...delegatedNegativeCases.map((caseId, index) => ({
      kind: "delegated-token" as const,
      role: "negative" as const,
      caseId,
      request: request(target.canonicalResource, {
        status: [401, 403, 401, 403, 401, 403, 401, 403, 401, 403, 401][index],
        authorizationHeaderPresent: true,
        response: surface({ error: "invalid_token" }, [401, 403, 401, 403, 401, 403, 401, 403, 401, 403, 401][index]),
      }),
      response: surface({ error: "invalid_token" }, [401, 403, 401, 403, 401, 403, 401, 403, 401, 403, 401][index]),
    })),
  ];
}

async function delegatedTokenFact(): Promise<Extract<AggregateCompatibilityFact, { kind: "delegated-token"; role: "validation" }>> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "aggregate-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.key_ops = ["verify"];
  const issuedAt = Math.floor(Date.parse(startedAt) / 1000);
  const token = await new SignJWT({
    iss: target.expectedAuthorizationServer,
    sub: "aggregate-user",
    aud: target.canonicalResource,
    client_id: clientId,
    resource: target.canonicalResource,
    grant_id: grantId,
  })
    .setProtectedHeader({ alg: "RS256", kid: "aggregate-key", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(privateKey);

  return {
    kind: "delegated-token",
    role: "validation",
    token,
    jwks: JSON.stringify({ keys: [jwk] }),
    request: request(`${target.expectedAuthorizationServer}/token`, {
      bodyFields: ["client_id", "grant_type", "resource"],
      requestClientId: clientId,
      requestGrantType: "authorization_code",
      requestResource: target.canonicalResource,
      status: 200,
      response: surface({ access_token: "response-secret" }, 200),
    }),
  };
}

function authenticatedOperationFact(): AggregateCompatibilityFact {
  return {
    kind: "mcp-operation",
    role: "authenticated",
    observation: {
      operationUrl: target.canonicalResource,
      operationResource: target.canonicalResource,
      connected: true,
      listToolsCompleted: true,
      callToolCompleted: true,
      resultIsError: false,
    },
    request: request(target.canonicalResource, {
      authorizationHeaderPresent: true,
      status: 200,
      response: surface({ result: "safe" }, 200),
    }),
  };
}

function shadowDiscoveryFacts(): AggregatePublicClientFact[] {
  return [
    {
      kind: "resource-discovery",
      role: "shadow",
      response: surface({
        resource: "https://spoofed.example/mcp",
        authorization_server: "https://spoofed.example/auth",
      }),
    },
    {
      kind: "provider-discovery",
      role: "shadow",
      response: surface({
        issuer: "https://spoofed.example/auth",
        registration_endpoint: "https://spoofed.example/auth/clients",
      }),
    },
  ];
}

function options(writes: AggregateCompatibilityArtifact[]): AggregateCompatibilityEvidenceOptions {
  let call = 0;
  return {
    target,
    versions,
    configuredSecrets: ["configured-secret", "response-secret", "one-time-code", "aggregate-verifier"],
    clock: () => call++ === 0 ? startedAt : finishedAt,
    writer: {
      write: async (artifact) => {
        writes.push(artifact);
      },
    },
  };
}

async function completeFacts(): Promise<AggregateCompatibilityFact[]> {
  return [
    ...configurationAndDiscoveryFacts(),
    ...compatibilityCoreFacts(),
    ...negativeFacts(),
    await delegatedTokenFact(),
    authenticatedOperationFact(),
  ];
}

describe("aggregate MCP compatibility evidence profile", () => {
  it("runs the compatibility core from one private session and keeps the later tail explicit", async () => {
    const writes: AggregateCompatibilityArtifact[] = [];
    const facts = await completeFacts();
    const result = await runAggregateCompatibilityEvidence(options(writes), async ({ compatibility, publicClient }) => {
      expect(Object.isFrozen(compatibility)).toBe(true);
      expect(Object.isFrozen(publicClient)).toBe(true);
      for (const fact of facts) await compatibility.record(fact);
      for (const fact of shadowDiscoveryFacts()) await publicClient.record(fact);
    });

    expect(result.report.issue).toBe("#768");
    expect(result.report.gates.map(({ id }) => id)).toEqual(COMPATIBILITY_PROFILE.expandedGateIds);
    expect(result.report.gates.slice(COMPATIBILITY_PROFILE.requiredGateIds.length).every(({ status }) => status === "not-proven")).toBe(true);
    expect(result.report.gates.find(({ id }) => id === "resource-discovery")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "provider-discovery")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "public-client-registration")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "authorization-consent")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "loopback-pkce")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "pkce-negative-proof")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "resource-binding-negative")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "delegated-token-validation")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "delegated-token-negative-boundary")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "authenticated-mcp-operation")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "pkce-negative-proof")?.evidence).toMatchObject({
      cases: expect.arrayContaining(pkceNegativeCases.map(() => expect.objectContaining({ status: "pass" }))),
      requestStatuses: [400, 422, 400, 403],
      rejectedCount: 4,
      authorizedCount: 0,
    });
    expect(result.report.gates.find(({ id }) => id === "resource-binding-negative")?.evidence).toMatchObject({
      cases: expect.arrayContaining(resourceNegativeCases.map(() => expect.objectContaining({ status: "pass" }))),
      requestStatuses: [400, 422, 400, 403],
      rejectedCount: 4,
      authorizedCount: 0,
    });
    expect(result.report.gates.find(({ id }) => id === "delegated-token-negative-boundary")?.evidence).toMatchObject({
      cases: expect.arrayContaining(delegatedNegativeCases.map(() => expect.objectContaining({ status: "pass" }))),
      requestStatuses: [401, 403, 401, 403, 401, 403, 401, 403, 401, 403, 401],
      rejectedCount: 11,
      authorizedCount: 0,
    });
    expect(result.report.gates.slice(10, 16).map(({ status }) => status)).toEqual(["not-proven", "not-proven", "not-proven", "not-proven", "not-proven", "not-proven"]);
    expect(result.report.outcome).toBe("not-proven");
    expect(writes).toHaveLength(1);
    expect(result.artifact.contents).toBe(writes[0]?.contents);
    expect(result.artifact.contents).not.toContain("response-secret");
    expect(result.artifact.contents).not.toContain("one-time-code");
    expect(result.artifact.contents).not.toContain("aggregate-verifier");
    expect(createHash("sha256").update(result.artifact.contents).digest("hex")).toBe(
      "464221c11813ad229be2ff4b57e4602fcbdfa0e17e265a98a6787408e4e6f41b",
    );
  });

  it("lets compatibility discovery own shared gates while accepting only public shadow discovery", async () => {
    const writes: AggregateCompatibilityArtifact[] = [];
    const result = await runAggregateCompatibilityEvidence(options(writes), async ({ compatibility, publicClient }) => {
      await publicClient.record(shadowDiscoveryFacts()[0]);
      await publicClient.record(shadowDiscoveryFacts()[1]);
      await compatibility.record(configurationAndDiscoveryFacts()[2]);
      await compatibility.record(configurationAndDiscoveryFacts()[3]);
    });

    expect(result.report.gates.find(({ id }) => id === "resource-discovery")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "provider-discovery")).toMatchObject({ status: "pass" });

    const publicOnly = await runAggregateCompatibilityEvidence(options([]), async ({ publicClient }) => {
      for (const fact of shadowDiscoveryFacts()) await publicClient.record(fact);
    });
    expect(publicOnly.report.gates.find(({ id }) => id === "resource-discovery")).toMatchObject({ status: "not-proven" });
    expect(publicOnly.report.gates.find(({ id }) => id === "provider-discovery")).toMatchObject({ status: "not-proven" });

    await expect(runAggregateCompatibilityEvidence(options([]), async ({ publicClient }) => {
      await publicClient.record({ ...shadowDiscoveryFacts()[0], role: "primary" } as never);
    })).rejects.toThrow("Aggregate compatibility evidence journey failed.");
  });

  it("keeps dependency failures and the later producer tail not-proven in profile order", async () => {
    const facts = configurationAndDiscoveryFacts();
    const resourceFact = facts[2] as Extract<AggregateCompatibilityFact, { kind: "resource-discovery" }>;
    facts[2] = {
      ...resourceFact,
      response: surface({
        resource: "https://unrelated.example/mcp",
        authorization_server: target.expectedAuthorizationServer,
      }),
    };
    const result = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of [...facts, ...compatibilityCoreFacts(), ...negativeFacts()]) await compatibility.record(fact);
    });

    expect(result.report.gates.slice(0, 10).map(({ status }) => status)).toEqual([
      "fail",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
    ]);
    expect(result.report.gates.slice(10, 16).map(({ status }) => status)).toEqual([
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
      "not-proven",
    ]);
    expect(result.report.gates.slice(COMPATIBILITY_PROFILE.requiredGateIds.length).every(({ status }) => status === "not-proven")).toBe(true);
  });

  it("rejects family identity, conclusion fields, and source-swapped facts at the recorder boundary", async () => {
    const attempts: AggregateCompatibilityFact[] = [
      {
        kind: "registration",
        role: "primary",
        family: "ipv4",
        response: surface({}, 201),
      } as never,
      {
        kind: "authorization",
        role: "primary",
        family: "ipv4",
        status: "pass",
      } as never,
      {
        kind: "authorization",
        role: "primary",
        observation: { status: "pass" },
      } as never,
      {
        kind: "authorization",
        role: "primary",
        observation: { family: "ipv4" },
      } as never,
      {
        kind: "loopback",
        role: "callback",
        family: "ipv4",
        observation: { registeredRedirectUri },
      } as never,
      {
        kind: "loopback",
        role: "callback",
        observation: { family: "ipv4", registeredRedirectUri },
      } as never,
      {
        kind: "resource-discovery",
        role: "primary",
        response: surface({ resource: target.canonicalResource }),
      } as never,
    ];

    for (const attempt of attempts) {
      await expect(runAggregateCompatibilityEvidence(options([]), async ({ compatibility, publicClient }) => {
        if (attempt.kind === "resource-discovery") await publicClient.record(attempt as never);
        else await compatibility.record(attempt);
      })).rejects.toThrow("Aggregate compatibility evidence journey failed.");
    }
  });

  it("derives negative verdicts from complete response primitives and credential presence", async () => {
    const passing: AggregateCompatibilityFact = {
      kind: "resource-binding",
      role: "negative",
      caseId: "missing-resource",
      request: request(`${target.expectedAuthorizationServer}/authorize`, {
        method: "GET",
        status: 400,
        response: surface({ error: "invalid_resource" }, 400),
      }),
    };
    const credentialed: AggregateCompatibilityFact = {
      kind: "pkce",
      role: "negative",
      caseId: "missing-code-verifier",
      request: request(`${target.expectedAuthorizationServer}/token`, {
        status: 401,
        response: surface({ error: "invalid_request", access_token: "must-fail" }, 401),
      }),
    };
    const incomplete: AggregateCompatibilityFact = {
      kind: "delegated-token",
      role: "negative",
      caseId: "invalid-time",
      request: {
        method: "POST",
        url: target.canonicalResource,
        authorizationHeaderPresent: true,
        response: { complete: false, body: { error: "invalid_token" } },
      },
    };
    const writes: AggregateCompatibilityArtifact[] = [];
    const result = await runAggregateCompatibilityEvidence(options(writes), async ({ compatibility }) => {
      for (const fact of [...configurationAndDiscoveryFacts(), ...compatibilityCoreFacts()]) await compatibility.record(fact);
      await compatibility.record(passing);
      await compatibility.record(credentialed);
      await compatibility.record(incomplete);
    });

    expect(result.report.gates.find(({ id }) => id === "resource-binding-negative")).toMatchObject({ status: "not-proven" });
    expect(result.report.gates.find(({ id }) => id === "pkce-negative-proof")).toMatchObject({ status: "fail" });
    expect(result.report.gates.find(({ id }) => id === "delegated-token-negative-boundary")).toMatchObject({ status: "not-proven" });
  });

  it("fails closed for malformed or tampered delegated-token material and stays not-proven without JWKS", async () => {
    const validFact = await delegatedTokenFact();
    const tamperedToken = validFact.token?.split(".");
    const tampered = tamperedToken?.length === 3
      ? `${tamperedToken[0]}.${tamperedToken[1]}.${tamperedToken[2].startsWith("A") ? "B" : "A"}${tamperedToken[2].slice(1)}`
      : "";
    const prelude = [...configurationAndDiscoveryFacts(), ...compatibilityCoreFacts()];

    const malformed = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of prelude) await compatibility.record(fact);
      await compatibility.record({ ...validFact, token: "not-a-compact-jwt" });
    });
    expect(malformed.report.gates.find(({ id }) => id === "delegated-token-validation")).toMatchObject({ status: "fail" });
    expect(malformed.artifact.contents).not.toContain("not-a-compact-jwt");

    const invalidSignature = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of prelude) await compatibility.record(fact);
      await compatibility.record({ ...validFact, token: tampered });
    });
    expect(invalidSignature.report.gates.find(({ id }) => id === "delegated-token-validation")).toMatchObject({ status: "fail" });
    expect(invalidSignature.artifact.contents).not.toContain(tampered);

    const unavailable = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of prelude) await compatibility.record(fact);
      await compatibility.record({ ...validFact, jwks: undefined });
    });
    expect(unavailable.report.gates.find(({ id }) => id === "delegated-token-validation")).toMatchObject({ status: "not-proven" });
  });

  it("classifies a complete MCP rejection from its response boundary and credential presence", async () => {
    const prelude = [...configurationAndDiscoveryFacts(), ...compatibilityCoreFacts(), await delegatedTokenFact()];
    const result = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of prelude) await compatibility.record(fact);
      await compatibility.record({
        kind: "mcp-operation",
        role: "authenticated",
        observation: { operationUrl: target.canonicalResource, operationResource: target.canonicalResource },
        request: request(target.canonicalResource, {
          authorizationHeaderPresent: true,
          status: 401,
          response: surface({ error: "invalid_token" }, 401),
        }),
      });
    });
    expect(result.report.gates.find(({ id }) => id === "authenticated-mcp-operation")).toMatchObject({ status: "fail" });

    const credentialed = await runAggregateCompatibilityEvidence(options([]), async ({ compatibility }) => {
      for (const fact of prelude) await compatibility.record(fact);
      await compatibility.record({
        kind: "mcp-operation",
        role: "authenticated",
        observation: { operationUrl: target.canonicalResource, operationResource: target.canonicalResource },
        request: request(target.canonicalResource, {
          authorizationHeaderPresent: true,
          status: 401,
          response: surface({ error: "invalid_token", access_token: "must-not-pass" }, 401),
        }),
      });
    });
    expect(credentialed.report.gates.find(({ id }) => id === "authenticated-mcp-operation")).toMatchObject({ status: "not-proven" });
    expect(credentialed.artifact.contents).not.toContain("must-not-pass");
  });

  it("keeps the aggregate artifact byte-stable across repeated deterministic runs", async () => {
    const run = async () => {
      const writes: AggregateCompatibilityArtifact[] = [];
      const result = await runAggregateCompatibilityEvidence(options(writes), async ({ compatibility }) => {
        await compatibility.record({ kind: "configuration", role: "snapshot", observation: { loopbackHosts: ["127.0.0.1", "::1"] } });
      });
      return result;
    };

    const first = await run();
    const second = await run();
    expect(first.artifact.contents).toBe(second.artifact.contents);
    expect(createHash("sha256").update(first.artifact.contents).digest("hex")).toBe(
      "ec9c8aa5e70796f477aebb8eeeade6ede7e8ac4c852feda15ed52f1cc188de02",
    );
    expect(first.report.gates.map(({ id }) => id)).toEqual(COMPATIBILITY_PROFILE.expandedGateIds);
    expect(MCP_ACCESS_GRANT_FAMILIES).toEqual(["ipv4", "ipv6"]);
  });
});
