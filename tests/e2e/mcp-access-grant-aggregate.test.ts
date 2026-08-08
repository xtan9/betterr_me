// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { type TestInfo } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVIDENCE_ARTIFACT_FILENAME,
  finalizeReport,
  type CompatibilityReportTarget,
  type EvidenceObservation,
  type EvidenceRunContext,
  type MinimizedRequestObservation,
} from "../../e2e/mcp-access-grant-evidence";
import {
  loadMcpAccessGrantTargets,
  MCP_ACCESS_GRANT_AGGREGATE_ISSUE,
  mcpAccessGrantCharacterization,
  REQUIRED_GATE_IDS,
  type McpAccessGrantTarget,
} from "../../e2e/mcp-access-grant-compatibility";

const ENVIRONMENT_KEYS = [
  "MCP_ACCESS_GRANT_TARGETS",
  "MCP_ACCESS_GRANT_TARGET_NAME",
  "MCP_ACCESS_GRANT_CANONICAL_RESOURCE",
  "MCP_ACCESS_GRANT_LOOPBACK_HOSTS",
  "MCP_ACCESS_GRANT_NON_PRODUCTION_ACK",
  "MCP_ACCESS_GRANT_EVIDENCE_PATH",
  "MCP_SUPABASE_URL",
  "MCP_SUPABASE_AUTH_ISSUER",
  "MCP_SUPABASE_ANON_KEY",
  "MCP_CUSTOM_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const environmentBeforeEachTest = new Map<string, string | undefined>();
let temporaryDirectory: string;

const reportTarget: CompatibilityReportTarget = {
  name: "aggregate-fixture",
  canonicalResource: "https://mcp.example.test/mcp",
  supabaseUrl: "https://supabase.example.test",
  expectedAuthorizationServer: "https://supabase.example.test/auth/v1",
};

const localTarget: McpAccessGrantTarget = {
  name: "local-fixture",
  canonicalResource: "http://127.0.0.1:3000/mcp",
  supabaseUrl: "http://127.0.0.1:54321",
  expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
};

const hostedTarget: McpAccessGrantTarget = {
  name: "hosted-fixture",
  canonicalResource: "https://mcp.example.test/mcp",
  supabaseUrl: "https://supabase.example.test",
  expectedAuthorizationServer: "https://supabase.example.test/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
};

const context: EvidenceRunContext = {
  configuredSecrets: [],
  time: {
    startedAt: "2026-08-07T00:00:00.000Z",
    finishedAt: "2026-08-07T00:01:00.000Z",
  },
  versions: {
    "@modelcontextprotocol/sdk": "1.28.0",
    "@playwright/test": "1.58.1",
    "@supabase/supabase-js": "2.95.2",
    "mcp-handler": "1.1.0",
    "supabase-cli": "2.109.1",
  },
};

function setEnvironment(values: Partial<Record<(typeof ENVIRONMENT_KEYS)[number], string>>): void {
  for (const key of ENVIRONMENT_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

function gate(gateId: string, status: "pass" | "fail" | "not-proven"): EvidenceObservation {
  return { kind: "gate", gateId, status, detail: `${gateId} fixture` };
}

function fakeTestInfo(outputPath: string): TestInfo {
  return { outputPath: vi.fn(() => outputPath) } as unknown as TestInfo;
}

beforeEach(async () => {
  for (const key of ENVIRONMENT_KEYS) {
    environmentBeforeEachTest.set(key, process.env[key]);
  }
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "mcp-access-grant-aggregate-"));
  setEnvironment({});
});

afterEach(async () => {
  for (const key of ENVIRONMENT_KEYS) {
    const value = environmentBeforeEachTest.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  environmentBeforeEachTest.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("MCP access-grant aggregate target characterization", () => {
  it("loads valid targets, derives the provider issuer, and resolves explicit loopback hosts", () => {
    setEnvironment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "configured-local",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        loopbackHosts: ["::1", "127.0.0.1", "not-loopback", "::1"],
        anonKeyEnv: "MCP_CUSTOM_ANON_KEY",
      }]),
      MCP_CUSTOM_ANON_KEY: "configured-anon-key",
    });

    expect(loadMcpAccessGrantTargets()).toEqual([{
      name: "configured-local",
      canonicalResource: "http://127.0.0.1:3000/mcp",
      supabaseUrl: "http://127.0.0.1:54321",
      expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
      loopbackHosts: ["::1", "127.0.0.1"],
      anonKey: "configured-anon-key",
      email: undefined,
      password: undefined,
    }]);
  });

  it("preserves the malformed JSON fallback as a single empty target", () => {
    setEnvironment({
      MCP_ACCESS_GRANT_TARGETS: "[{",
      MCP_ACCESS_GRANT_TARGET_NAME: "environment-target",
      MCP_ACCESS_GRANT_CANONICAL_RESOURCE: "https://ignored.example/mcp",
      MCP_SUPABASE_URL: "https://ignored.supabase.example",
      MCP_SUPABASE_AUTH_ISSUER: "https://ignored.supabase.example/auth/v1",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fallback-anon-key",
    });

    expect(loadMcpAccessGrantTargets()).toEqual([{
      name: "target-1",
      canonicalResource: "",
      supabaseUrl: "",
      expectedAuthorizationServer: "",
      loopbackHosts: ["127.0.0.1", "::1"],
      anonKey: "fallback-anon-key",
      email: undefined,
      password: undefined,
    }]);
  });

  it("normalizes structurally invalid array entries instead of treating them as live targets", () => {
    setEnvironment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([
        "not-an-object",
        { name: 42, canonicalResource: 42, supabaseUrl: null, loopbackHosts: ["localhost", 7] },
      ]),
    });

    expect(loadMcpAccessGrantTargets()).toEqual([
      {
        name: "target-1",
        canonicalResource: "",
        supabaseUrl: "",
        expectedAuthorizationServer: "",
        loopbackHosts: ["127.0.0.1", "::1"],
        anonKey: undefined,
        email: undefined,
        password: undefined,
      },
      {
        name: "target-2",
        canonicalResource: "",
        supabaseUrl: "",
        expectedAuthorizationServer: "",
        loopbackHosts: [],
        anonKey: undefined,
        email: undefined,
        password: undefined,
      },
    ]);
  });

  it("falls back from a target-specific anon-key environment name to the public anon key", () => {
    setEnvironment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "fallback-key-target",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        anonKeyEnv: "MCP_CUSTOM_ANON_KEY",
      }]),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fallback-anon-key",
    });

    expect(loadMcpAccessGrantTargets()[0]).toMatchObject({ anonKey: "fallback-anon-key" });
  });

  it("preserves the aggregate's existing non-loopback acknowledgement policy", () => {
    setEnvironment({});
    expect(mcpAccessGrantCharacterization.evaluateTargetConfiguration(localTarget)).toEqual({
      configured: true,
      nonProduction: true,
    });
    expect(mcpAccessGrantCharacterization.evaluateTargetConfiguration(hostedTarget)).toEqual({
      configured: true,
      nonProduction: false,
    });

    setEnvironment({ MCP_ACCESS_GRANT_NON_PRODUCTION_ACK: "true" });
    expect(mcpAccessGrantCharacterization.evaluateTargetConfiguration(hostedTarget)).toEqual({
      configured: true,
      nonProduction: true,
    });
  });
});

describe("MCP access-grant aggregate request characterization", () => {
  it("records URL-plus-init method, normalized authorization presence, body fields, and credential presence", async () => {
    const requests: MinimizedRequestObservation[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ access_token: "response-secret", detail: "safe" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          location: "https://mcp.example.test/callback?code=response-code",
        },
      },
    )));
    const fetchWithEvidence = mcpAccessGrantCharacterization.createEvidenceFetch(requests);

    await fetchWithEvidence("https://provider.example.test/token", {
      method: "POST",
      headers: {
        AUTHORIZATION: "Bearer request-secret",
        "X-Trace": "trace-value",
      },
      body: new URLSearchParams({
        client_id: "client-id",
        code: "authorization-code",
        code_challenge: "challenge",
        code_challenge_method: "S256",
        code_verifier: "verifier-secret",
        grant_type: "authorization_code",
        redirect_uri: "http://127.0.0.1/oauth/callback",
        resource: reportTarget.canonicalResource,
      }),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "https://provider.example.test/token",
      requestBodyFields: [
        "client_id",
        "code",
        "code_challenge",
        "code_challenge_method",
        "code_verifier",
        "grant_type",
        "redirect_uri",
        "resource",
      ],
      authorizationHeaderPresent: true,
      requestClientIdPresent: true,
      requestCodePresent: true,
      requestCodeChallengePresent: true,
      requestCodeChallengeMethod: "S256",
      requestCodeVerifierPresent: true,
      requestGrantType: "authorization_code",
      requestRedirectUri: "http://127.0.0.1/oauth/callback",
      requestResource: reportTarget.canonicalResource,
      status: 200,
      responseCredentialFields: ["access_token", "code"],
      responseContainsCredentials: true,
    });
    expect(requests[0]?.requestCodeVerifierHash).toEqual(expect.any(String));
    expect(JSON.stringify(requests[0])).not.toContain("request-secret");
    expect(JSON.stringify(requests[0])).not.toContain("response-secret");
    expect(JSON.stringify(requests[0])).not.toContain("verifier-secret");
  });

  it("records Request method and case-insensitive headers without asserting credential values", async () => {
    const requests: MinimizedRequestObservation[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ access_token: "response-secret" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    )));
    const fetchWithEvidence = mcpAccessGrantCharacterization.createEvidenceFetch(requests);
    const input = new Request("https://provider.example.test/resource", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer request-secret",
        "X-Trace": "trace-value",
      },
      body: JSON.stringify({ access_token: "request-body-secret" }),
    });

    await fetchWithEvidence(input);

    expect(requests[0]).toMatchObject({
      method: "PATCH",
      url: "https://provider.example.test/resource",
      authorizationHeaderPresent: true,
      status: 401,
      responseCredentialFields: ["access_token"],
      responseContainsCredentials: true,
    });
    // Current aggregate capture reads Request method/headers but only URL-plus-init bodies;
    // richer Request body/header fields are the explicitly permitted additive delta.
    expect(requests[0]?.requestBodyFields).toEqual([]);
    expect(JSON.stringify(requests[0])).not.toContain("request-secret");
    expect(JSON.stringify(requests[0])).not.toContain("request-body-secret");
    expect(JSON.stringify(requests[0])).not.toContain("response-secret");
  });
});

describe("MCP access-grant aggregate version characterization", () => {
  it("records Docker-derived provider facts only for local targets", async () => {
    const localVersions = await mcpAccessGrantCharacterization.collectVersions(localTarget);
    const hostedVersions = await mcpAccessGrantCharacterization.collectVersions(hostedTarget);

    expect(localVersions).toMatchObject({
      "supabase-auth-provider-image": expect.any(String),
      "supabase-hosted-provider-version": "not-applicable",
    });
    expect(hostedVersions).toMatchObject({
      "supabase-auth-provider-image": "not-applicable",
      "supabase-hosted-provider-version": "not-publicly-exposed",
    });
    expect(Object.keys(localVersions)).toEqual([
      "supabase-cli",
      "@modelcontextprotocol/sdk",
      "@playwright/test",
      "@supabase/supabase-js",
      "mcp-handler",
      "supabase-auth-provider-image",
      "supabase-hosted-provider-version",
      "declared-sdk-range",
    ]);
    expect(Object.keys(hostedVersions)).toEqual(Object.keys(localVersions));
  });
});

describe("MCP access-grant aggregate report characterization", () => {
  it("locks issue identity, gate order, report shape, filename, and status precedence", () => {
    expect(MCP_ACCESS_GRANT_AGGREGATE_ISSUE).toBe("#768");
    expect(mcpAccessGrantCharacterization.issue).toBe(MCP_ACCESS_GRANT_AGGREGATE_ISSUE);
    expect(REQUIRED_GATE_IDS).toEqual([
      "resource-discovery",
      "provider-discovery",
      "public-client-registration",
      "authorization-consent",
      "loopback-pkce",
      "pkce-negative-proof",
      "resource-binding-negative",
      "delegated-token-validation",
      "delegated-token-negative-boundary",
      "authenticated-mcp-operation",
      "refresh-rotation",
      "refresh-replay-containment",
      "grant-identification-revocation",
      "post-revocation-refresh",
      "post-revocation-access",
      "cleanup",
      "reproducible-configuration",
      "sanitized-evidence",
      "versions",
    ]);
    expect(EVIDENCE_ARTIFACT_FILENAME).toBe("mcp-access-grant-evidence.json");

    const report = finalizeReport({
      issue: "#768",
      target: reportTarget,
      requiredGateIds: REQUIRED_GATE_IDS,
      observations: REQUIRED_GATE_IDS.map((id) => gate(id, "pass")),
    }, context);

    expect(Object.keys(report)).toEqual([
      "issue",
      "outcome",
      "startedAt",
      "finishedAt",
      "target",
      "versions",
      "gates",
      "requests",
    ]);
    expect(report.issue).toBe(MCP_ACCESS_GRANT_AGGREGATE_ISSUE);
    expect(report.target).toEqual(reportTarget);
    expect(report.startedAt).toBe(context.time.startedAt);
    expect(report.finishedAt).toBe(context.time.finishedAt);
    expect(report.versions).toEqual(context.versions);
    expect(report.gates.map(({ id }) => id)).toEqual([...REQUIRED_GATE_IDS]);
    expect(report.requests).toEqual([]);
    expect(report.outcome).toBe("passed");
    expect(report.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({
      status: "pass",
      evidence: { artifactFilename: EVIDENCE_ARTIFACT_FILENAME },
    });

    const statuses: Array<["fail" | "not-proven", "blocked" | "not-proven"]> = [
      ["not-proven", "not-proven"],
      ["fail", "blocked"],
    ];
    for (const [status, outcome] of statuses) {
      const observations = REQUIRED_GATE_IDS.map((id) => gate(id, "pass"));
      observations[0] = gate(REQUIRED_GATE_IDS[0], status);
      expect(finalizeReport({
        issue: "#768",
        target: reportTarget,
        requiredGateIds: REQUIRED_GATE_IDS,
        observations,
      }, context).outcome).toBe(outcome);
    }
  });

  it("locks provider-policy outcomes at the aggregate report boundary", () => {
    const valid = finalizeReport({
      issue: "#768",
      target: reportTarget,
      requiredGateIds: ["resource", "public-boundary"],
      observations: [
        {
          kind: "resource-binding",
          gateId: "resource",
          canonicalResource: reportTarget.canonicalResource,
          observedResource: reportTarget.canonicalResource,
        },
        {
          kind: "public-boundary",
          gateId: "public-boundary",
          status: 401,
          responseContainsCredentials: false,
        },
      ],
    }, context);
    expect(valid.gates.map(({ status }) => status)).toEqual(["pass", "pass"]);

    const invalid = finalizeReport({
      issue: "#768",
      target: reportTarget,
      requiredGateIds: ["resource", "public-boundary"],
      observations: [
        {
          kind: "resource-binding",
          gateId: "resource",
          canonicalResource: reportTarget.canonicalResource,
          observedResource: "https://unrelated.example/mcp",
        },
        {
          kind: "public-boundary",
          gateId: "public-boundary",
          status: 200,
          responseContainsCredentials: false,
        },
      ],
    }, context);
    expect(invalid.gates.map(({ status }) => status)).toEqual(["fail", "fail"]);
  });

  it("fills an unobserved aggregate gate as not-proven in manifest order", () => {
    const report = finalizeReport({
      issue: "#768",
      target: reportTarget,
      requiredGateIds: ["second", "first"],
      observations: [gate("first", "pass")],
    }, context);

    expect(report.gates).toEqual([
      expect.objectContaining({
        id: "second",
        status: "not-proven",
        evidence: expect.objectContaining({ errorKind: "missing-observation" }),
      }),
      expect.objectContaining({ id: "first", status: "pass" }),
    ]);
    expect(report.outcome).toBe("not-proven");
  });
});

describe("MCP access-grant aggregate artifact characterization", () => {
  it("writes the primary artifact and an optional mirror when both destinations succeed", async () => {
    const primaryPath = path.join(temporaryDirectory, "playwright", EVIDENCE_ARTIFACT_FILENAME);
    const mirrorPath = path.join(temporaryDirectory, "mirror", EVIDENCE_ARTIFACT_FILENAME);
    const serialized = '{"outcome":"passed"}\n';
    setEnvironment({ MCP_ACCESS_GRANT_EVIDENCE_PATH: mirrorPath });

    const written = await mcpAccessGrantCharacterization.writeReport(serialized, fakeTestInfo(primaryPath));

    expect(written).toBe(true);
    await expect(readFile(primaryPath, "utf8")).resolves.toBe(serialized);
    await expect(readFile(mirrorPath, "utf8")).resolves.toBe(serialized);
  });

  it("treats a primary or optional-mirror write failure as an unsuccessful aggregate write", async () => {
    const serialized = '{"outcome":"blocked"}\n';
    const primaryDirectory = path.join(temporaryDirectory, "primary-directory");
    await mkdir(primaryDirectory, { recursive: true });

    await expect(
      mcpAccessGrantCharacterization.writeReport(serialized, fakeTestInfo(primaryDirectory)),
    ).resolves.toBe(false);

    const primaryPath = path.join(temporaryDirectory, "valid-primary", EVIDENCE_ARTIFACT_FILENAME);
    const mirrorDirectory = path.join(temporaryDirectory, "mirror-directory");
    await mkdir(mirrorDirectory, { recursive: true });
    setEnvironment({ MCP_ACCESS_GRANT_EVIDENCE_PATH: mirrorDirectory });

    const mirrorFailure = await mcpAccessGrantCharacterization.writeReport(
      serialized,
      fakeTestInfo(primaryPath),
    );

    expect(mirrorFailure).toBe(false);
    await expect(readFile(primaryPath, "utf8")).resolves.toBe(serialized);
    // A separate optional-mirror diagnostic is a permitted future additive change;
    // current behavior exposes only the aggregate boolean and keeps the primary file.
  });
});
