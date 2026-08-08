// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("MCP access-grant evidence architecture", () => {
  it("keeps the deterministic kernel independent of live adapters and capabilities", () => {
    const kernel = source("e2e/mcp-access-grant-evidence.ts");

    expect(kernel).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(kernel).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(kernel).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)/);
    expect(kernel).toMatch(/export class GateAccumulator/);
    expect(kernel).toMatch(/export function finalizeEvidence/);
    expect(kernel).toMatch(/export function verifyEvidence/);
  });

  it("keeps the public-client Candidate 2 boundary deterministic and source-bound", () => {
    const profile = source("e2e/mcp-access-grant-public-client-profile.ts");
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];
    const factBoundaryStart = profile.indexOf("export type PublicClientFact");
    const factBoundaryEnd = profile.indexOf("export type PublicClientNegativeRegistrationCase");
    const factBoundary = profile.slice(factBoundaryStart, factBoundaryEnd);

    expect(profile).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(profile).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(profile).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)\.ts/);
    expect(profile).toMatch(/export async function runPublicClientEvidence/);
    expect(profile).toMatch(/requiredGateIds: PUBLIC_CLIENT_PROFILE\.expandedGateIds/);
    expect(factBoundary).not.toMatch(/\b(?:profile|source|gateId|outcome)\s*:/);
    expect(factBoundary).not.toMatch(/\bstatus\s*:/);
    expect(adapters.join("\n")).not.toMatch(/mcp-access-grant-public-client-profile/);
  });

  it("keeps the aggregate compatibility profile deterministic and source-bound", () => {
    const profile = source("e2e/mcp-access-grant-aggregate-profile.ts");
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];

    expect(profile).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(profile).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(profile).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)\.ts/);
    expect(profile).toMatch(/export async function runAggregateCompatibilityEvidence/);
    expect(profile).toMatch(/requiredGateIds: COMPATIBILITY_PROFILE\.expandedGateIds/);
    expect(profile).toMatch(/source-bound/);
    expect(profile.match(/export async function /g)).toHaveLength(1);
    expect(adapters.join("\n")).not.toMatch(/mcp-access-grant-aggregate-profile|runAggregateCompatibilityEvidence/);
  });

  it("leaves live capabilities, journey sequencing, and suite manifests in the adapters", () => {
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];

    for (const adapter of adapters) {
      expect(adapter).toMatch(/mcp-access-grant-evidence/);
      expect(adapter).not.toMatch(/interface Compatibility(?:Gate|Report)/);
      expect(adapter).not.toMatch(/class GateAccumulator/);
      expect(adapter).not.toMatch(/function (?:sanitizeEvidence|verifyEvidence|finalizeEvidence|finalizeReport)\s*\(/);
    }

    expect(adapters[0]).toMatch(/PUBLIC_CLIENT_REQUIRED_GATE_IDS/);
    expect(adapters[1]).toMatch(/REQUIRED_GATE_IDS/);
  });

  it("centralizes target loading before either journey receives live capabilities", () => {
    const targetBoundary = source("e2e/mcp-access-grant-target.ts");
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];

    expect(targetBoundary).toMatch(/export function loadMcpAccessGrantConfiguration/);
    expect(targetBoundary).toMatch(/McpAccessGrantTargetConfigurationError/);
    expect(targetBoundary).toMatch(/Object\.freeze/);
    for (const adapter of adapters) {
      expect(adapter).toMatch(/mcp-access-grant-target/);
      expect(adapter).not.toMatch(/function (?:parseTarget|loadMcpAccessGrantTargets)\s*\(/);
      expect(adapter).not.toMatch(/process\.env\.MCP_(?:ACCESS_GRANT_TARGETS|ACCESS_GRANT_TARGET_NAME|ACCESS_GRANT_CANONICAL_RESOURCE|ACCESS_GRANT_LOOPBACK_HOSTS|SUPABASE_URL|SUPABASE_AUTH_ISSUER|SUPABASE_ANON_KEY|TEST_EMAIL|TEST_PASSWORD)/);
    }
  });

  it("keeps adapter-safe journey mechanics free of evidence conclusions", () => {
    const journey = source("e2e/mcp-access-grant-journey.ts");
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];

    expect(journey).not.toMatch(/mcp-access-grant-(?:evidence|policy)/);
    expect(journey).not.toMatch(/\b(?:GateAccumulator|GateStatus|classify|finalize|sanitizeText|sanitizeUrl)\b/);
    expect(journey).toMatch(/MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG/);
    expect(journey).toMatch(/export function (?:buildLoopbackUrls|buildPublicNativeClientMetadata|buildRegistrationNegativeCases|grantClientId|s256CodeChallenge)/);
    expect(journey).toMatch(/export function assertExactCanonicalResource/);

    for (const adapter of adapters) {
      expect(adapter).toMatch(/mcp-access-grant-journey/);
    }
  });

  it("keeps the disposable E2E target explicit at the canonical boundary", () => {
    const workflow = source(".github/workflows/e2e.yml");

    expect(workflow).toContain('export MCP_ACCESS_GRANT_BETTERRME_ORIGIN="http://localhost:3000"');
    expect(workflow).toContain('export MCP_ACCESS_GRANT_CANONICAL_RESOURCE="${MCP_ACCESS_GRANT_BETTERRME_ORIGIN}/mcp"');
    expect(workflow).toContain('printf \'MCP_ACCESS_GRANT_CANONICAL_RESOURCE=%s\\n\' "$MCP_ACCESS_GRANT_CANONICAL_RESOURCE" >> "$GITHUB_ENV"');
    expect(workflow).toContain('export MCP_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"');
    expect(workflow).toContain('printf \'MCP_SUPABASE_URL=%s\\n\' "$MCP_SUPABASE_URL" >> "$GITHUB_ENV"');
  });

  it("keeps deterministic unit tests independent of either live runner", () => {
    const tests = [
      source("tests/e2e/mcp-access-grant-evidence.test.ts"),
      source("tests/e2e/mcp-access-grant-policy.test.ts"),
      source("tests/e2e/mcp-access-grant-compatibility.test.ts"),
    ];

    for (const testSource of tests) {
      expect(testSource).not.toMatch(/from ["'](?:@\/)?(?:\.\/|\.\.\/)*e2e\/mcp-access-grant-(?:public-client|compatibility)["']/);
    }
  });
});
