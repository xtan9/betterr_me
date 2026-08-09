// @vitest-environment node
import { createHash } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  MCP_ACCESS_GRANT_FAMILIES,
  PUBLIC_CLIENT_PROFILE,
  type CatalogFamily,
} from "../../e2e/mcp-access-grant-catalogs";
import { s256CodeChallenge } from "../../e2e/mcp-access-grant-journey";
import {
  runPublicClientEvidence,
  type PublicClientArtifact,
  type PublicClientFact,
  type PublicClientEvidenceOptions,
  type PublicClientJsonValue,
  type PublicClientNegativeRegistrationCase,
} from "../../e2e/mcp-access-grant-public-client-profile";

const target = {
  name: "profile-fixture",
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

function surface(body: PublicClientJsonValue, status = 200) {
  return { complete: true as const, status, body };
}

function familyHost(family: CatalogFamily): "127.0.0.1" | "::1" {
  if (family === "ipv4") return "127.0.0.1";
  if (family === "ipv6") return "::1";
  throw new Error(`Unsupported fixture family ${family}`);
}

function familyFacts(family: "ipv4" | "ipv6"): PublicClientFact[] {
  const host = familyHost(family);
  const registeredRedirectUri = host === "::1"
    ? "http://[::1]/oauth/callback"
    : "http://127.0.0.1/oauth/callback";
  const callbackUrl = host === "::1"
    ? "http://[::1]:43123/oauth/callback?code=one-time-code&state=state-value"
    : "http://127.0.0.1:43123/oauth/callback?code=one-time-code&state=state-value";
  const requestCallbackUrl = host === "::1"
    ? "http://[::1]:43123/oauth/callback"
    : "http://127.0.0.1:43123/oauth/callback";
  const verifier = `verifier-${family}`;

  return [
    {
      kind: "registration",
      role: "primary",
      family,
      response: surface({
        client_id: `client-${family}`,
        redirect_uris: [registeredRedirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }, 201),
    },
    ...(["unsupported-client-auth-method", "unsupported-grant-type", "unsupported-response-type", "malformed-metadata", "unsafe-redirect-metadata"] as const satisfies readonly PublicClientNegativeRegistrationCase[]).map((caseId) => ({
      kind: "registration" as const,
      role: "negative" as const,
      family,
      caseId,
      response: surface({ error: "invalid_client_metadata", error_code: "invalid_client_metadata" }, 400),
    })),
    {
      kind: "consent",
      role: "metadata",
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
      kind: "authorization",
      role: "approval",
      family,
      observation: {
        affirmativeControlVisible: true,
        denialControlVisible: true,
        callbackBeforeDecision: false,
        decision: "affirmative",
      },
    },
    {
      kind: "authorization",
      role: "denial",
      family,
      observation: {
        callbackComplete: true,
        callbackUrl: "http://127.0.0.1/oauth/callback?error=access_denied&state=state-value",
        expectedState: "state-value",
        callbackState: "state-value",
        authorizationError: true,
        tokenRequestObserved: false,
      },
    },
    {
      kind: "authorization",
      role: "abandonment",
      family,
      observation: {
        callbackComplete: true,
        callbackReceived: false,
        browserUrl: "http://provider.example.test/authorize",
        tokenRequestObserved: false,
      },
    },
    {
      kind: "loopback",
      role: "callback",
      family,
      observation: {
        registeredRedirectUri,
        callbackUrl,
        callbackReceived: true,
      },
    },
    {
      kind: "loopback",
      role: "request",
      family,
      observation: {
        registeredRedirectUri,
        requestCallbackUrl,
        requestResource: target.canonicalResource,
        portSelectedAtRequest: true,
      },
    },
    {
      kind: "pkce",
      role: "exchange",
      family,
      observation: {
        verifier,
        challenge: s256CodeChallenge(verifier),
        method: "S256",
        requestResource: target.canonicalResource,
      },
    },
  ] satisfies PublicClientFact[];
}

function sharedFacts(): PublicClientFact[] {
  return [
    {
      kind: "resource-discovery",
      role: "primary",
      response: surface({
        resource: target.canonicalResource,
        authorization_server: target.expectedAuthorizationServer,
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
    },
    {
      kind: "configuration",
      role: "snapshot",
      observation: {
        loopbackHosts: ["127.0.0.1", "::1"],
        providerCredentialsAvailable: false,
      },
    },
    { kind: "versions", role: "snapshot", values: versions },
  ];
}

function familyPrerequisiteFacts(
  family: "ipv4" | "ipv6",
  kinds: readonly PublicClientFact["kind"][],
): PublicClientFact[] {
  return [
    ...sharedFacts(),
    ...familyFacts(family).filter((fact) => kinds.includes(fact.kind) && (fact.kind !== "registration" || fact.role === "primary")),
  ];
}

function options(
  writes: PublicClientArtifact[],
  clock: () => string = (() => {
    let call = 0;
    return () => call++ === 0 ? startedAt : finishedAt;
  })(),
): PublicClientEvidenceOptions {
  return {
    target,
    versions,
    configuredSecrets: ["configured-secret", "configured-anon-key"],
    clock,
    writer: {
      write: async (artifact) => {
        writes.push(artifact);
      },
    },
  };
}

async function completedDelegatedTokenFacts(
  family: "ipv4" | "ipv6",
  lifetimeSeconds = 3600,
): Promise<PublicClientFact[]> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = await exportJWK(publicKey);
  key.kid = `key-${family}`;
  key.alg = "RS256";
  key.use = "sig";
  key.key_ops = ["verify"];
  const issuedAt = Math.floor(Date.parse(startedAt) / 1000);
  const token = await new SignJWT({
    iss: target.expectedAuthorizationServer,
    sub: `user-${family}`,
    aud: target.canonicalResource,
    client_id: `client-${family}`,
    resource: target.canonicalResource,
  })
    .setProtectedHeader({ alg: "RS256", kid: `key-${family}`, typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetimeSeconds)
    .sign(privateKey);

  return [
    {
      kind: "delegated-token",
      role: "validation",
      family,
      token,
      jwks: JSON.stringify({ keys: [key] }),
      request: {
        method: "POST",
        url: target.expectedAuthorizationServer + "/token",
        bodyFields: ["client_id", "grant_type", "resource"],
        requestClientId: `client-${family}`,
        requestGrantType: "authorization_code",
        requestResource: target.canonicalResource,
        status: 200,
      },
    },
    {
      kind: "mcp-operation",
      role: "authenticated",
      family,
      observation: {
        operationUrl: target.canonicalResource,
        sdk: {
          connected: true,
          listToolsCompleted: true,
          callToolCompleted: true,
          resultIsError: false,
        },
      },
      request: {
        method: "POST",
        url: target.canonicalResource,
        authorizationHeaderPresent: true,
        status: 200,
      },
    },
    {
      kind: "grant",
      role: "cleanup",
      family,
      observation: {
        listRequestObserved: true,
        listedClientIds: [`client-${family}`],
        grantId: `grant-${family}`,
        revokeRequestObserved: true,
        revokeResponse: surface({}, 204),
      },
    },
    {
      kind: "cleanup",
      role: "family",
      family,
      observation: {
        listRequestObserved: true,
        remainingClientIds: [],
        requestStatus: 200,
      },
    },
  ] as never as PublicClientFact[];
}

describe("public-client Candidate 2 evidence profile", () => {
  it("records delegated-token, MCP-operation, grant, and cleanup facts for both families", async () => {
    const writes: PublicClientArtifact[] = [];
    const facts = [...sharedFacts(), ...MCP_ACCESS_GRANT_FAMILIES.flatMap(familyFacts)];
    for (const family of MCP_ACCESS_GRANT_FAMILIES) {
      facts.push(...await completedDelegatedTokenFacts(family));
    }

    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      for (const fact of facts) await recorder.record(fact);
    });

    expect(result.report.gates.find(({ id }) => id === "delegated-token-validation-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "authenticated-mcp-operation-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "consent-cleanup-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates).toHaveLength(PUBLIC_CLIENT_PROFILE.expandedGateIds.length);
    expect(new Set(result.report.gates.map(({ id }) => id)).size).toBe(result.report.gates.length);
    expect(result.artifact.contents).not.toContain("grant-ipv4");
    expect(result.artifact.contents).not.toContain("eyJ");
    expect(createHash("sha256").update(result.artifact.contents).digest("hex")).toBe(
      "e818d1e11f4b3b597e765f50322890a935279245f47d03fb2d775226167009c5",
    );
  });

  it("does not pass a standalone leaf when a cataloged prerequisite is missing", async () => {
    const writes: PublicClientArtifact[] = [];
    const pkceFact = familyFacts("ipv4").find(({ kind }) => kind === "pkce");
    if (!pkceFact) throw new Error("Missing PKCE fixture");

    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record(pkceFact);
    });

    expect(result.report.gates.find(({ id }) => id === "loopback-pkce-ipv4")).toMatchObject({
      status: "not-proven",
      evidence: { errorKind: "missing-observation", errorCode: "dependency-not-proven" },
    });
  });

  it("does not pass standalone leaves through failed or conflicting cataloged prerequisites", async () => {
    const registrationFact = familyFacts("ipv4")[0];
    const shared = sharedFacts();
    const failedShared = shared.map((fact) => fact.kind === "resource-discovery"
      ? {
          ...fact,
          response: surface({
            resource: "https://unrelated.example/mcp",
            authorization_server: target.expectedAuthorizationServer,
          }),
        }
      : fact);

    const failed = await runPublicClientEvidence(options([]), async (recorder) => {
      for (const fact of [...failedShared, registrationFact]) await recorder.record(fact);
    });
    expect(failed.report.gates.find(({ id }) => id === "provider-discovery")).toMatchObject({ status: "not-proven" });
    expect(failed.report.gates.find(({ id }) => id === "public-client-registration-ipv4")).toMatchObject({
      status: "not-proven",
      evidence: { errorKind: "missing-observation", errorCode: "dependency-not-proven" },
    });

    const providerFact = shared.find(({ kind }) => kind === "provider-discovery") as Extract<PublicClientFact, { kind: "provider-discovery" }> | undefined;
    if (!providerFact) throw new Error("Missing provider discovery fixture");
    const conflictingProvider = {
      ...providerFact,
      response: surface({ issuer: "https://conflicting.example.test" }),
    } satisfies Extract<PublicClientFact, { kind: "provider-discovery" }>;
    const conflicting = await runPublicClientEvidence(options([]), async (recorder) => {
      for (const fact of shared) await recorder.record(fact);
      await recorder.record(conflictingProvider);
      await recorder.record(registrationFact);
    });
    expect(conflicting.report.gates.find(({ id }) => id === "provider-discovery")).toMatchObject({
      status: "fail",
      evidence: { errorKind: "conflicting-observation" },
    });
    expect(conflicting.report.gates.find(({ id }) => id === "public-client-registration-ipv4")).toMatchObject({
      status: "not-proven",
      evidence: { errorKind: "missing-observation", errorCode: "dependency-not-proven" },
    });
  });

  it("fails closed for malformed cryptographic material and stays not-proven when JWKS is unavailable", async () => {
    const malformedWrites: PublicClientArtifact[] = [];
    const malformed = await runPublicClientEvidence(options(malformedWrites), async (recorder) => {
      await recorder.record(familyFacts("ipv4")[0]);
      await recorder.record({
        kind: "delegated-token",
        role: "validation",
        family: "ipv4",
        token: "not-a-compact-jwt",
        jwks: JSON.stringify({ keys: [] }),
      } as never);
    });
    expect(malformed.report.gates.find(({ id }) => id === "delegated-token-validation-ipv4")).toMatchObject({ status: "fail" });
    expect(malformed.artifact.contents).not.toContain("not-a-compact-jwt");
    expect(createHash("sha256").update(malformed.artifact.contents).digest("hex")).toBe(
      "18740908b82f296f5e6cbedafee4494bfec7ac3c560732a5fa5b3c52c2b9fd82",
    );

    const unavailableWrites: PublicClientArtifact[] = [];
    const unavailable = await runPublicClientEvidence(options(unavailableWrites), async (recorder) => {
      await recorder.record(familyFacts("ipv6")[0]);
      await recorder.record({
        kind: "delegated-token",
        role: "validation",
        family: "ipv6",
        token: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJpc3MiOiJpc3N1ZXIifQ.signature",
      } as never);
    });
    expect(unavailable.report.gates.find(({ id }) => id === "delegated-token-validation-ipv6")).toMatchObject({ status: "not-proven" });
    expect(createHash("sha256").update(unavailable.artifact.contents).digest("hex")).toBe(
      "ec7b8a8a4a0c0989d4e695855f20d234b4cbb1fd4294a7c9958649c26ed93425",
    );
  });

  it("fails closed when a valid-shaped delegated token has an invalid signature", async () => {
    const writes: PublicClientArtifact[] = [];
    const tokenFact = (await completedDelegatedTokenFacts("ipv4"))[0] as Extract<PublicClientFact, { kind: "delegated-token" }>;
    const token = tokenFact.token;
    const tokenParts = token?.split(".");
    const tamperedToken = tokenParts?.length === 3
      ? `${tokenParts[0]}.${tokenParts[1]}.${tokenParts[2].startsWith("A") ? "B" : "A"}${tokenParts[2].slice(1)}`
      : "";
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record(familyFacts("ipv4")[0]);
      await recorder.record({ ...tokenFact, token: tamperedToken });
    });

    expect(result.report.gates.find(({ id }) => id === "delegated-token-validation-ipv4")).toMatchObject({ status: "fail" });
    expect(result.artifact.contents).not.toContain(tamperedToken);
    expect(createHash("sha256").update(result.artifact.contents).digest("hex")).toBe(
      "c1f939a6d6d677cd5f108f889b201a13efba457943b5a731291d66b235595128",
    );
  });

  it("derives MCP rejection from primitive boundary observations and rejects adapter status words", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record({
        kind: "mcp-operation",
        role: "authenticated",
        family: "ipv4",
        observation: {
          operationUrl: target.canonicalResource,
          sdk: { connected: false, listToolsCompleted: false, callToolCompleted: false, resultIsError: false },
        },
        request: {
          method: "POST",
          url: target.canonicalResource,
          authorizationHeaderPresent: true,
          status: 401,
          response: surface({ error: "invalid_token" }, 401),
        },
      });
    });
    expect(result.report.gates.find(({ id }) => id === "authenticated-mcp-operation-ipv4")).toMatchObject({ status: "fail" });

    const boundaryOnly = await runPublicClientEvidence(options([]), async (recorder) => {
      await recorder.record({
        kind: "mcp-operation",
        role: "authenticated",
        family: "ipv4",
        observation: { operationUrl: target.canonicalResource },
        request: {
          method: "POST",
          url: target.canonicalResource,
          authorizationHeaderPresent: true,
          status: 403,
          response: surface({ error: "invalid_token" }, 403),
        },
      });
    });
    expect(boundaryOnly.report.gates.find(({ id }) => id === "authenticated-mcp-operation-ipv4")).toMatchObject({ status: "fail" });

    await expect(runPublicClientEvidence(options([]), async (recorder) => {
      await recorder.record({
        kind: "mcp-operation",
        role: "authenticated",
        family: "ipv4",
        observation: { status: "authorized" },
      } as never);
    })).rejects.toThrow("Public-client evidence journey failed.");
  });

  it("uses the injected sampled time for delegated-token expiry", async () => {
    const writes: PublicClientArtifact[] = [];
    let clockCall = 0;
    const sampledClock = () => {
      clockCall += 1;
      return new Date(Date.parse(startedAt) + Math.min(clockCall - 1, 2) * 1000).toISOString();
    };
    const tokenFacts = await completedDelegatedTokenFacts("ipv4", 10);
    const result = await runPublicClientEvidence(options(writes, sampledClock), async (recorder) => {
      for (const fact of familyPrerequisiteFacts("ipv4", ["registration", "loopback", "pkce"])) await recorder.record(fact);
      await recorder.record(tokenFacts[0]);
    });

    expect(result.report.gates.find(({ id }) => id === "delegated-token-validation-ipv4")).toMatchObject({ status: "pass" });
  });

  it("runs both exact loopback families through one recorder and one artifact", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      for (const fact of [...sharedFacts(), ...MCP_ACCESS_GRANT_FAMILIES.flatMap(familyFacts)]) {
        await recorder.record(fact);
      }
    });

    expect(result.report.issue).toBe("#765");
    expect(result.report.gates.map(({ id }) => id)).toEqual(PUBLIC_CLIENT_PROFILE.expandedGateIds);
    expect(result.report.gates.find(({ id }) => id === "public-client-registration-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "registration-negative-validation-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "loopback-pkce-both")).toMatchObject({ status: "pass" });
    expect(result.report.gates.find(({ id }) => id === "delegated-token-validation-both")).toMatchObject({ status: "not-proven" });
    expect(result.report.gates.find(({ id }) => id === "authenticated-mcp-operation-both")).toMatchObject({ status: "not-proven" });
    expect(result.report.outcome).toBe("not-proven");
    expect(writes).toHaveLength(1);
    expect(writes[0].filename).toBe("mcp-access-grant-evidence.json");
    expect(writes[0].contents).toBe(result.artifact.contents);
    expect(JSON.parse(result.artifact.contents)).toMatchObject({ issue: "#765", outcome: "not-proven" });
    expect(createHash("sha256").update(result.artifact.contents).digest("hex")).toBe(
      "332eb557f7d1e81eb1b41942e46020f534b8f9a6107cae4cf6527c8cad3005b2",
    );
  });

  it("derives unknown credential presence conservatively for negative registration", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record({
        kind: "registration",
        role: "negative",
        family: "ipv4",
        caseId: "malformed-metadata",
        response: {
          complete: false,
          status: 400,
          body: { error: "invalid_client_metadata", access_token: "must-not-be-retained" },
        },
      });
    });

    expect(result.report.gates.find(({ id }) => id === "registration-negative-validation-ipv4")).toMatchObject({ status: "not-proven" });
    expect(result.report.gates.find(({ id }) => id === "registration-negative-validation-both")).toMatchObject({ status: "not-proven" });
    expect(result.artifact.contents).not.toContain("must-not-be-retained");
  });

  it("minimizes ephemeral values before asynchronous recording resolves", async () => {
    const writes: PublicClientArtifact[] = [];
    let resolveRecord: (() => void) | undefined;
    const resultPromise = runPublicClientEvidence(options(writes), async (recorder) => {
      const record = recorder.record({
        kind: "pkce",
        role: "exchange",
        family: "ipv4",
        observation: {
          verifier: "raw-verifier-value",
          challenge: "raw-challenge-value",
          method: "S256",
          requestResource: target.canonicalResource,
        },
      });
      await new Promise<void>((resolve) => {
        resolveRecord = resolve;
      });
      resolveRecord?.();
      await record;
    });

    resolveRecord?.();
    const result = await resultPromise;
    expect(result.artifact.contents).not.toMatch(/raw-(?:verifier|challenge|code|state|token)-value/);
    expect(result.artifact.contents).not.toContain("raw-token");
  });

  it("rejects non-public families and compatibility-only roles without writing", async () => {
    const writes: PublicClientArtifact[] = [];

    await expect(runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record({
        kind: "loopback",
        role: "callback",
        family: "both",
        observation: { registeredRedirectUri: "http://127.0.0.1/oauth/callback", callbackUrl: "http://127.0.0.1:1/oauth/callback" },
      } as never);
    })).rejects.toThrow("Public-client evidence journey failed.");

    await expect(runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record({
        kind: "pkce",
        role: "positive",
        family: "ipv4",
        observation: { verifier: "v", challenge: "c", method: "S256" },
      } as never);
    })).rejects.toThrow("Public-client evidence journey failed.");

    expect(writes).toHaveLength(0);
  });

  it("treats callback authorization codes as credentials while keeping state-only callbacks non-credentialed", async () => {
    const codeWrites: PublicClientArtifact[] = [];
    const codeResult = await runPublicClientEvidence(options(codeWrites), async (recorder) => {
      await recorder.record({
        kind: "authorization",
        role: "denial",
        family: "ipv4",
        observation: {
          callbackComplete: true,
          callbackUrl: "http://127.0.0.1/oauth/callback?code=raw-authorization-code&state=raw-state",
          expectedState: "raw-state",
          callbackState: "raw-state",
          authorizationError: true,
          tokenRequestObserved: false,
        },
      });
    });
    expect(codeResult.report.gates.find(({ id }) => id === "consent-denial-ipv4")).toMatchObject({ status: "fail" });
    expect(codeResult.artifact.contents).not.toContain("raw-authorization-code");
    expect(codeResult.artifact.contents).not.toContain("raw-state");

    const stateWrites: PublicClientArtifact[] = [];
    const stateResult = await runPublicClientEvidence(options(stateWrites), async (recorder) => {
      for (const fact of familyPrerequisiteFacts("ipv4", ["registration", "consent"])) await recorder.record(fact);
      await recorder.record({
        kind: "authorization",
        role: "denial",
        family: "ipv4",
        observation: {
          callbackComplete: true,
          callbackUrl: "http://127.0.0.1/oauth/callback?error=access_denied&state=raw-state",
          expectedState: "raw-state",
          callbackState: "raw-state",
          authorizationError: true,
          tokenRequestObserved: false,
        },
      });
    });
    expect(stateResult.report.gates.find(({ id }) => id === "consent-denial-ipv4")).toMatchObject({ status: "pass" });
    expect(stateResult.artifact.contents).not.toContain("raw-state");
  });

  it("turns contradictory primitive observations into a stable gate failure", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"], providerCredentialsAvailable: false },
      });
      await recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1"], providerCredentialsAvailable: false },
      });
    });

    expect(result.report.gates.find(({ id }) => id === "reproducible-configuration")).toMatchObject({
      status: "fail",
      evidence: { errorKind: "conflicting-observation" },
    });
    expect(result.report.outcome).toBe("blocked");
    expect(writes).toHaveLength(1);
    expect(createHash("sha256").update(result.artifact.contents).digest("hex")).toBe(
      "37ea143ddbf2b93727f6bd861759f2449ed1b5c203df44c6c8e18fefa5d745d4",
    );
  });

  it("does not claim grant cleanup until the public revoke observation succeeds", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(options(writes), async (recorder) => {
      await recorder.record(familyFacts("ipv4")[0]);
      await recorder.record({
        kind: "grant",
        role: "cleanup",
        family: "ipv4",
        observation: {
          listRequestObserved: true,
          listedClientIds: ["client-ipv4"],
          grantId: "grant-ipv4",
          grantClientId: "client-ipv4",
        },
      });
      await recorder.record({
        kind: "cleanup",
        role: "family",
        family: "ipv4",
        observation: { remainingClientIds: [], requestStatus: 200 },
      });
    });

    expect(result.report.gates.find(({ id }) => id === "consent-cleanup-ipv4")).toMatchObject({
      status: "not-proven",
      evidence: { grantStatus: "absent", grantIdentified: true, grantRevoked: false },
    });
  });

  it("records an artifact-write failure as a deterministic blocked result", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence({
      ...options(writes),
      writer: {
        write: async (artifact) => {
          writes.push(artifact);
          throw new Error("writer is unavailable");
        },
      },
    }, async () => undefined);

    expect(result.artifactWriteSucceeded).toBe(false);
    expect(result.report.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({ status: "fail" });
    expect(result.report.outcome).toBe("blocked");
    expect(writes.length).toBeGreaterThan(0);
    expect(result.artifact.contents).not.toContain("writer is unavailable");
  });

  it("keeps missing later producers stable and produces byte-identical artifacts", async () => {
    const run = async () => {
      const writes: PublicClientArtifact[] = [];
      const result = await runPublicClientEvidence(options(writes), async () => undefined);
      return { result, writes };
    };

    const first = await run();
    const second = await run();
    expect(first.result.report.gates.map(({ id }) => id).slice(0, PUBLIC_CLIENT_PROFILE.requiredGateIds.length))
      .toEqual(PUBLIC_CLIENT_PROFILE.requiredGateIds);
    expect(first.result.report.gates.find(({ id }) => id === "delegated-token-validation-both")).toMatchObject({ status: "not-proven" });
    expect(first.result.artifact.contents).toBe(second.result.artifact.contents);
    expect(createHash("sha256").update(first.result.artifact.contents).digest("hex")).toBe(
      "f7e7da971f0c30c94eb2b249028b63ba1cdc6230fa20d62e5caee2874c0df2c0",
    );
  });
});
