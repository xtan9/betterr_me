import { describe, expect, it } from "vitest";

import {
  EVIDENCE_ARTIFACT_FILENAME,
  GateAccumulator,
  createEvidenceKernel,
  createEvidenceRunContext,
  finalizeEvidence,
  finalizeReport,
  isEvidenceSanitized,
  minimizeResponseBody,
  type EvidenceObservation,
  type EvidenceRunContext,
} from "../../e2e/mcp-access-grant-evidence";

const context: EvidenceRunContext = {
  configuredSecrets: ["configured-password", "configured-anon-key"],
  time: { startedAt: "2026-08-03T00:00:00.000Z", finishedAt: "2026-08-03T00:01:00.000Z" },
  versions: { "@modelcontextprotocol/sdk": "1.0.0", node: "22.0.0" },
};

const target = {
  name: "fixture",
  canonicalResource: "https://mcp.example.test/resource",
  supabaseUrl: "https://supabase.example.test",
  expectedAuthorizationServer: "https://supabase.example.test/auth/v1",
};

function gate(gateId: string, status: "pass" | "fail" | "not-proven", detail = "diagnostic") {
  return { kind: "gate" as const, gateId, status, detail };
}

describe("deterministic MCP evidence kernel", () => {
  it.each([
    ["pass", "pass", "passed"],
    ["fail", "fail", "blocked"],
    ["skip", "not-proven", "not-proven"],
  ] as const)("preserves %s gate and report outcome", (_name, status, outcome) => {
    const report = finalizeReport({ issue: "#799", target, requiredGateIds: ["example"], observations: [gate("example", status)] }, context);
    expect(report.gates).toEqual([expect.objectContaining({ id: "example", status })]);
    expect(report.outcome).toBe(outcome);
  });

  it("adds caller-required missing gates and preserves manifest order", () => {
    const report = finalizeReport({ issue: "#799", target, requiredGateIds: ["second", "first"], observations: [gate("first", "pass")] }, context);
    expect(report.gates.map(({ id }) => id)).toEqual(["second", "first"]);
    expect(report.gates[0]).toMatchObject({ status: "not-proven", evidence: { errorKind: "missing-observation" } });
  });

  it("fails closed for conflicting and malformed observations", () => {
    const conflicting = finalizeReport({
      issue: "#799", target, requiredGateIds: ["conflict", "malformed"],
      observations: [gate("conflict", "pass"), gate("conflict", "not-proven"), { kind: "gate", gateId: "malformed", detail: "ignored" }],
    }, context);
    expect(conflicting.gates.find(({ id }) => id === "conflict")).toMatchObject({ status: "fail", evidence: { errorKind: "conflicting-observation" } });
    expect(conflicting.gates.find(({ id }) => id === "malformed")).toMatchObject({ status: "not-proven", evidence: { errorKind: "missing-observation" } });

    const typedConflict = finalizeReport({
      issue: "#799", target, requiredGateIds: ["typed-conflict"],
      observations: [
        { kind: "pkce", gateId: "typed-conflict", verifierMatchesChallenge: true, method: "S256" },
        { kind: "pkce", gateId: "typed-conflict", verifierMatchesChallenge: false, method: "S256" },
      ],
    }, context);
    expect(typedConflict.gates[0]).toMatchObject({ status: "fail", evidence: { errorKind: "conflicting-observation" } });
  });

  it("redacts hostile fields, bounds diagnostics, and fails closed on configured secrets", () => {
    const hostile = finalizeReport({
      issue: "#799", target, requiredGateIds: ["hostile", "sanitized-evidence"],
      observations: [gate("hostile", "pass", `configured-password ${"x".repeat(900)}`), {
        kind: "request",
        request: {
          method: "GET", url: "https://mcp.example.test", requestBodyFields: [], authorizationHeaderPresent: false,
          responseBody: { access_token: "live-token", unexpected: "configured-anon-key" },
        },
      }],
    }, context);
    expect(hostile.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({ status: "fail" });
    expect(hostile.gates.find(({ id }) => id === "hostile")?.detail.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(hostile)).not.toContain("configured-password");
    expect(JSON.stringify(hostile)).not.toContain("configured-anon-key");
  });

  it("accepts already-redacted credential fields while rejecting raw configured version secrets", () => {
    const safe = finalizeReport({
      issue: "#799", target, requiredGateIds: ["safe", "sanitized-evidence"],
      observations: [{ kind: "request", request: {
        method: "GET", url: "https://mcp.example.test", requestBodyFields: [], authorizationHeaderPresent: false,
        responseBody: { access_token: "[REDACTED]" },
      }}],
    }, context);
    expect(safe.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({ status: "pass" });

    const leakingContext = { ...context, versions: { leaked: "configured-password" } };
    const leaked = finalizeReport({ issue: "#799", target, requiredGateIds: ["sanitized-evidence"], observations: [] }, leakingContext);
    expect(leaked.gates[0]).toMatchObject({ id: "sanitized-evidence", status: "fail" });
    expect(isEvidenceSanitized('{"access_token":"[REDACTED]"}', [])).toBe(true);
    expect(isEvidenceSanitized('{"access_token":"live-access-token"}', [])).toBe(false);
    expect(isEvidenceSanitized('{"detail":"configured-password"}', ["configured-password"])).toBe(false);
  });

  it("preserves minimized request URLs in the report shape", () => {
    const report = finalizeReport({
      issue: "#799", target, requiredGateIds: ["sanitized-evidence"], observations: [{ kind: "request", request: {
        method: "GET", url: "https://mcp.example.test/resource", requestBodyFields: [], authorizationHeaderPresent: false,
      }}],
    }, context);
    expect(report.requests[0]).toMatchObject({ url: "https://mcp.example.test/resource" });
  });

  it("minimizes response payloads before they cross an adapter boundary", () => {
    expect(minimizeResponseBody(JSON.stringify({ error: "invalid_request", unexpected: "provider detail" }), "application/json")).toEqual({
      error: "invalid_request",
      unexpected: "[REDACTED: unexpected field]",
    });
    expect(minimizeResponseBody(JSON.stringify({ access_token: "live-access-token" }), "application/json")).toEqual({
      access_token: "[REDACTED]",
    });
    expect(minimizeResponseBody("opaque response", "text/plain")).toEqual({
      contentType: "text/plain",
      body: "[REDACTED RESPONSE BODY]",
    });
  });

  it("preserves version-map keys while sanitizing version values", () => {
    const report = finalizeReport({ issue: "#799", target, requiredGateIds: [], observations: [] }, context);
    expect(report.versions).toEqual(context.versions);
  });

  it("uses structured errors rather than diagnostic wording for verdicts", () => {
    const report = finalizeReport({
      issue: "#799", target, requiredGateIds: ["missing", "malformed", "leak"],
      observations: [
        { ...gate("missing", "pass", "everything is fine"), error: { kind: "missing-observation" } },
        { ...gate("malformed", "pass", "this says pass"), error: { kind: "malformed-observation" } },
        { ...gate("leak", "pass", "not a secret"), error: { kind: "secret-leak" } },
      ],
    }, context);
    expect(report.gates.map(({ status }) => status)).toEqual(["not-proven", "fail", "fail"]);
  });

  it("composes focused policy rules for PKCE, resource binding, and public boundaries", () => {
    const report = finalizeReport({
      issue: "#799", target, requiredGateIds: ["pkce", "resource", "boundary"],
      observations: [
        { kind: "pkce", gateId: "pkce", verifierMatchesChallenge: false, method: "S256" },
        { kind: "resource-binding", gateId: "resource", canonicalResource: target.canonicalResource, observedResource: target.canonicalResource },
        { kind: "public-boundary", gateId: "boundary", status: 401, responseContainsCredentials: false },
      ],
    }, context);
    expect(report.gates).toEqual([
      expect.objectContaining({ id: "pkce", status: "fail" }),
      expect.objectContaining({ id: "resource", status: "pass" }),
      expect.objectContaining({ id: "boundary", status: "pass" }),
    ]);
  });

  it.each([
    ["valid delegated JWT", true, "pass"],
    ["invalid delegated JWT", false, "fail"],
  ] as const)("composes the delegated JWT policy for %s", (_name, signatureValid, status) => {
    const report = finalizeReport({
      issue: "#799", target, requiredGateIds: ["delegated"],
      observations: [{
        kind: "delegated-jwt",
        gateId: "delegated",
        signatureValid,
        header: { alg: "RS256", kid: "key-1" },
        claims: {
          iss: target.expectedAuthorizationServer,
          sub: "user-1",
          aud: target.canonicalResource,
          exp: 2_000,
          iat: 1_000,
          client_id: "client-1",
        },
        policy: {
          canonicalResource: target.canonicalResource,
          expectedClientId: "client-1",
          expectedIssuer: target.expectedAuthorizationServer,
          nowSeconds: 1_500,
          tokenRequest: { clientId: "client-1", grantType: "authorization_code", resource: target.canonicalResource },
        },
        signingKeys: [{ alg: "RS256", kid: "key-1", kty: "RSA", use: "sig", key_ops: ["verify"] }],
      }],
    }, context);
    expect(report.gates[0]).toMatchObject({ id: "delegated", status });
  });

  it("is deterministic and keeps verification separate from artifact writing", () => {
    const input = { issue: "#799", target, requiredGateIds: ["example", "sanitized-evidence"], observations: [gate("example", "pass")] as EvidenceObservation[] };
    const firstFinalized = finalizeEvidence(input, context);
    const second = finalizeReport(input, createEvidenceRunContext(context));
    const first = firstFinalized.report;
    expect(first).toEqual(second);
    const kernel = createEvidenceKernel(context);
    const verified = kernel.verifyEvidence(first);
    expect(verified.sanitized).toBe(true);
    expect(verified.serialized).toContain(EVIDENCE_ARTIFACT_FILENAME);
    expect(JSON.parse(firstFinalized.verification.serialized).outcome).toBe(first.outcome);

    const artifactFailure = finalizeEvidence({ ...input, artifactWriteSucceeded: false }, context);
    expect(artifactFailure.report.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("could not be written"),
    });
  });

  it("owns gate accumulation without ambient state", () => {
    const accumulator = new GateAccumulator();
    accumulator.add({ id: "a", status: "pass", detail: "one" });
    accumulator.add({ id: "b", status: "not-proven", detail: "two" });
    expect(accumulator.snapshot(["a", "b"]).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("freezes the context snapshot so later caller mutations cannot affect a run", () => {
    const secrets = ["secret"];
    const versions = { node: "22" };
    const run = createEvidenceRunContext({ ...context, configuredSecrets: secrets, versions });
    secrets[0] = "changed";
    versions.node = "changed";
    expect(run.configuredSecrets).toEqual(["secret"]);
    expect(run.versions).toEqual({ node: "22" });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.time)).toBe(true);
    expect(Object.isFrozen(run.versions)).toBe(true);
  });
});
