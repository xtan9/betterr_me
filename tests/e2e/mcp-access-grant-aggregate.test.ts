// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createLiveEvidenceSession,
  type LiveEvidenceRequestCapability,
  type LiveEvidenceRequestObservation,
} from "../../e2e/mcp-access-grant-live-session";
import {
  runAggregateCompatibilityEvidence,
} from "../../e2e/mcp-access-grant-aggregate-profile";
import { runPublicClientEvidence } from "../../e2e/mcp-access-grant-public-client-profile";
import type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
} from "../../e2e/mcp-access-grant-target";

const target: McpAccessGrantTarget = {
  name: "aggregate-fixture",
  canonicalResource: "https://mcp.example.test/mcp",
  supabaseUrl: "https://supabase.example.test",
  expectedAuthorizationServer: "https://supabase.example.test/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
  locality: {
    canonicalResourceIsLoopback: false,
    supabaseUrlIsLoopback: false,
    expectedAuthorizationServerIsLoopback: false,
    allEndpointsLoopback: false,
    nonProductionAcknowledged: false,
  },
};

const configuration: McpAccessGrantTargetConfiguration = {
  targets: [target],
  configuredValues: ["configured-secret"],
};

function requestCapability(requests: readonly LiveEvidenceRequestObservation[]): LiveEvidenceRequestCapability {
  const snapshot = (): readonly LiveEvidenceRequestObservation[] => requests;
  const latest = (predicate: (request: LiveEvidenceRequestObservation) => boolean = () => true) => [...requests].reverse().find(predicate);
  return {
    fetch: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    observe: () => undefined,
    snapshot,
    at: (index) => requests[index],
    latest,
    inputAt: () => undefined,
    latestInput: () => undefined,
    inputsSince: () => [],
  };
}

function createCapabilities() {
  const requests: readonly LiveEvidenceRequestObservation[] = [{
    method: "GET",
    url: target.canonicalResource,
    requestBodyFields: [],
    authorizationHeaderPresent: false,
    status: 200,
    responseBody: { resource: target.canonicalResource },
  }];
  const artifacts: string[] = [];
  const clockValues = ["2026-08-08T00:00:00.000Z", "2026-08-08T00:00:01.000Z"];
  let clockIndex = 0;
  return {
    requests,
    artifacts,
    capabilities: {
      clock: { now: () => clockValues[Math.min(clockIndex++, clockValues.length - 1)] as string },
      request: requestCapability(requests),
      versions: { collect: async () => ({ "@modelcontextprotocol/sdk": "fixture", "@playwright/test": "fixture", "@supabase/supabase-js": "fixture", "mcp-handler": "fixture", "supabase-cli": "fixture", "supabase-auth-provider-image": "fixture", "supabase-hosted-provider-version": "fixture", "declared-sdk-range": "fixture" }) },
      environment: { configuredValues: ["configured-secret"], get: () => undefined },
      filesystem: { readText: async () => "", makeDirectory: async () => undefined, writeText: async () => undefined },
      writer: { write: async (artifact: { contents: string }) => { artifacts.push(artifact.contents); } },
    },
  };
}

describe("MCP live evidence session cutover", () => {
  it("freezes the canonical target and exposes only explicit capabilities", () => {
    const fixture = createCapabilities();
    const session = createLiveEvidenceSession({ target, targetConfiguration: configuration, capabilities: fixture.capabilities });

    expect(Object.isFrozen(session.target)).toBe(true);
    expect(Object.isFrozen(session.target.loopbackHosts)).toBe(true);
    expect(Object.keys(session.capabilities).sort()).toEqual(["clock", "environment", "filesystem", "request", "versions", "writer"]);
    expect(session.reportTarget).toEqual({
      name: target.name,
      canonicalResource: target.canonicalResource,
      supabaseUrl: target.supabaseUrl,
      expectedAuthorizationServer: target.expectedAuthorizationServer,
      loopbackHosts: target.loopbackHosts,
    });
    expect(session.reportTarget).not.toHaveProperty("password");
    void fixture;
  });

  it("adds the session request snapshot exactly once to the standalone public profile", async () => {
    const fixture = createCapabilities();
    const session = createLiveEvidenceSession({ target, targetConfiguration: configuration, capabilities: fixture.capabilities });
    const options = await session.publicClientOptions();
    const result = await runPublicClientEvidence(options, async (recorder) => {
      await recorder.record({ kind: "configuration", role: "snapshot", observation: { loopbackHosts: target.loopbackHosts } });
      await recorder.record({ kind: "versions", role: "snapshot", values: options.versions });
      await recorder.record({
        kind: "resource-discovery",
        role: "primary",
        advertisedResource: target.canonicalResource,
        advertisedAuthorizationServer: target.expectedAuthorizationServer,
        request: { method: "GET", url: target.canonicalResource, bodyFields: [], authorizationHeaderPresent: false },
      });
    });

    expect(result.report.requests).toHaveLength(1);
    expect(result.report.requests[0]?.url).toBe(target.canonicalResource);
    expect(fixture.artifacts).toHaveLength(1);
  });

  it("uses one aggregate operation with the same authoritative request source", async () => {
    const fixture = createCapabilities();
    const session = createLiveEvidenceSession({ target, targetConfiguration: configuration, capabilities: fixture.capabilities });
    const options = await session.aggregateCompatibilityOptions();
    const result = await runAggregateCompatibilityEvidence(options, async (recorders) => {
      await recorders.compatibility.record({ kind: "configuration", role: "snapshot", observation: { loopbackHosts: target.loopbackHosts } });
      await recorders.compatibility.record({ kind: "versions", role: "snapshot", values: options.versions });
      await recorders.publicClient.record({ kind: "resource-discovery", role: "shadow", advertisedResource: target.canonicalResource, advertisedAuthorizationServer: target.expectedAuthorizationServer });
    });

    expect(result.report.issue).toBe("#768");
    expect(result.report.requests).toHaveLength(1);
    expect(fixture.artifacts).toHaveLength(1);
  });

  it("materializes missing public cleanup gates when no grant facts exist", async () => {
    const fixture = createCapabilities();
    const session = createLiveEvidenceSession({ target, targetConfiguration: configuration, capabilities: fixture.capabilities });
    const options = await session.aggregateCompatibilityOptions();
    const result = await runAggregateCompatibilityEvidence(options, async (recorders) => {
      await recorders.publicClient.record({
        kind: "registration",
        role: "primary",
        family: "ipv4",
        response: {
          complete: true,
          status: 201,
          body: {
            client_id: "fixture-client",
            redirect_uris: ["http://127.0.0.1/oauth/callback"],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
        },
        request: {
          method: "POST",
          url: "https://supabase.example.test/auth/v1/oauth/clients",
          bodyFields: ["redirect_uris"],
          authorizationHeaderPresent: false,
        },
      });
    });

    expect(result.report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "consent-cleanup-ipv4", status: "not-proven" }),
      expect.objectContaining({ id: "consent-cleanup-ipv6", status: "not-proven" }),
    ]));
  });
});
