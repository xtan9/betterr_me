// @vitest-environment node
import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function valueImports(relativePath: string): string[] {
  const file = ts.createSourceFile(relativePath, source(relativePath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return file.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    return [statement.moduleSpecifier.text];
  });
}

const forbiddenAdapterAuthority = /\b(?:GateAccumulator|GateStatus|REQUIRED_GATE_IDS|PUBLIC_CLIENT_REQUIRED_GATE_IDS|mcpAccessGrantCharacterization|finalizeEvidence|finalizeReport|verifyEvidence|sanitizeEvidence|writeReport|createEvidenceFetch|classifyAuthorizationOutcome|evaluateDelegatedJwtPolicy|jwtVerify|createRemoteJWKSet)\b|\bexpectedState\s*:/;

describe("MCP access-grant evidence architecture", () => {
  it("keeps the deterministic kernel independent of live adapters and capabilities", () => {
    const kernel = source("e2e/mcp-access-grant-evidence.ts");

    expect(kernel).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(kernel).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(kernel).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)(?:\.ts|-profile)/);
    expect(kernel).toMatch(/export class GateAccumulator/);
    expect(kernel).toMatch(/export function finalizeEvidence/);
    expect(kernel).toMatch(/export function verifyEvidence/);
  });

  it("keeps both deterministic Candidate 2 profiles source-bound and live-independent", () => {
    const publicProfile = source("e2e/mcp-access-grant-public-client-profile.ts");
    const aggregateProfile = source("e2e/mcp-access-grant-aggregate-profile.ts");

    for (const profile of [publicProfile, aggregateProfile]) {
      expect(profile).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
      expect(profile).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
      expect(profile).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)\.ts/);
    }
    expect(publicProfile).toMatch(/export async function runPublicClientEvidence/);
    expect(aggregateProfile).toMatch(/export async function runAggregateCompatibilityEvidence/);
    expect(publicProfile).toMatch(/requiredGateIds: PUBLIC_CLIENT_PROFILE\.expandedGateIds/);
    expect(aggregateProfile).toMatch(/requiredGateIds: COMPATIBILITY_PROFILE\.expandedGateIds/);
    expect(publicProfile).toMatch(/requestSource/);
    expect(aggregateProfile).toMatch(/requestSource/);
  });

  it("uses the exact adapter imports and one profile operation per live path", () => {
    const publicAdapter = source("e2e/mcp-access-grant-public-client.ts");
    const aggregateAdapter = source("e2e/mcp-access-grant-compatibility.ts");
    const liveSession = source("e2e/mcp-access-grant-live-session.ts");

    expect(publicAdapter).toMatch(/from ["']\.\/mcp-access-grant-live-session["']/);
    expect(publicAdapter).toMatch(/from ["']\.\/mcp-access-grant-public-client-profile["']/);
    expect(publicAdapter).not.toMatch(/mcp-access-grant-aggregate-profile|mcp-access-grant-policy|mcp-access-grant-evidence|mcp-access-grant-catalogs/);
    expect(publicAdapter.match(/runPublicClientEvidence\(/g)).toHaveLength(1);
    expect(aggregateAdapter).toMatch(/from ["']\.\/mcp-access-grant-live-session["']/);
    expect(aggregateAdapter).toMatch(/from ["']\.\/mcp-access-grant-aggregate-profile["']/);
    expect(aggregateAdapter).toMatch(/from ["']\.\/mcp-access-grant-public-client["']/);
    expect(aggregateAdapter).not.toMatch(/mcp-access-grant-policy|mcp-access-grant-evidence|mcp-access-grant-catalogs|mcp-access-grant-public-client-profile/);
    expect(aggregateAdapter.match(/runAggregateCompatibilityEvidence\(/g)).toHaveLength(1);
    expect(aggregateAdapter).toMatch(/recorders\.publicClient\.record/);
    expect(aggregateAdapter).toMatch(/recorders\.compatibility\.record/);
    expect(publicAdapter).not.toMatch(forbiddenAdapterAuthority);
    expect(aggregateAdapter).not.toMatch(forbiddenAdapterAuthority);
    expect(liveSession).toMatch(/McpAccessGrantTarget/);
    expect(liveSession).toMatch(/LiveEvidenceClockCapability|clock/);
    expect(liveSession).toMatch(/LiveEvidenceFilesystemCapability|filesystem/);
    expect(liveSession).toMatch(/LiveEvidenceAllDestinationsWriter|writer/);
    expect(valueImports("e2e/mcp-access-grant-live-session.ts")).toContain("./mcp-access-grant-evidence");
    expect(publicAdapter).toMatch(/mcp-access-grant-live-session/);
    expect(aggregateAdapter).toMatch(/mcp-access-grant-live-session/);

    expect(valueImports("e2e/mcp-access-grant-public-client.ts")).toEqual([
      "node:http",
      "node:crypto",
      "@modelcontextprotocol/sdk/client/index.js",
      "@modelcontextprotocol/sdk/client/auth.js",
      "@modelcontextprotocol/sdk/client/streamableHttp.js",
      "@supabase/supabase-js",
      "./mcp-access-grant-journey",
      "./mcp-access-grant-live-session",
      "./mcp-access-grant-public-client-profile",
    ]);
    expect(valueImports("e2e/mcp-access-grant-compatibility.ts")).toEqual([
      "node:http",
      "node:crypto",
      "@modelcontextprotocol/sdk/client/index.js",
      "@modelcontextprotocol/sdk/client/auth.js",
      "@modelcontextprotocol/sdk/client/streamableHttp.js",
      "@supabase/supabase-js",
      "./mcp-access-grant-journey",
      "./mcp-access-grant-live-session",
      "./mcp-access-grant-aggregate-profile",
      "./mcp-access-grant-public-client",
    ]);
  });

  it("uses one canonical public-client journey fact port without an adapter bridge", () => {
    const contract = source("e2e/mcp-access-grant-public-client-semantics.ts");
    const journey = source("e2e/mcp-access-grant-public-client.ts");
    const publicProfile = source("e2e/mcp-access-grant-public-client-profile.ts");
    const aggregateProfile = source("e2e/mcp-access-grant-aggregate-profile.ts");
    const aggregateAdapter = source("e2e/mcp-access-grant-compatibility.ts");

    expect(contract).toMatch(/export type PublicClientJourneyFact\s*=/);
    expect(contract).toMatch(/kind: "resource-discovery"/);
    expect(contract).toMatch(/kind: "provider-discovery"/);
    expect(contract).toMatch(/family: PublicClientFamily/);
    expect(contract).not.toMatch(/kind: "(?:configuration|versions)"/);
    expect(contract).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(contract).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(contract).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)(?:\.ts|-profile)/);
    expect(valueImports("e2e/mcp-access-grant-public-client-semantics.ts")).toEqual([
      "node:crypto",
      "jose",
      "./mcp-access-grant-evidence",
      "./mcp-access-grant-policy",
    ]);
    expect(contract).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(journey).toMatch(/mcp-access-grant-public-client-semantics/);
    expect(journey).toMatch(/record: \(fact: PublicClientJourneyFact\)/);
    expect(publicProfile).toMatch(/mcp-access-grant-public-client-semantics/);
    expect(publicProfile).toMatch(/record: \(fact: PublicClientJourneyFact\)/);
    expect(aggregateProfile).toMatch(/mcp-access-grant-public-client-semantics/);
    expect(aggregateProfile).toMatch(/record: \(fact: PublicClientJourneyFact\)/);
    expect(aggregateAdapter).toMatch(/record: recorders\.publicClient\.record/);
    expect(aggregateAdapter).not.toMatch(/aggregatePublicFact|as unknown as/);
    expect([publicProfile, aggregateProfile, aggregateAdapter].join("\n")).not.toMatch(/(?:AggregatePublicClientFact|aggregatePublicFact|localPublicClientFact)/);
  });

  it("keeps the canonical target and explicit capability construction at the session boundary", () => {
    const targetBoundary = source("e2e/mcp-access-grant-target.ts");
    const session = source("e2e/mcp-access-grant-live-session.ts");
    const adapters = [source("e2e/mcp-access-grant-public-client.ts"), source("e2e/mcp-access-grant-compatibility.ts")];

    expect(targetBoundary).toMatch(/export function loadMcpAccessGrantConfiguration/);
    expect(targetBoundary).toMatch(/McpAccessGrantTargetConfigurationError/);
    expect(targetBoundary).toMatch(/Object\.freeze/);
    expect(session).toMatch(/snapshotTarget/);
    expect(session).toMatch(/targetConfiguration/);
    expect(session).toMatch(/configuredValues/);
    expect(session).toMatch(/request:/);
    expect(session).toMatch(/versions:/);
    for (const adapter of adapters) {
      expect(adapter).toMatch(/mcp-access-grant-target/);
      expect(adapter).not.toMatch(/function (?:parseTarget|loadMcpAccessGrantTargets)\s*\(/);
      expect(adapter).not.toMatch(/process\.env\.MCP_(?:ACCESS_GRANT_TARGETS|ACCESS_GRANT_TARGET_NAME|ACCESS_GRANT_CANONICAL_RESOURCE|ACCESS_GRANT_LOOPBACK_HOSTS|SUPABASE_URL|SUPABASE_AUTH_ISSUER|SUPABASE_ANON_KEY|TEST_EMAIL|TEST_PASSWORD)/);
      expect(adapter).not.toMatch(/Date\.now\(\)|new Date\(\)/);
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

  it("keeps adapter-safe journey mechanics free of evidence conclusions", () => {
    const journey = source("e2e/mcp-access-grant-journey.ts");
    const adapters = [source("e2e/mcp-access-grant-public-client.ts"), source("e2e/mcp-access-grant-compatibility.ts")];

    expect(journey).not.toMatch(/mcp-access-grant-(?:evidence|policy)/);
    expect(journey).not.toMatch(/\b(?:GateAccumulator|GateStatus|classify|finalize|sanitizeText|sanitizeUrl)\b/);
    expect(journey).toMatch(/MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG/);
    expect(journey).toMatch(/export function (?:buildLoopbackUrls|buildPublicNativeClientMetadata|buildRegistrationNegativeCases|grantClientId|s256CodeChallenge)/);
    expect(journey).toMatch(/export function assertExactCanonicalResource/);
    for (const adapter of adapters) expect(adapter).toMatch(/mcp-access-grant-journey/);
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
