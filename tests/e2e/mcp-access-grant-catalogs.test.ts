// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_PROFILE,
  MCP_ACCESS_GRANT_CATALOGS,
  PUBLIC_CLIENT_PROFILE,
  classifyFactIdentity,
  classifyNegativeRegistration,
  expandProfileGateIds,
  validateMcpAccessGrantCatalogs,
  type CatalogValidationInput,
  type FactIdentityInput,
  type NegativeRegistrationObservation,
} from "../../e2e/mcp-access-grant-catalogs";

const PUBLIC_CLIENT_REQUIRED_GATE_IDS = [
  "resource-discovery",
  "provider-discovery",
  "public-client-registration-both",
  "registration-negative-validation-both",
  "untrusted-client-metadata-both",
  "authorization-consent-both",
  "consent-denial-both",
  "consent-abandonment-both",
  "consent-cleanup-both",
  "loopback-both",
  "loopback-request-both",
  "loopback-pkce-both",
  "delegated-token-validation-both",
  "authenticated-mcp-operation-both",
  "reproducible-configuration",
  "sanitized-evidence",
  "versions",
] as const;

const COMPATIBILITY_REQUIRED_GATE_IDS = [
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
] as const;

function cloneCatalogs(): CatalogValidationInput {
  return structuredClone(MCP_ACCESS_GRANT_CATALOGS) as CatalogValidationInput;
}

function negativeRegistration(
  overrides: Partial<NegativeRegistrationObservation>,
): NegativeRegistrationObservation {
  return {
    status: 400,
    errorCode: "invalid_client_metadata",
    credentialPresence: "absent",
    ...overrides,
  };
}

describe("Candidate 2 MCP evidence catalogs", () => {
  it("locks the public-client and compatibility profile contracts", () => {
    expect(PUBLIC_CLIENT_PROFILE.issue).toBe("#765");
    expect(COMPATIBILITY_PROFILE.issue).toBe("#768");
    expect(PUBLIC_CLIENT_PROFILE.artifactName).toBe("mcp-access-grant-evidence.json");
    expect(COMPATIBILITY_PROFILE.artifactName).toBe(PUBLIC_CLIENT_PROFILE.artifactName);
    expect(PUBLIC_CLIENT_PROFILE.requiredGateIds).toEqual(PUBLIC_CLIENT_REQUIRED_GATE_IDS);
    expect(COMPATIBILITY_PROFILE.requiredGateIds).toEqual(COMPATIBILITY_REQUIRED_GATE_IDS);
    expect(PUBLIC_CLIENT_PROFILE.gateCount).toBe(PUBLIC_CLIENT_REQUIRED_GATE_IDS.length);
    expect(COMPATIBILITY_PROFILE.gateCount).toBe(COMPATIBILITY_REQUIRED_GATE_IDS.length);
    expect(PUBLIC_CLIENT_PROFILE.outcomePrecedence).toEqual(["fail", "not-proven", "pass"]);
    expect(COMPATIBILITY_PROFILE.outcomePrecedence).toEqual(PUBLIC_CLIENT_PROFILE.outcomePrecedence);
    expect(PUBLIC_CLIENT_PROFILE.missingGateBehavior).toEqual({
      status: "not-proven",
      errorKind: "missing-observation",
    });
    expect(COMPATIBILITY_PROFILE.missingGateBehavior).toEqual(PUBLIC_CLIENT_PROFILE.missingGateBehavior);
    expect(PUBLIC_CLIENT_PROFILE.familyMetadata).toMatchObject({
      order: ["ipv4", "ipv6"],
      aggregate: "both",
    });
    expect(COMPATIBILITY_PROFILE.familyMetadata).toMatchObject({
      order: ["ipv4", "ipv6"],
      aggregate: "both",
    });
  });

  it("expands family aggregates into closed, ordered leaf and aggregate gates", () => {
    const publicGateIds = expandProfileGateIds(PUBLIC_CLIENT_PROFILE);

    expect(publicGateIds).toContain("public-client-registration-ipv4");
    expect(publicGateIds).toContain("public-client-registration-ipv6");
    expect(publicGateIds).toContain("public-client-registration-both");
    expect(publicGateIds).toContain("consent-cleanup-ipv4");
    expect(publicGateIds).toContain("consent-cleanup-ipv6");
    expect(publicGateIds).toContain("consent-cleanup-both");
    expect(new Set(publicGateIds).size).toBe(publicGateIds.length);
    expect(PUBLIC_CLIENT_PROFILE.expandedGateCount).toBe(publicGateIds.length);

    const compatibilityGateIds = expandProfileGateIds(COMPATIBILITY_PROFILE);
    expect(compatibilityGateIds).toContain("refresh-replay-containment");
    expect(compatibilityGateIds).toContain("public-client-registration-ipv4");
    expect(compatibilityGateIds).toContain("authenticated-mcp-operation-both");
    expect(new Set(compatibilityGateIds).size).toBe(compatibilityGateIds.length);
    expect(COMPATIBILITY_PROFILE.expandedGateCount).toBe(compatibilityGateIds.length);
  });

  it("validates every cross-reference, producer, ordering, and dependency", () => {
    const result = validateMcpAccessGrantCatalogs(MCP_ACCESS_GRANT_CATALOGS);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["unknown profile field", (catalogs: CatalogValidationInput) => {
      (catalogs.profiles.publicClient as unknown as Record<string, unknown>).unexpected = true;
    }, "profiles.publicClient.unexpected"],
    ["unknown gate", (catalogs: CatalogValidationInput) => {
      catalogs.gates["unknown-gate"] = catalogs.gates["resource-discovery"];
    }, "gates.unknown-gate"],
    ["unknown classifier reference", (catalogs: CatalogValidationInput) => {
      catalogs.gates["resource-discovery"].classifier = "missing-classifier";
    }, "classifier"],
    ["unknown classifier case", (catalogs: CatalogValidationInput) => {
      catalogs.classifiers["resource-discovery"].cases["made-up-case"] = {
        outcome: "pass",
        description: "made-up",
      };
    }, "cases ordering or identity"],
    ["unknown fact identity", (catalogs: CatalogValidationInput) => {
      catalogs.factIdentities.push({
        ...catalogs.factIdentities[0],
        role: "made-up-role",
      });
    }, "factIdentities"],
    ["unknown producer", (catalogs: CatalogValidationInput) => {
      (catalogs.gates["resource-discovery"].producerByProfile as Record<string, unknown>)["public-client"] = "made-up-producer";
    }, "producer"],
    ["unknown source policy identity", (catalogs: CatalogValidationInput) => {
      catalogs.sourcePolicies[0].kind = "made-up-kind" as never;
    }, "identity"],
    ["missing aggregate child", (catalogs: CatalogValidationInput) => {
      catalogs.aggregates["public-client-registration-both"].children.pop();
    }, "children"],
    ["gate order", (catalogs: CatalogValidationInput) => {
      (catalogs.profiles.publicClient as unknown as { requiredGateIds: string[] }).requiredGateIds = [...catalogs.profiles.publicClient.requiredGateIds].reverse();
    }, "ordering or identity"],
    ["dependency coverage", (catalogs: CatalogValidationInput) => {
      delete catalogs.dependencies["versions"];
    }, "cover every gate"],
    ["dependency cycle", (catalogs: CatalogValidationInput) => {
      catalogs.dependencies["resource-discovery"] = ["provider-discovery"];
      catalogs.dependencies["provider-discovery"] = ["resource-discovery"];
    }, "cycle"],
  ] as const)("rejects %s", (_name, mutate, expectedError) => {
    const catalogs = cloneCatalogs();
    mutate(catalogs);

    const result = validateMcpAccessGrantCatalogs(catalogs);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(expectedError);
  });

  it("keeps fact identities closed and source ownership explicit", () => {
    const publicRegistration: FactIdentityInput = {
      profile: "public-client",
      source: "public-client",
      kind: "registration",
      role: "primary",
      family: "ipv4",
    };
    expect(classifyFactIdentity(publicRegistration)).toEqual({
      accepted: true,
      authority: "authoritative",
    });

    const nestedDiscovery: FactIdentityInput = {
      profile: "compatibility",
      source: "public-client",
      kind: "resource-discovery",
      role: "shadow",
      family: "none",
    };
    expect(classifyFactIdentity(nestedDiscovery)).toEqual({
      accepted: true,
      authority: "shadow",
    });

    expect(classifyFactIdentity({
      profile: "compatibility",
      source: "compatibility",
      kind: "registration",
      role: "primary",
      family: "ipv4",
    })).toEqual({ accepted: false, authority: "rejected" });

    expect(classifyFactIdentity({
      profile: "public-client",
      source: "public-client",
      kind: "registration",
      role: "made-up-role",
      family: "ipv4",
    })).toEqual({ accepted: false, authority: "rejected" });

    expect(classifyFactIdentity({
      profile: "compatibility",
      source: "compatibility",
      kind: "loopback",
      role: "callback",
      family: "none",
    })).toEqual({ accepted: true, authority: "authoritative" });
    expect(classifyFactIdentity({
      profile: "compatibility",
      source: "compatibility",
      kind: "loopback",
      role: "callback",
      family: "ipv4",
    })).toEqual({ accepted: false, authority: "rejected" });
  });

  it("keeps live request recipes and decision cases bidirectionally equal", () => {
    expect(Object.keys(MCP_ACCESS_GRANT_CATALOGS.requestRecipes).sort()).toEqual(
      Object.keys(MCP_ACCESS_GRANT_CATALOGS.decisionCases).sort(),
    );
    expect(Object.keys(MCP_ACCESS_GRANT_CATALOGS.requestRecipes)).toContain(
      "public.registration.negative.unsafe-redirect-metadata",
    );
    expect(Object.keys(MCP_ACCESS_GRANT_CATALOGS.decisionCases)).toContain(
      "compatibility.refresh.replay",
    );
  });

  it("applies the security-first negative-registration matrix", () => {
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 400,
      errorCode: "invalid_client_metadata",
      credentialPresence: "absent",
    }))).toBe("pass");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 422,
      errorCode: "unsupported_grant_type",
      credentialPresence: "absent",
    }))).toBe("pass");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 400,
      errorCode: "invalid_client_metadata",
      credentialPresence: "present",
    }))).toBe("fail");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 400,
      errorCode: "invalid_client_metadata",
      credentialPresence: "unknown",
    }))).toBe("not-proven");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 201,
      errorCode: undefined,
      credentialPresence: "absent",
    }))).toBe("fail");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 503,
      errorCode: "invalid_client_metadata",
      credentialPresence: "absent",
    }))).toBe("not-proven");
    expect(classifyNegativeRegistration(negativeRegistration({
      status: 400,
      errorCode: "unknown_error",
      credentialPresence: "absent",
    }))).toBe("not-proven");
  });
});
