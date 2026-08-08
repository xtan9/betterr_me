/**
 * Candidate 2's machine-owned MCP evidence contract.
 *
 * This module is intentionally deterministic and has no live-runner imports.
 * It locks the two existing report entry profiles before the later migration
 * replaces their adapter-owned evidence mechanics.
 */

export type CatalogProfileName = "public-client" | "compatibility";
export type CatalogSourceName = "public-client" | "compatibility";
export type CatalogFamily = "none" | "ipv4" | "ipv6" | "both";
export type GateStatus = "pass" | "fail" | "not-proven";
export type CatalogAuthority = "authoritative" | "shadow" | "rejected";
export type CatalogProducer = "public-client" | "compatibility" | "kernel";
export type GateScope = "shared" | "direct" | "family" | "family-aggregate";
export type FactFamilyMode = "none" | "family";

export const MCP_ACCESS_GRANT_ARTIFACT_NAME = "mcp-access-grant-evidence.json" as const;
export const MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE = ["fail", "not-proven", "pass"] as const;
export const MCP_ACCESS_GRANT_FAMILIES = ["ipv4", "ipv6"] as const;
export const MCP_ACCESS_GRANT_LOOPBACK_HOSTS = {
  ipv4: "127.0.0.1",
  ipv6: "::1",
} as const;

export const PUBLIC_CLIENT_REQUIRED_GATE_IDS = [
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

export const COMPATIBILITY_REQUIRED_GATE_IDS = [
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

const PUBLIC_FAMILY_GATE_BASES = [
  "public-client-registration",
  "registration-negative-validation",
  "untrusted-client-metadata",
  "authorization-consent",
  "consent-denial",
  "consent-abandonment",
  "consent-cleanup",
  "loopback",
  "loopback-request",
  "loopback-pkce",
  "delegated-token-validation",
  "authenticated-mcp-operation",
] as const;

const PUBLIC_SHARED_GATE_IDS = [
  "resource-discovery",
  "provider-discovery",
  "reproducible-configuration",
  "sanitized-evidence",
  "versions",
] as const;

const PUBLIC_FAMILY_GATE_IDS = PUBLIC_FAMILY_GATE_BASES.flatMap((base) =>
  MCP_ACCESS_GRANT_FAMILIES.map((family) => `${base}-${family}`),
);

const PUBLIC_FAMILY_AGGREGATE_GATE_IDS = PUBLIC_FAMILY_GATE_BASES.map((base) => `${base}-both`);

const PUBLIC_EXPANDED_GATE_IDS = [
  ...PUBLIC_CLIENT_REQUIRED_GATE_IDS,
  ...PUBLIC_FAMILY_GATE_IDS,
] as const;

const COMPATIBILITY_NESTED_PUBLIC_GATE_IDS = [
  ...PUBLIC_FAMILY_GATE_IDS,
  ...PUBLIC_FAMILY_AGGREGATE_GATE_IDS,
] as const;

const COMPATIBILITY_EXPANDED_GATE_IDS = [
  ...COMPATIBILITY_REQUIRED_GATE_IDS,
  ...COMPATIBILITY_NESTED_PUBLIC_GATE_IDS,
] as const;

const PUBLIC_FAMILY_FACT_KINDS = [
  "registration",
  "consent",
  "authorization",
  "loopback",
  "pkce",
  "delegated-token",
  "mcp-operation",
  "grant",
  "cleanup",
] as const;

const COMPATIBILITY_FACT_KINDS = [
  "registration",
  "authorization",
  "loopback",
  "pkce",
  "resource-binding",
  "delegated-token",
  "mcp-operation",
  "refresh",
  "grant",
  "post-revocation",
  "cleanup",
] as const;

const SHARED_FACT_KINDS = [
  "resource-discovery",
  "provider-discovery",
  "configuration",
  "versions",
  "sanitized-evidence",
] as const;

const FACT_KINDS = [
  ...SHARED_FACT_KINDS,
  ...PUBLIC_FAMILY_FACT_KINDS,
  ...COMPATIBILITY_FACT_KINDS.filter((kind) => !(PUBLIC_FAMILY_FACT_KINDS as readonly string[]).includes(kind)),
] as const;

export type CatalogFactKind = (typeof FACT_KINDS)[number];

const FACT_ROLE_CATALOG: Record<CatalogFactKind, readonly string[]> = {
  "resource-discovery": ["primary", "shadow"],
  "provider-discovery": ["primary", "shadow"],
  configuration: ["snapshot"],
  versions: ["snapshot"],
  "sanitized-evidence": ["verification"],
  registration: ["primary", "negative"],
  consent: ["metadata"],
  authorization: ["primary", "approval", "denial", "abandonment"],
  loopback: ["callback", "request"],
  pkce: ["exchange", "positive", "negative"],
  "delegated-token": ["validation", "negative"],
  "mcp-operation": ["authenticated"],
  grant: ["cleanup", "identify", "revoke"],
  cleanup: ["family", "final"],
  "resource-binding": ["negative"],
  refresh: ["root", "replacement", "replay"],
  "post-revocation": ["refresh", "access"],
};

export interface FamilyMetadata {
  order: readonly (typeof MCP_ACCESS_GRANT_FAMILIES[number])[];
  aggregate: "both";
  loopbackHosts: Readonly<typeof MCP_ACCESS_GRANT_LOOPBACK_HOSTS>;
}

export interface ConfigurationRules {
  requiredTargetFields: readonly ["canonicalResource", "supabaseUrl", "expectedAuthorizationServer"];
  acceptedSchemes: readonly ["http", "https"];
  nonProductionAcknowledgementEnv: "MCP_ACCESS_GRANT_NON_PRODUCTION_ACK";
  nonProductionAcknowledgementValue: "true";
  credentialSource: "environment-only";
  loopbackHosts: readonly (typeof MCP_ACCESS_GRANT_LOOPBACK_HOSTS[keyof typeof MCP_ACCESS_GRANT_LOOPBACK_HOSTS])[];
}

export interface VersionRules {
  requiredKeys: readonly string[];
  optionalKeys: readonly string[];
  unavailableValue: "unavailable";
  sentinels: Readonly<Record<string, string>>;
  missingGateStatus: "not-proven";
}

export interface SharedOwnership {
  sharedGateIds: readonly string[];
  authorityByGate: Readonly<Record<string, CatalogProducer>>;
  nestedDiscoverySource: "public-client";
  nestedDiscoveryAuthority: "shadow";
}

export interface MissingGateBehavior {
  status: "not-proven";
  errorKind: "missing-observation";
}

export interface ProfileCatalog {
  name: CatalogProfileName;
  issue: "#765" | "#768";
  artifactName: typeof MCP_ACCESS_GRANT_ARTIFACT_NAME;
  requiredGateIds: readonly string[];
  expandedGateIds: readonly string[];
  gateCount: number;
  expandedGateCount: number;
  outcomePrecedence: readonly GateStatus[];
  missingGateBehavior: MissingGateBehavior;
  familyMetadata: FamilyMetadata;
  configurationRules: ConfigurationRules;
  versionRules: VersionRules;
  sharedOwnership: SharedOwnership;
  reachabilityRoots: readonly string[];
}

export interface GateDefinition {
  id: string;
  profiles: readonly CatalogProfileName[];
  scope: GateScope;
  family: CatalogFamily;
  producerByProfile: Partial<Record<CatalogProfileName, CatalogProducer>>;
  factKinds: readonly CatalogFactKind[];
  classifier: string;
  templateFamily: string;
  evidenceProjection: string;
}

export interface AggregateDefinition {
  id: string;
  profiles: readonly CatalogProfileName[];
  family: "both";
  children: string[];
  precedence: readonly GateStatus[];
}

export interface ClassifierCase {
  outcome: GateStatus;
  description: string;
}

export interface ClassifierDefinition {
  id: string;
  cases: Record<string, ClassifierCase>;
}

export interface TemplateDefinition {
  id: string;
  cases: string[];
  text: Record<GateStatus, string>;
}

export interface ProjectionDefinition {
  id: string;
  allowedKeys: string[];
  requiredKeys: string[];
}

export interface FactIdentityDefinition {
  profile: CatalogProfileName;
  source: CatalogSourceName;
  kind: CatalogFactKind;
  role: string;
  family: CatalogFamily;
  authority: CatalogAuthority;
  gateId: string;
}

export interface SourcePolicyDefinition {
  profile: CatalogProfileName;
  source: CatalogSourceName;
  kind: CatalogFactKind;
  authority: CatalogAuthority;
  familyMode: FactFamilyMode;
  roles: string[];
}

export interface FactIdentityInput {
  profile: CatalogProfileName;
  source: CatalogSourceName;
  kind: CatalogFactKind;
  role: string;
  family: CatalogFamily;
}

export interface RequestRecipeDefinition {
  profile: CatalogProfileName;
  source: CatalogSourceName;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "CALLBACK";
  operation: string;
  decisionKey: string;
}

export interface DecisionCaseDefinition {
  profile: CatalogProfileName;
  source: CatalogSourceName;
  recipeKey: string;
  classifier: string;
  templateFamily: string;
  evidenceProjection: string;
}

export interface CatalogValidationInput {
  profiles: {
    publicClient: ProfileCatalog;
    compatibility: ProfileCatalog;
  };
  gates: Record<string, GateDefinition>;
  aggregates: Record<string, AggregateDefinition>;
  dependencies: Record<string, string[]>;
  classifiers: Record<string, ClassifierDefinition>;
  templates: Record<string, TemplateDefinition>;
  projections: Record<string, ProjectionDefinition>;
  factIdentities: FactIdentityDefinition[];
  sourcePolicies: SourcePolicyDefinition[];
  requestRecipes: Record<string, RequestRecipeDefinition>;
  decisionCases: Record<string, DecisionCaseDefinition>;
}

export interface CatalogValidationResult {
  valid: boolean;
  errors: string[];
}

export interface NegativeRegistrationObservation {
  status: number | undefined;
  errorCode: string | undefined;
  credentialPresence: "present" | "absent" | "unknown";
}

const PROFILE_NAMES: readonly CatalogProfileName[] = ["public-client", "compatibility"];
const SOURCE_NAMES: readonly CatalogSourceName[] = ["public-client", "compatibility"];
const PRODUCERS: readonly CatalogProducer[] = ["public-client", "compatibility", "kernel"];
const GATE_STATUSES: readonly GateStatus[] = ["pass", "fail", "not-proven"];

const CLASSIFIER_CASES: Record<string, Record<string, GateStatus>> = {
  "resource-discovery": {
    "resource-and-provider-match": "pass",
    "resource-mismatch": "fail",
    unavailable: "not-proven",
  },
  "provider-discovery": {
    "golden-path-metadata": "pass",
    "issuer-or-capability-mismatch": "fail",
    unavailable: "not-proven",
  },
  configuration: {
    "valid-local-target": "pass",
    "valid-hosted-target-with-acknowledgement": "pass",
    "invalid-target": "not-proven",
    "missing-non-production-acknowledgement": "not-proven",
  },
  sanitization: {
    sanitized: "pass",
    "credential-leak": "fail",
    "verification-unavailable": "not-proven",
  },
  versions: {
    complete: "pass",
    unavailable: "not-proven",
  },
  "public-registration": {
    "accepted-public-native-profile": "pass",
    "returned-profile-mismatch": "fail",
    unavailable: "not-proven",
  },
  "negative-registration": {
    "credentials-present": "fail",
    "success-2xx": "fail",
    "recognized-400-metadata-error-without-credentials": "pass",
    "recognized-422-metadata-error-without-credentials": "pass",
    "other-response": "not-proven",
  },
  "consent-presentation": {
    "untrusted-complete": "pass",
    "missing-untrusted-field": "fail",
    endorsement: "fail",
    unavailable: "not-proven",
  },
  "authorization-consent": {
    "affirmative-and-distinct": "pass",
    "missing-affirmative-or-distinct-decision": "fail",
    unavailable: "not-proven",
  },
  "authorization-outcome": {
    "denial-without-credentials": "pass",
    "abandonment-without-callback": "pass",
    "unexpected-callback-or-credential": "fail",
    unavailable: "not-proven",
  },
  cleanup: {
    "grant-absent": "pass",
    "grant-present": "fail",
    unavailable: "not-proven",
  },
  "loopback-callback": {
    "callback-reached-registered-family": "pass",
    "callback-mismatch": "fail",
    unavailable: "not-proven",
  },
  "loopback-request": {
    "registered-host-request-time-port": "pass",
    "request-binding-mismatch": "fail",
    unavailable: "not-proven",
  },
  pkce: {
    "s256-exact-match": "pass",
    "wrong-method-or-verifier": "fail",
    unavailable: "not-proven",
  },
  "delegated-token": {
    "signature-and-context-valid": "pass",
    "signature-or-context-invalid": "fail",
    unavailable: "not-proven",
  },
  "mcp-operation": {
    authorized: "pass",
    rejected: "fail",
    unavailable: "not-proven",
  },
  "compatibility-registration": {
    "registration-observed": "pass",
    "registration-rejected": "fail",
    unavailable: "not-proven",
  },
  "compatibility-authorization": {
    "authorization-boundary-proven": "pass",
    "authorization-boundary-failed": "fail",
    unavailable: "not-proven",
  },
  "compatibility-pkce": {
    "s256-resource-bound-exchange": "pass",
    "pkce-or-resource-mismatch": "fail",
    unavailable: "not-proven",
  },
  "negative-proof": {
    "all-negative-cases-rejected": "pass",
    "negative-case-authorized": "fail",
    unavailable: "not-proven",
  },
  "resource-negative": {
    "all-invalid-resources-rejected": "pass",
    "invalid-resource-authorized": "fail",
    unavailable: "not-proven",
  },
  "compatibility-token-validation": {
    "locally-verified": "pass",
    "verification-failed": "fail",
    unavailable: "not-proven",
  },
  "compatibility-mcp-operation": {
    authorized: "pass",
    rejected: "fail",
    unavailable: "not-proven",
  },
  "refresh-rotation": {
    "complete-credential-replacement": "pass",
    "incomplete-credential-replacement": "fail",
    unavailable: "not-proven",
  },
  "refresh-replay": {
    "all-consumed-and-descendant-tokens-rejected": "pass",
    "replay-or-descendant-authorized": "fail",
    unavailable: "not-proven",
  },
  "grant-revocation": {
    "grant-identified-and-revoked": "pass",
    "grant-missing-or-revocation-failed": "fail",
    unavailable: "not-proven",
  },
  "post-revocation-refresh": {
    "replacement-not-issued": "pass",
    "replacement-issued": "fail",
    unavailable: "not-proven",
  },
  "post-revocation-access": {
    "access-rejected-or-within-documented-lifetime": "pass",
    "access-effective-beyond-documented-lifetime": "fail",
    unavailable: "not-proven",
  },
  "family-aggregate": {
    "all-families-pass": "pass",
    "one-or-more-families-not-proven": "not-proven",
    "one-or-more-families-fail": "fail",
  },
};

function makeClassifiers(): Record<string, ClassifierDefinition> {
  return Object.fromEntries(
    Object.entries(CLASSIFIER_CASES).map(([id, cases]) => [
      id,
      {
        id,
        cases: Object.fromEntries(
          Object.entries(cases).map(([caseId, outcome]) => [caseId, {
            outcome,
            description: `${id}:${caseId}`,
          }]),
        ),
      },
    ]),
  ) as Record<string, ClassifierDefinition>;
}

const PROJECTION_FIELDS: Record<string, string[]> = {
  "resource-discovery": ["resourceMatches", "advertisedResource", "advertisedAuthorizationServer", "expectedAuthorizationServer"],
  "provider-discovery": ["issuerMatches", "authorizationEndpoint", "registrationEndpoint", "tokenEndpoint", "jwksUri"],
  configuration: ["canonicalResource", "supabaseUrl", "expectedAuthorizationServer", "loopbackHosts", "hasProviderCredentials"],
  sanitization: ["sanitized", "errorKind", "attempt"],
  versions: ["versions", "missingKeys", "sentinel"],
  "public-registration": ["registrationStatus", "registrationRedirectUri", "clientIdPresent", "clientSecretReturned", "registeredGrantTypes"],
  "negative-registration": ["case", "status", "errorCode", "credentialPresence", "responseCredentialFields"],
  "consent-presentation": ["clientNameVisible", "clientUriVisible", "logoVisible", "softwareIdVisible", "softwareVersionVisible", "untrustedDisclaimerVisible"],
  "authorization-consent": ["affirmativeControlVisible", "denialControlVisible", "callbackBeforeDecision", "decision"],
  "authorization-outcome": ["callbackReceived", "stateMatches", "authorizationError", "authorizationCodePresent", "accessTokenObserved", "refreshTokenObserved"],
  cleanup: ["grantStatus", "grantIdentified", "grantRevoked", "requestStatus"],
  "loopback-callback": ["family", "callbackHost", "callbackPath", "callbackReceived"],
  "loopback-request": ["family", "registrationRedirectUri", "requestTimeCallbackUrl", "portSelectedAtRequest", "resource"],
  pkce: ["method", "codeChallengePresent", "codeVerifierMatchesChallenge", "resourceMatchesCanonical"],
  "delegated-token": ["signatureValid", "algorithmAllowed", "issuerMatches", "audienceMatches", "clientContextMatches", "grantContextMatches", "timeBoundsValid"],
  "mcp-operation": ["operationUrl", "operationResourceMatches", "resultIsError", "requestStatus"],
  "compatibility-registration": ["registrationObserved", "registrationStatus", "requestStatus", "clientIdPresent"],
  "compatibility-authorization": ["authorizationRequestObserved", "callbackReceived", "stateMatches", "credentialPresence"],
  "compatibility-pkce": ["requestResource", "redirectUri", "codeChallengeMethod", "codeVerifierMatchesChallenge"],
  "negative-proof": ["cases", "rejectedCount", "authorizedCount", "requestStatuses"],
  "resource-negative": ["cases", "resourceValues", "rejectedCount", "authorizedCount"],
  "compatibility-token-validation": ["jwksFetched", "jwksKeyMatched", "signatureValid", "failures", "checks"],
  "compatibility-mcp-operation": ["operationUrl", "operationResourceMatches", "resultIsError", "requestStatus"],
  "refresh-rotation": ["initial", "firstReplacement", "secondReplacement", "replacementOperation"],
  "refresh-replay": ["rootReplayDetected", "everyIssuedDescendantRejected", "familyMemberCountExercised", "familyResults"],
  "grant-revocation": ["grantIdentified", "grantRevoked", "grantCount", "requestStatus"],
  "post-revocation-refresh": ["requestStatus", "replacementCredentialsStored", "errorCode"],
  "post-revocation-access": ["operationStatus", "accessTokenHasExpiry", "withinDocumentedLifetime", "secondsRemaining"],
  "family-aggregate": ["families", "childStatuses", "failureCount", "notProvenCount"],
};

function makeTemplates(classifiers: Record<string, ClassifierDefinition>): Record<string, TemplateDefinition> {
  return Object.fromEntries(
    Object.entries(classifiers).map(([id, classifier]) => [
      id,
      {
        id,
        cases: Object.keys(classifier.cases),
        text: {
          pass: `${id}: proven`,
          fail: `${id}: failed closed`,
          "not-proven": `${id}: not proven`,
        },
      },
    ]),
  ) as Record<string, TemplateDefinition>;
}

function makeProjections(classifiers: Record<string, ClassifierDefinition>): Record<string, ProjectionDefinition> {
  return Object.fromEntries(
    Object.keys(classifiers).map((id) => [
      id,
      {
        id,
        allowedKeys: [...(PROJECTION_FIELDS[id] ?? ["status", "detail"])],
        requiredKeys: [],
      },
    ]),
  ) as Record<string, ProjectionDefinition>;
}

function addGate(
  gates: Record<string, GateDefinition>,
  definition: GateDefinition,
): void {
  if (gates[definition.id]) throw new Error(`Duplicate MCP evidence gate: ${definition.id}`);
  gates[definition.id] = definition;
}

function gateDefinition(
  id: string,
  profiles: readonly CatalogProfileName[],
  scope: GateScope,
  family: CatalogFamily,
  producerByProfile: Partial<Record<CatalogProfileName, CatalogProducer>>,
  factKinds: readonly CatalogFactKind[],
  classifier: string,
): GateDefinition {
  return {
    id,
    profiles: [...profiles],
    scope,
    family,
    producerByProfile: { ...producerByProfile },
    factKinds: [...factKinds],
    classifier,
    templateFamily: classifier,
    evidenceProjection: classifier,
  };
}

function makeGates(): Record<string, GateDefinition> {
  const gates: Record<string, GateDefinition> = {};
  const bothProfiles: CatalogProfileName[] = ["public-client", "compatibility"];

  addGate(gates, gateDefinition(
    "resource-discovery",
    bothProfiles,
    "shared",
    "none",
    { "public-client": "public-client", compatibility: "compatibility" },
    ["resource-discovery"],
    "resource-discovery",
  ));
  addGate(gates, gateDefinition(
    "provider-discovery",
    bothProfiles,
    "shared",
    "none",
    { "public-client": "public-client", compatibility: "compatibility" },
    ["provider-discovery"],
    "provider-discovery",
  ));
  addGate(gates, gateDefinition(
    "reproducible-configuration",
    bothProfiles,
    "shared",
    "none",
    { "public-client": "public-client", compatibility: "compatibility" },
    ["configuration"],
    "configuration",
  ));
  addGate(gates, gateDefinition(
    "sanitized-evidence",
    bothProfiles,
    "shared",
    "none",
    { "public-client": "kernel", compatibility: "kernel" },
    ["sanitized-evidence"],
    "sanitization",
  ));
  addGate(gates, gateDefinition(
    "versions",
    bothProfiles,
    "shared",
    "none",
    { "public-client": "public-client", compatibility: "compatibility" },
    ["versions"],
    "versions",
  ));

  const publicFamilyClassifiers: Record<string, string> = {
    "public-client-registration": "public-registration",
    "registration-negative-validation": "negative-registration",
    "untrusted-client-metadata": "consent-presentation",
    "authorization-consent": "authorization-consent",
    "consent-denial": "authorization-outcome",
    "consent-abandonment": "authorization-outcome",
    "consent-cleanup": "cleanup",
    loopback: "loopback-callback",
    "loopback-request": "loopback-request",
    "loopback-pkce": "pkce",
    "delegated-token-validation": "delegated-token",
    "authenticated-mcp-operation": "mcp-operation",
  };

  for (const base of PUBLIC_FAMILY_GATE_BASES) {
    const factKind: CatalogFactKind = base === "untrusted-client-metadata"
      ? "consent"
      : base === "consent-denial" || base === "consent-abandonment" || base === "authorization-consent"
        ? "authorization"
        : base === "consent-cleanup"
          ? "cleanup"
          : base === "loopback" || base === "loopback-request"
            ? "loopback"
            : base === "loopback-pkce"
              ? "pkce"
              : base === "delegated-token-validation"
                ? "delegated-token"
                : base === "authenticated-mcp-operation"
                  ? "mcp-operation"
                  : "registration";
    for (const family of MCP_ACCESS_GRANT_FAMILIES) {
      addGate(gates, gateDefinition(
        `${base}-${family}`,
        bothProfiles,
        "family",
        family,
        { "public-client": "public-client", compatibility: "public-client" },
        [factKind, ...(base === "consent-cleanup" ? ["grant" as CatalogFactKind] : [])],
        publicFamilyClassifiers[base],
      ));
    }
    addGate(gates, gateDefinition(
      `${base}-both`,
      bothProfiles,
      "family-aggregate",
      "both",
      { "public-client": "kernel", compatibility: "kernel" },
      [factKind, ...(base === "consent-cleanup" ? ["grant" as CatalogFactKind] : [])],
      "family-aggregate",
    ));
  }

  const compatibilityDirect: Record<string, { classifier: string; factKinds: CatalogFactKind[] }> = {
    "public-client-registration": { classifier: "compatibility-registration", factKinds: ["registration"] },
    "authorization-consent": { classifier: "compatibility-authorization", factKinds: ["authorization"] },
    "loopback-pkce": { classifier: "compatibility-pkce", factKinds: ["loopback", "pkce"] },
    "pkce-negative-proof": { classifier: "negative-proof", factKinds: ["pkce"] },
    "resource-binding-negative": { classifier: "resource-negative", factKinds: ["resource-binding"] },
    "delegated-token-validation": { classifier: "compatibility-token-validation", factKinds: ["delegated-token"] },
    "delegated-token-negative-boundary": { classifier: "negative-proof", factKinds: ["delegated-token"] },
    "authenticated-mcp-operation": { classifier: "compatibility-mcp-operation", factKinds: ["mcp-operation"] },
    "refresh-rotation": { classifier: "refresh-rotation", factKinds: ["refresh"] },
    "refresh-replay-containment": { classifier: "refresh-replay", factKinds: ["refresh"] },
    "grant-identification-revocation": { classifier: "grant-revocation", factKinds: ["grant"] },
    "post-revocation-refresh": { classifier: "post-revocation-refresh", factKinds: ["post-revocation"] },
    "post-revocation-access": { classifier: "post-revocation-access", factKinds: ["post-revocation"] },
    cleanup: { classifier: "cleanup", factKinds: ["cleanup"] },
  };
  for (const [id, definition] of Object.entries(compatibilityDirect)) {
    addGate(gates, gateDefinition(
      id,
      ["compatibility"],
      "direct",
      "none",
      { compatibility: "compatibility" },
      definition.factKinds,
      definition.classifier,
    ));
  }

  return gates;
}

function makeAggregates(): Record<string, AggregateDefinition> {
  return Object.fromEntries(
    PUBLIC_FAMILY_GATE_BASES.map((base) => {
      const id = `${base}-both`;
      return [id, {
        id,
        profiles: ["public-client", "compatibility"],
        family: "both",
        children: MCP_ACCESS_GRANT_FAMILIES.map((family) => `${base}-${family}`),
        precedence: [...MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE],
      }];
    }),
  ) as Record<string, AggregateDefinition>;
}

function configurationRules(): ConfigurationRules {
  return {
    requiredTargetFields: ["canonicalResource", "supabaseUrl", "expectedAuthorizationServer"],
    acceptedSchemes: ["http", "https"],
    nonProductionAcknowledgementEnv: "MCP_ACCESS_GRANT_NON_PRODUCTION_ACK",
    nonProductionAcknowledgementValue: "true",
    credentialSource: "environment-only",
    loopbackHosts: [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6],
  };
}

function versionRules(profile: CatalogProfileName): VersionRules {
  return {
    requiredKeys: [
      "supabase-cli",
      "@modelcontextprotocol/sdk",
      "@playwright/test",
      "@supabase/supabase-js",
      "mcp-handler",
      "supabase-auth-provider-image",
    ],
    optionalKeys: profile === "compatibility"
      ? ["declared-sdk-range", "supabase-hosted-provider-version"]
      : ["declared-sdk-range"],
    unavailableValue: "unavailable",
    sentinels: {
      "supabase-auth-provider-image": "not-applicable",
      "supabase-hosted-provider-version": "not-publicly-exposed",
    },
    missingGateStatus: "not-proven",
  };
}

function sharedOwnership(owner: CatalogProducer): SharedOwnership {
  return {
    sharedGateIds: [...PUBLIC_SHARED_GATE_IDS],
    authorityByGate: Object.fromEntries(PUBLIC_SHARED_GATE_IDS.map((id) => [id, owner])),
    nestedDiscoverySource: "public-client",
    nestedDiscoveryAuthority: "shadow",
  };
}

function makeProfiles(): CatalogValidationInput["profiles"] {
  const familyMetadata: FamilyMetadata = {
    order: [...MCP_ACCESS_GRANT_FAMILIES],
    aggregate: "both",
    loopbackHosts: { ...MCP_ACCESS_GRANT_LOOPBACK_HOSTS },
  };
  const missingGateBehavior: MissingGateBehavior = {
    status: "not-proven",
    errorKind: "missing-observation",
  };
  return {
    publicClient: {
      name: "public-client",
      issue: "#765",
      artifactName: MCP_ACCESS_GRANT_ARTIFACT_NAME,
      requiredGateIds: [...PUBLIC_CLIENT_REQUIRED_GATE_IDS],
      expandedGateIds: [...PUBLIC_EXPANDED_GATE_IDS],
      gateCount: PUBLIC_CLIENT_REQUIRED_GATE_IDS.length,
      expandedGateCount: PUBLIC_EXPANDED_GATE_IDS.length,
      outcomePrecedence: [...MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE],
      missingGateBehavior: { ...missingGateBehavior },
      familyMetadata,
      configurationRules: configurationRules(),
      versionRules: versionRules("public-client"),
      sharedOwnership: sharedOwnership("public-client"),
      reachabilityRoots: [...PUBLIC_CLIENT_REQUIRED_GATE_IDS],
    },
    compatibility: {
      name: "compatibility",
      issue: "#768",
      artifactName: MCP_ACCESS_GRANT_ARTIFACT_NAME,
      requiredGateIds: [...COMPATIBILITY_REQUIRED_GATE_IDS],
      expandedGateIds: [...COMPATIBILITY_EXPANDED_GATE_IDS],
      gateCount: COMPATIBILITY_REQUIRED_GATE_IDS.length,
      expandedGateCount: COMPATIBILITY_EXPANDED_GATE_IDS.length,
      outcomePrecedence: [...MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE],
      missingGateBehavior: { ...missingGateBehavior },
      familyMetadata,
      configurationRules: configurationRules(),
      versionRules: versionRules("compatibility"),
      sharedOwnership: sharedOwnership("compatibility"),
      reachabilityRoots: [
        ...COMPATIBILITY_REQUIRED_GATE_IDS,
        ...PUBLIC_FAMILY_AGGREGATE_GATE_IDS,
      ],
    },
  };
}

function makeDependencies(gates: Record<string, GateDefinition>, aggregates: Record<string, AggregateDefinition>): Record<string, string[]> {
  const dependencies: Record<string, string[]> = Object.fromEntries(Object.keys(gates).map((id) => [id, []]));
  const addDependency = (id: string, ...dependencyIds: string[]) => {
    dependencies[id] = [...new Set([...(dependencies[id] ?? []), ...dependencyIds])];
  };

  addDependency("provider-discovery", "resource-discovery");

  const publicPrerequisites: Record<string, string[]> = {
    "public-client-registration": ["provider-discovery"],
    "registration-negative-validation": ["provider-discovery"],
    "untrusted-client-metadata": ["public-client-registration"],
    "authorization-consent": ["untrusted-client-metadata"],
    "consent-denial": ["untrusted-client-metadata"],
    "consent-abandonment": ["untrusted-client-metadata"],
    "consent-cleanup": ["delegated-token-validation"],
    loopback: ["public-client-registration"],
    "loopback-request": ["loopback"],
    "loopback-pkce": ["loopback-request"],
    "delegated-token-validation": ["loopback-pkce"],
    "authenticated-mcp-operation": ["delegated-token-validation"],
  };
  for (const [base, prerequisiteBases] of Object.entries(publicPrerequisites)) {
    for (const family of MCP_ACCESS_GRANT_FAMILIES) {
      addDependency(
        `${base}-${family}`,
        ...prerequisiteBases.map((prerequisite) => gates[`${prerequisite}-${family}`] ? `${prerequisite}-${family}` : prerequisite),
      );
    }
  }

  for (const aggregate of Object.values(aggregates)) {
    addDependency(aggregate.id, ...aggregate.children);
  }

  const compatibilityPrerequisites: Record<string, string[]> = {
    "public-client-registration": ["provider-discovery"],
    "authorization-consent": ["public-client-registration"],
    "loopback-pkce": ["authorization-consent"],
    "pkce-negative-proof": ["loopback-pkce"],
    "resource-binding-negative": ["loopback-pkce"],
    "delegated-token-validation": ["loopback-pkce"],
    "delegated-token-negative-boundary": ["delegated-token-validation"],
    "authenticated-mcp-operation": ["delegated-token-validation"],
    "refresh-rotation": ["authenticated-mcp-operation"],
    "refresh-replay-containment": ["refresh-rotation"],
    "grant-identification-revocation": ["refresh-rotation"],
    "post-revocation-refresh": ["grant-identification-revocation"],
    "post-revocation-access": ["grant-identification-revocation"],
    cleanup: ["grant-identification-revocation"],
  };
  for (const [id, prerequisiteIds] of Object.entries(compatibilityPrerequisites)) {
    addDependency(id, ...prerequisiteIds);
  }

  return dependencies;
}

function sourcePolicy(
  profile: CatalogProfileName,
  source: CatalogSourceName,
  kind: CatalogFactKind,
): SourcePolicyDefinition {
  const publicSource = source === "public-client";
  const publicProfile = profile === "public-client";
  const publicFamilyKind = (PUBLIC_FAMILY_FACT_KINDS as readonly string[]).includes(kind);
  const compatibilityKind = (COMPATIBILITY_FACT_KINDS as readonly string[]).includes(kind);
  const sharedKind = (SHARED_FACT_KINDS as readonly string[]).includes(kind);

  if (publicProfile && !publicSource) {
    return { profile, source, kind, authority: "rejected", familyMode: "none", roles: [] };
  }
  if (publicProfile && publicSource) {
    if (sharedKind) {
      return {
        profile,
        source,
        kind,
        authority: "authoritative",
        familyMode: "none",
        roles: kind === "resource-discovery" || kind === "provider-discovery" ? ["primary"] : FACT_ROLE_CATALOG[kind].slice(0, 1),
      };
    }
    if (publicFamilyKind) {
      const rolesByKind: Partial<Record<CatalogFactKind, string[]>> = {
        registration: ["primary", "negative"],
        consent: ["metadata"],
        authorization: ["approval", "denial", "abandonment"],
        loopback: ["callback", "request"],
        pkce: ["exchange"],
        "delegated-token": ["validation"],
        "mcp-operation": ["authenticated"],
        grant: ["cleanup"],
        cleanup: ["family"],
      };
      return { profile, source, kind, authority: "authoritative", familyMode: "family", roles: rolesByKind[kind] ?? [] };
    }
    return { profile, source, kind, authority: "rejected", familyMode: "none", roles: [] };
  }

  if (publicSource) {
    if (kind === "resource-discovery" || kind === "provider-discovery") {
      return { profile, source, kind, authority: "shadow", familyMode: "none", roles: ["shadow"] };
    }
    if (publicFamilyKind) {
      const publicRoles = sourcePolicy("public-client", "public-client", kind).roles;
      return { profile, source, kind, authority: "authoritative", familyMode: "family", roles: publicRoles };
    }
    return { profile, source, kind, authority: "rejected", familyMode: "none", roles: [] };
  }

  if (sharedKind || compatibilityKind) {
    const rolesByKind: Partial<Record<CatalogFactKind, string[]>> = {
      "resource-discovery": ["primary"],
      "provider-discovery": ["primary"],
      configuration: ["snapshot"],
      versions: ["snapshot"],
      "sanitized-evidence": ["verification"],
      registration: ["primary"],
      authorization: ["primary"],
      loopback: ["callback", "request"],
      pkce: ["positive", "negative"],
      "resource-binding": ["negative"],
      "delegated-token": ["validation", "negative"],
      "mcp-operation": ["authenticated"],
      refresh: ["root", "replacement", "replay"],
      grant: ["identify", "revoke"],
      "post-revocation": ["refresh", "access"],
      cleanup: ["final"],
    };
    return {
      profile,
      source,
      kind,
      authority: "authoritative",
      familyMode: "none",
      roles: rolesByKind[kind] ?? [],
    };
  }

  return { profile, source, kind, authority: "rejected", familyMode: "none", roles: [] };
}

function makeSourcePolicies(): SourcePolicyDefinition[] {
  return PROFILE_NAMES.flatMap((profile) =>
    SOURCE_NAMES.flatMap((source) =>
      FACT_KINDS.map((kind) => sourcePolicy(profile, source, kind)),
    ),
  );
}

function factGateId(
  profile: CatalogProfileName,
  source: CatalogSourceName,
  kind: CatalogFactKind,
  role: string,
  family: CatalogFamily,
): string {
  if (family !== "none") {
    const publicBaseByFact: Partial<Record<CatalogFactKind, string>> = {
      registration: role === "negative" ? "registration-negative-validation" : "public-client-registration",
      consent: "untrusted-client-metadata",
      authorization: role === "denial" ? "consent-denial" : role === "abandonment" ? "consent-abandonment" : "authorization-consent",
      loopback: role === "request" ? "loopback-request" : "loopback",
      pkce: "loopback-pkce",
      "delegated-token": "delegated-token-validation",
      "mcp-operation": "authenticated-mcp-operation",
      grant: "consent-cleanup",
      cleanup: "consent-cleanup",
    };
    const base = publicBaseByFact[kind];
    if (!base) return "";
    return `${base}-${family}`;
  }

  if (kind === "resource-discovery" || kind === "provider-discovery" || kind === "configuration" || kind === "versions" || kind === "sanitized-evidence") {
    return kind === "configuration" ? "reproducible-configuration" : kind;
  }
  if (source === "public-client" && profile === "compatibility") return "";

  const compatibilityGateByFact: Partial<Record<CatalogFactKind, string>> = {
    registration: "public-client-registration",
    authorization: "authorization-consent",
    loopback: "loopback-pkce",
    pkce: role === "negative" ? "pkce-negative-proof" : "loopback-pkce",
    "resource-binding": "resource-binding-negative",
    "delegated-token": role === "negative" ? "delegated-token-negative-boundary" : "delegated-token-validation",
    "mcp-operation": "authenticated-mcp-operation",
    refresh: role === "replay" ? "refresh-replay-containment" : "refresh-rotation",
    grant: "grant-identification-revocation",
    "post-revocation": role === "refresh" ? "post-revocation-refresh" : "post-revocation-access",
    cleanup: "cleanup",
  };
  return compatibilityGateByFact[kind] ?? "";
}

function makeFactIdentities(sourcePolicies: SourcePolicyDefinition, profiles: CatalogValidationInput["profiles"], gates: Record<string, GateDefinition>): FactIdentityDefinition[];
function makeFactIdentities(sourcePolicies: SourcePolicyDefinition[], profiles: CatalogValidationInput["profiles"], gates: Record<string, GateDefinition>): FactIdentityDefinition[];
function makeFactIdentities(sourcePolicies: SourcePolicyDefinition[] | SourcePolicyDefinition, profiles: CatalogValidationInput["profiles"], gates: Record<string, GateDefinition>): FactIdentityDefinition[] {
  const policies = Array.isArray(sourcePolicies) ? sourcePolicies : [sourcePolicies];
  const identities: FactIdentityDefinition[] = [];
  for (const policy of policies) {
    if (policy.authority === "rejected") continue;
    const families: CatalogFamily[] = policy.familyMode === "family" ? [...MCP_ACCESS_GRANT_FAMILIES] : ["none"];
    for (const role of policy.roles) {
      for (const family of families) {
        const gateId = factGateId(policy.profile, policy.source, policy.kind, role, family);
        if (!gateId || !gates[gateId]) continue;
        identities.push({
          profile: policy.profile,
          source: policy.source,
          kind: policy.kind,
          role,
          family,
          authority: policy.authority,
          gateId,
        });
      }
    }
  }
  return identities;
}

interface RecipeSeed {
  key: string;
  profile: CatalogProfileName;
  source: CatalogSourceName;
  method: RequestRecipeDefinition["method"];
  operation: string;
  classifier: string;
}

const RECIPE_SEEDS: readonly RecipeSeed[] = [
  { key: "public.discovery.resource", profile: "public-client", source: "public-client", method: "GET", operation: "protected-resource-metadata", classifier: "resource-discovery" },
  { key: "public.discovery.provider", profile: "public-client", source: "public-client", method: "GET", operation: "authorization-server-metadata", classifier: "provider-discovery" },
  { key: "public.registration.primary", profile: "public-client", source: "public-client", method: "POST", operation: "dynamic-registration", classifier: "public-registration" },
  { key: "public.registration.negative.unsupported-client-auth-method", profile: "public-client", source: "public-client", method: "POST", operation: "negative-registration", classifier: "negative-registration" },
  { key: "public.registration.negative.unsupported-grant-type", profile: "public-client", source: "public-client", method: "POST", operation: "negative-registration", classifier: "negative-registration" },
  { key: "public.registration.negative.unsupported-response-type", profile: "public-client", source: "public-client", method: "POST", operation: "negative-registration", classifier: "negative-registration" },
  { key: "public.registration.negative.malformed-metadata", profile: "public-client", source: "public-client", method: "POST", operation: "negative-registration", classifier: "negative-registration" },
  { key: "public.registration.negative.unsafe-redirect-metadata", profile: "public-client", source: "public-client", method: "POST", operation: "negative-registration", classifier: "negative-registration" },
  { key: "public.authorization.approval", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "affirmative-consent", classifier: "authorization-consent" },
  { key: "public.authorization.denial", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "explicit-denial", classifier: "authorization-outcome" },
  { key: "public.authorization.abandonment", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "consent-abandonment", classifier: "authorization-outcome" },
  { key: "public.loopback.callback", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "loopback-callback", classifier: "loopback-callback" },
  { key: "public.loopback.request", profile: "public-client", source: "public-client", method: "GET", operation: "authorization-request", classifier: "loopback-request" },
  { key: "public.pkce.exchange", profile: "public-client", source: "public-client", method: "POST", operation: "authorization-code-exchange", classifier: "pkce" },
  { key: "public.token.delegated", profile: "public-client", source: "public-client", method: "POST", operation: "delegated-token-validation", classifier: "delegated-token" },
  { key: "public.mcp.authenticated", profile: "public-client", source: "public-client", method: "POST", operation: "authenticated-mcp-operation", classifier: "mcp-operation" },
  { key: "public.grant.cleanup", profile: "public-client", source: "public-client", method: "DELETE", operation: "family-grant-cleanup", classifier: "cleanup" },
  { key: "public.configuration", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "configuration-snapshot", classifier: "configuration" },
  { key: "public.versions", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "version-snapshot", classifier: "versions" },
  { key: "public.evidence.sanitized", profile: "public-client", source: "public-client", method: "CALLBACK", operation: "evidence-verification", classifier: "sanitization" },
  { key: "compatibility.discovery.resource", profile: "compatibility", source: "compatibility", method: "GET", operation: "protected-resource-metadata", classifier: "resource-discovery" },
  { key: "compatibility.discovery.provider", profile: "compatibility", source: "compatibility", method: "GET", operation: "authorization-server-metadata", classifier: "provider-discovery" },
  { key: "compatibility.registration", profile: "compatibility", source: "compatibility", method: "POST", operation: "dynamic-registration", classifier: "compatibility-registration" },
  { key: "compatibility.authorization", profile: "compatibility", source: "compatibility", method: "CALLBACK", operation: "authorization-consent", classifier: "compatibility-authorization" },
  { key: "compatibility.loopback", profile: "compatibility", source: "compatibility", method: "CALLBACK", operation: "loopback-callback-and-request", classifier: "compatibility-pkce" },
  { key: "compatibility.pkce.positive", profile: "compatibility", source: "compatibility", method: "POST", operation: "positive-pkce-exchange", classifier: "compatibility-pkce" },
  { key: "compatibility.pkce.negative", profile: "compatibility", source: "compatibility", method: "POST", operation: "negative-pkce-proof", classifier: "negative-proof" },
  { key: "compatibility.resource.negative", profile: "compatibility", source: "compatibility", method: "GET", operation: "negative-resource-binding", classifier: "resource-negative" },
  { key: "compatibility.token.delegated", profile: "compatibility", source: "compatibility", method: "POST", operation: "delegated-token-validation", classifier: "compatibility-token-validation" },
  { key: "compatibility.token.negative", profile: "compatibility", source: "compatibility", method: "POST", operation: "negative-token-boundary", classifier: "negative-proof" },
  { key: "compatibility.mcp.authenticated", profile: "compatibility", source: "compatibility", method: "POST", operation: "authenticated-mcp-operation", classifier: "compatibility-mcp-operation" },
  { key: "compatibility.refresh.rotation", profile: "compatibility", source: "compatibility", method: "POST", operation: "refresh-rotation", classifier: "refresh-rotation" },
  { key: "compatibility.refresh.replay", profile: "compatibility", source: "compatibility", method: "POST", operation: "refresh-replay-containment", classifier: "refresh-replay" },
  { key: "compatibility.grant.revoke", profile: "compatibility", source: "compatibility", method: "DELETE", operation: "grant-identification-revocation", classifier: "grant-revocation" },
  { key: "compatibility.post-revocation.refresh", profile: "compatibility", source: "compatibility", method: "POST", operation: "post-revocation-refresh", classifier: "post-revocation-refresh" },
  { key: "compatibility.post-revocation.access", profile: "compatibility", source: "compatibility", method: "POST", operation: "post-revocation-access", classifier: "post-revocation-access" },
  { key: "compatibility.cleanup", profile: "compatibility", source: "compatibility", method: "DELETE", operation: "cleanup", classifier: "cleanup" },
  { key: "compatibility.configuration", profile: "compatibility", source: "compatibility", method: "CALLBACK", operation: "configuration-snapshot", classifier: "configuration" },
  { key: "compatibility.versions", profile: "compatibility", source: "compatibility", method: "CALLBACK", operation: "version-snapshot", classifier: "versions" },
  { key: "compatibility.evidence.sanitized", profile: "compatibility", source: "compatibility", method: "CALLBACK", operation: "evidence-verification", classifier: "sanitization" },
];

function makeRecipesAndDecisions(): { requestRecipes: Record<string, RequestRecipeDefinition>; decisionCases: Record<string, DecisionCaseDefinition> } {
  const requestRecipes: Record<string, RequestRecipeDefinition> = {};
  const decisionCases: Record<string, DecisionCaseDefinition> = {};
  for (const seed of RECIPE_SEEDS) {
    requestRecipes[seed.key] = {
      profile: seed.profile,
      source: seed.source,
      method: seed.method,
      operation: seed.operation,
      decisionKey: seed.key,
    };
    decisionCases[seed.key] = {
      profile: seed.profile,
      source: seed.source,
      recipeKey: seed.key,
      classifier: seed.classifier,
      templateFamily: seed.classifier,
      evidenceProjection: seed.classifier,
    };
  }
  return { requestRecipes, decisionCases };
}

function createCatalogs(): CatalogValidationInput {
  const classifiers = makeClassifiers();
  const templates = makeTemplates(classifiers);
  const projections = makeProjections(classifiers);
  const profiles = makeProfiles();
  const gates = makeGates();
  const aggregates = makeAggregates();
  const dependencies = makeDependencies(gates, aggregates);
  const sourcePolicies = makeSourcePolicies();
  const factIdentities = makeFactIdentities(sourcePolicies, profiles, gates);
  const { requestRecipes, decisionCases } = makeRecipesAndDecisions();

  return {
    profiles,
    gates,
    aggregates,
    dependencies,
    classifiers,
    templates,
    projections,
    factIdentities,
    sourcePolicies,
    requestRecipes,
    decisionCases,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const MCP_ACCESS_GRANT_CATALOGS = deepFreeze(createCatalogs());
export const PUBLIC_CLIENT_PROFILE = MCP_ACCESS_GRANT_CATALOGS.profiles.publicClient;
export const COMPATIBILITY_PROFILE = MCP_ACCESS_GRANT_CATALOGS.profiles.compatibility;
export const MCP_ACCESS_GRANT_GATE_CATALOG = MCP_ACCESS_GRANT_CATALOGS.gates;
export const MCP_ACCESS_GRANT_FACT_IDENTITY_CATALOG = MCP_ACCESS_GRANT_CATALOGS.factIdentities;
export const MCP_ACCESS_GRANT_SOURCE_POLICY_CATALOG = MCP_ACCESS_GRANT_CATALOGS.sourcePolicies;
export const MCP_ACCESS_GRANT_CLASSIFIER_CATALOG = MCP_ACCESS_GRANT_CATALOGS.classifiers;
export const MCP_ACCESS_GRANT_TEMPLATE_CATALOG = MCP_ACCESS_GRANT_CATALOGS.templates;
export const MCP_ACCESS_GRANT_PROJECTION_CATALOG = MCP_ACCESS_GRANT_CATALOGS.projections;
export const MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG = MCP_ACCESS_GRANT_CATALOGS.requestRecipes;
export const MCP_ACCESS_GRANT_DECISION_CATALOG = MCP_ACCESS_GRANT_CATALOGS.decisionCases;

export function expandProfileGateIds(profile: ProfileCatalog): string[] {
  return [...profile.expandedGateIds];
}

function exactObjectKeys(value: unknown, path: string, expected: readonly string[], errors: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const actual = Object.keys(value as Record<string, unknown>);
  for (const key of actual) {
    if (!expected.includes(key)) errors.push(`${path}.${key} is an unknown field`);
  }
  for (const key of expected) {
    if (!actual.includes(key)) errors.push(`${path}.${key} is missing`);
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedExpandedGateIds(profile: CatalogProfileName): readonly string[] {
  return profile === "public-client" ? PUBLIC_EXPANDED_GATE_IDS : COMPATIBILITY_EXPANDED_GATE_IDS;
}

function validateProfiles(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!isRecord(catalogs.profiles)) {
    exactObjectKeys(catalogs.profiles, "profiles", ["publicClient", "compatibility"], errors);
    return;
  }
  exactObjectKeys(catalogs.profiles, "profiles", ["publicClient", "compatibility"], errors);
  const profileEntries: Array<[string, unknown, readonly string[], "#765" | "#768"]> = [
    ["publicClient", catalogs.profiles.publicClient, PUBLIC_CLIENT_REQUIRED_GATE_IDS, "#765"],
    ["compatibility", catalogs.profiles.compatibility, COMPATIBILITY_REQUIRED_GATE_IDS, "#768"],
  ];
  const profileKeys = [
    "name", "issue", "artifactName", "requiredGateIds", "expandedGateIds", "gateCount", "expandedGateCount",
    "outcomePrecedence", "missingGateBehavior", "familyMetadata", "configurationRules", "versionRules",
    "sharedOwnership", "reachabilityRoots",
  ] as const;
  for (const [key, profileValue, requiredGateIds, issue] of profileEntries) {
    if (!isRecord(profileValue)) {
      exactObjectKeys(profileValue, `profiles.${key}`, profileKeys, errors);
      errors.push(`profiles.${key} is missing`);
      continue;
    }
    const profile = profileValue as unknown as ProfileCatalog;
    exactObjectKeys(profile, `profiles.${key}`, profileKeys, errors);
    if (profile.name !== (key === "publicClient" ? "public-client" : "compatibility")) errors.push(`profiles.${key}.name`);
    if (profile.issue !== issue) errors.push(`profiles.${key}.issue`);
    if (profile.artifactName !== MCP_ACCESS_GRANT_ARTIFACT_NAME) errors.push(`profiles.${key}.artifactName`);
    if (!isStringArray(profile.requiredGateIds) || !arraysEqual(profile.requiredGateIds, requiredGateIds)) errors.push(`profiles.${key}.requiredGateIds ordering or identity`);
    if (!isStringArray(profile.expandedGateIds) || !arraysEqual(profile.expandedGateIds, expectedExpandedGateIds(profile.name))) errors.push(`profiles.${key}.expandedGateIds ordering or identity`);
    if (!isStringArray(profile.requiredGateIds) || !isStringArray(profile.expandedGateIds)) {
      errors.push(`profiles.${key}.gate identity arrays`);
    } else {
      if (profile.gateCount !== profile.requiredGateIds.length) errors.push(`profiles.${key}.gateCount`);
      if (profile.expandedGateCount !== profile.expandedGateIds.length) errors.push(`profiles.${key}.expandedGateCount`);
      if (!unique(profile.requiredGateIds) || !unique(profile.expandedGateIds)) errors.push(`profiles.${key}.duplicate gate identity`);
      if (!profile.requiredGateIds.every((id) => profile.expandedGateIds.includes(id))) errors.push(`profiles.${key}.requiredGateIds coverage`);
    }
    if (!isStringArray(profile.outcomePrecedence) || !arraysEqual(profile.outcomePrecedence, MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE)) errors.push(`profiles.${key}.outcomePrecedence`);

    const missingGateBehavior = profile.missingGateBehavior;
    if (!isRecord(missingGateBehavior)) {
      exactObjectKeys(missingGateBehavior, `profiles.${key}.missingGateBehavior`, ["status", "errorKind"], errors);
    } else {
      exactObjectKeys(missingGateBehavior, `profiles.${key}.missingGateBehavior`, ["status", "errorKind"], errors);
      if (missingGateBehavior.status !== "not-proven" || missingGateBehavior.errorKind !== "missing-observation") errors.push(`profiles.${key}.missingGateBehavior`);
    }

    const familyMetadata = profile.familyMetadata;
    if (!isRecord(familyMetadata)) {
      exactObjectKeys(familyMetadata, `profiles.${key}.familyMetadata`, ["order", "aggregate", "loopbackHosts"], errors);
    } else {
      exactObjectKeys(familyMetadata, `profiles.${key}.familyMetadata`, ["order", "aggregate", "loopbackHosts"], errors);
      if (!isStringArray(familyMetadata.order) || !arraysEqual(familyMetadata.order, MCP_ACCESS_GRANT_FAMILIES) || familyMetadata.aggregate !== "both") errors.push(`profiles.${key}.familyMetadata`);
      if (!isRecord(familyMetadata.loopbackHosts)) {
        exactObjectKeys(familyMetadata.loopbackHosts, `profiles.${key}.familyMetadata.loopbackHosts`, ["ipv4", "ipv6"], errors);
      } else {
        exactObjectKeys(familyMetadata.loopbackHosts, `profiles.${key}.familyMetadata.loopbackHosts`, ["ipv4", "ipv6"], errors);
        if (familyMetadata.loopbackHosts.ipv4 !== MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4 || familyMetadata.loopbackHosts.ipv6 !== MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6) errors.push(`profiles.${key}.familyMetadata.loopbackHosts`);
      }
    }

    const configurationRules = profile.configurationRules;
    if (!isRecord(configurationRules)) {
      exactObjectKeys(configurationRules, `profiles.${key}.configurationRules`, ["requiredTargetFields", "acceptedSchemes", "nonProductionAcknowledgementEnv", "nonProductionAcknowledgementValue", "credentialSource", "loopbackHosts"], errors);
    } else {
      exactObjectKeys(configurationRules, `profiles.${key}.configurationRules`, ["requiredTargetFields", "acceptedSchemes", "nonProductionAcknowledgementEnv", "nonProductionAcknowledgementValue", "credentialSource", "loopbackHosts"], errors);
      if (!isStringArray(configurationRules.requiredTargetFields) || !arraysEqual(configurationRules.requiredTargetFields, ["canonicalResource", "supabaseUrl", "expectedAuthorizationServer"])) errors.push(`profiles.${key}.configurationRules.requiredTargetFields`);
      if (!isStringArray(configurationRules.acceptedSchemes) || !arraysEqual(configurationRules.acceptedSchemes, ["http", "https"])) errors.push(`profiles.${key}.configurationRules.acceptedSchemes`);
      if (configurationRules.nonProductionAcknowledgementEnv !== "MCP_ACCESS_GRANT_NON_PRODUCTION_ACK" || configurationRules.nonProductionAcknowledgementValue !== "true" || configurationRules.credentialSource !== "environment-only") errors.push(`profiles.${key}.configurationRules policy`);
      if (!isStringArray(configurationRules.loopbackHosts) || !arraysEqual(configurationRules.loopbackHosts, ["127.0.0.1", "::1"])) errors.push(`profiles.${key}.configurationRules.loopbackHosts`);
    }

    const versionRules = profile.versionRules;
    if (!isRecord(versionRules)) {
      exactObjectKeys(versionRules, `profiles.${key}.versionRules`, ["requiredKeys", "optionalKeys", "unavailableValue", "sentinels", "missingGateStatus"], errors);
    } else {
      exactObjectKeys(versionRules, `profiles.${key}.versionRules`, ["requiredKeys", "optionalKeys", "unavailableValue", "sentinels", "missingGateStatus"], errors);
      if (!isStringArray(versionRules.requiredKeys) || !isStringArray(versionRules.optionalKeys)) errors.push(`profiles.${key}.versionRules keys`);
      if (versionRules.unavailableValue !== "unavailable" || versionRules.missingGateStatus !== "not-proven") errors.push(`profiles.${key}.versionRules status policy`);
      if (!isRecord(versionRules.sentinels)) {
        exactObjectKeys(versionRules.sentinels, `profiles.${key}.versionRules.sentinels`, ["supabase-auth-provider-image", "supabase-hosted-provider-version"], errors);
      } else {
        exactObjectKeys(versionRules.sentinels, `profiles.${key}.versionRules.sentinels`, ["supabase-auth-provider-image", "supabase-hosted-provider-version"], errors);
        if (versionRules.sentinels["supabase-auth-provider-image"] !== "not-applicable" || versionRules.sentinels["supabase-hosted-provider-version"] !== "not-publicly-exposed") errors.push(`profiles.${key}.versionRules.sentinels`);
      }
    }

    const sharedOwnership = profile.sharedOwnership;
    if (!isRecord(sharedOwnership)) {
      exactObjectKeys(sharedOwnership, `profiles.${key}.sharedOwnership`, ["sharedGateIds", "authorityByGate", "nestedDiscoverySource", "nestedDiscoveryAuthority"], errors);
    } else {
      exactObjectKeys(sharedOwnership, `profiles.${key}.sharedOwnership`, ["sharedGateIds", "authorityByGate", "nestedDiscoverySource", "nestedDiscoveryAuthority"], errors);
      if (!isStringArray(sharedOwnership.sharedGateIds) || !arraysEqual(sharedOwnership.sharedGateIds, PUBLIC_SHARED_GATE_IDS)) errors.push(`profiles.${key}.sharedOwnership.sharedGateIds`);
      if (!isRecord(sharedOwnership.authorityByGate)) {
        exactObjectKeys(sharedOwnership.authorityByGate, `profiles.${key}.sharedOwnership.authorityByGate`, PUBLIC_SHARED_GATE_IDS, errors);
      } else {
        exactObjectKeys(sharedOwnership.authorityByGate, `profiles.${key}.sharedOwnership.authorityByGate`, PUBLIC_SHARED_GATE_IDS, errors);
        if (!PUBLIC_SHARED_GATE_IDS.every((id) => PRODUCERS.includes(sharedOwnership.authorityByGate[id] as CatalogProducer))) errors.push(`profiles.${key}.sharedOwnership.authorityByGate values`);
      }
      if (sharedOwnership.nestedDiscoverySource !== "public-client" || sharedOwnership.nestedDiscoveryAuthority !== "shadow") errors.push(`profiles.${key}.sharedOwnership nested discovery policy`);
    }
    if (!isStringArray(profile.reachabilityRoots) || !isStringArray(profile.expandedGateIds) || !profile.reachabilityRoots.every((id) => profile.expandedGateIds.includes(id))) errors.push(`profiles.${key}.reachabilityRoots`);
  }
}

function validateClassifiersAndReferences(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!isRecord(catalogs.classifiers) || !isRecord(catalogs.templates) || !isRecord(catalogs.projections)) {
    if (!isRecord(catalogs.classifiers)) errors.push("classifiers must be an object");
    if (!isRecord(catalogs.templates)) errors.push("templates must be an object");
    if (!isRecord(catalogs.projections)) errors.push("projections must be an object");
    return;
  }
  const classifierKeys = Object.keys(catalogs.classifiers);
  if (!arraysEqual([...classifierKeys].sort(), Object.keys(CLASSIFIER_CASES).sort())) errors.push("classifiers closed catalog");
  for (const [id, classifier] of Object.entries(catalogs.classifiers)) {
    if (!isRecord(classifier)) {
      exactObjectKeys(classifier, `classifiers.${id}`, ["id", "cases"], errors);
      continue;
    }
    exactObjectKeys(classifier, `classifiers.${id}`, ["id", "cases"], errors);
    if (classifier.id !== id) errors.push(`classifiers.${id}.id`);
    if (!isRecord(classifier.cases) || Object.keys(classifier.cases).length === 0) {
      errors.push(`classifiers.${id}.cases`);
      continue;
    }
    if (!arraysEqual(Object.keys(classifier.cases), Object.keys(CLASSIFIER_CASES[id] ?? {}))) errors.push(`classifiers.${id}.cases ordering or identity`);
    for (const [caseId, classifierCase] of Object.entries(classifier.cases)) {
      if (!isRecord(classifierCase)) {
        exactObjectKeys(classifierCase, `classifiers.${id}.cases.${caseId}`, ["outcome", "description"], errors);
        continue;
      }
      exactObjectKeys(classifierCase, `classifiers.${id}.cases.${caseId}`, ["outcome", "description"], errors);
      if (!GATE_STATUSES.includes(classifierCase.outcome)) errors.push(`classifiers.${id}.cases.${caseId}.outcome`);
      if (typeof classifierCase.description !== "string" || classifierCase.description.length === 0) errors.push(`classifiers.${id}.cases.${caseId}.description`);
    }
  }
  for (const [id, template] of Object.entries(catalogs.templates)) {
    if (!isRecord(template)) {
      exactObjectKeys(template, `templates.${id}`, ["id", "cases", "text"], errors);
      continue;
    }
    exactObjectKeys(template, `templates.${id}`, ["id", "cases", "text"], errors);
    if (!catalogs.classifiers[id]) errors.push(`templates.${id} is unreferenced`);
    if (!isStringArray(template.cases) || template.id !== id || !arraysEqual(template.cases, Object.keys(catalogs.classifiers[id]?.cases ?? {}))) errors.push(`templates.${id}.cases`);
    if (!isRecord(template.text)) {
      exactObjectKeys(template.text, `templates.${id}.text`, ["pass", "fail", "not-proven"], errors);
    } else {
      exactObjectKeys(template.text, `templates.${id}.text`, ["pass", "fail", "not-proven"], errors);
    }
  }
  if (!arraysEqual(Object.keys(catalogs.templates).sort(), Object.keys(CLASSIFIER_CASES).sort())) errors.push("templates closed catalog");
  for (const id of classifierKeys) {
    if (!catalogs.templates[id]) errors.push(`templates.${id} is missing`);
    if (!catalogs.projections[id]) errors.push(`projections.${id} is missing`);
  }
  for (const [id, projection] of Object.entries(catalogs.projections)) {
    if (!isRecord(projection)) {
      exactObjectKeys(projection, `projections.${id}`, ["id", "allowedKeys", "requiredKeys"], errors);
      continue;
    }
    exactObjectKeys(projection, `projections.${id}`, ["id", "allowedKeys", "requiredKeys"], errors);
    if (!catalogs.classifiers[id]) errors.push(`projections.${id} is unreferenced`);
    if (!isStringArray(projection.allowedKeys) || !isStringArray(projection.requiredKeys) || projection.id !== id || !unique(projection.allowedKeys) || !unique(projection.requiredKeys)) errors.push(`projections.${id}.keys`);
    if (isStringArray(projection.allowedKeys) && isStringArray(projection.requiredKeys) && !projection.requiredKeys.every((key) => projection.allowedKeys.includes(key))) errors.push(`projections.${id}.requiredKeys`);
  }
  if (!arraysEqual(Object.keys(catalogs.projections).sort(), Object.keys(CLASSIFIER_CASES).sort())) errors.push("projections closed catalog");
}

function validateGatesAndAggregates(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!isRecord(catalogs.profiles) || !isRecord(catalogs.gates) || !isRecord(catalogs.aggregates) || !isRecord(catalogs.classifiers) || !isRecord(catalogs.templates) || !isRecord(catalogs.projections)) {
    if (!isRecord(catalogs.profiles)) errors.push("profiles must be an object");
    if (!isRecord(catalogs.gates)) errors.push("gates must be an object");
    if (!isRecord(catalogs.aggregates)) errors.push("aggregates must be an object");
    if (!isRecord(catalogs.classifiers)) errors.push("classifiers must be an object");
    if (!isRecord(catalogs.templates)) errors.push("templates must be an object");
    if (!isRecord(catalogs.projections)) errors.push("projections must be an object");
    return;
  }
  const publicProfile = catalogs.profiles.publicClient;
  const compatibilityProfile = catalogs.profiles.compatibility;
  const publicGateIds = isRecord(publicProfile) && isStringArray(publicProfile.expandedGateIds) ? publicProfile.expandedGateIds : [];
  const compatibilityGateIds = isRecord(compatibilityProfile) && isStringArray(compatibilityProfile.expandedGateIds) ? compatibilityProfile.expandedGateIds : [];
  const allProfileGateIds = new Set([
    ...publicGateIds,
    ...compatibilityGateIds,
  ]);
  for (const id of allProfileGateIds) {
    if (!catalogs.gates[id]) errors.push(`gates.${id} is missing`);
  }
  for (const id of Object.keys(catalogs.gates)) {
    if (!allProfileGateIds.has(id)) errors.push(`gates.${id} is unreferenced`);
  }
  const gateKeys = ["id", "profiles", "scope", "family", "producerByProfile", "factKinds", "classifier", "templateFamily", "evidenceProjection"] as const;
  for (const [id, gate] of Object.entries(catalogs.gates)) {
    if (!isRecord(gate)) {
      exactObjectKeys(gate, `gates.${id}`, gateKeys, errors);
      continue;
    }
    exactObjectKeys(gate, `gates.${id}`, gateKeys, errors);
    if (!isStringArray(gate.profiles) || !unique(gate.profiles) || !gate.profiles.every((profile) => PROFILE_NAMES.includes(profile as CatalogProfileName))) errors.push(`gates.${id}.identity`);
    const gateProfiles = isStringArray(gate.profiles) ? gate.profiles : [];
    for (const profile of PROFILE_NAMES) {
      const profileGateIds = profile === "public-client" ? publicGateIds : compatibilityGateIds;
      const shouldInclude = profileGateIds.includes(id);
      if (shouldInclude !== gateProfiles.includes(profile)) errors.push(`gates.${id}.profiles.${profile}`);
    }
    if (!(["shared", "direct", "family", "family-aggregate"] as readonly string[]).includes(gate.scope)) errors.push(`gates.${id}.scope`);
    if (gate.scope === "family" && !(["ipv4", "ipv6"] as readonly string[]).includes(gate.family)) errors.push(`gates.${id}.family`);
    if (gate.scope === "family-aggregate" && gate.family !== "both") errors.push(`gates.${id}.family aggregate`);
    if ((gate.scope === "shared" || gate.scope === "direct") && gate.family !== "none") errors.push(`gates.${id}.family non-family`);
    if (!isStringArray(gate.factKinds) || !gate.factKinds.length || !gate.factKinds.every((kind) => FACT_KINDS.includes(kind as CatalogFactKind))) errors.push(`gates.${id}.factKinds`);
    if (typeof gate.classifier !== "string" || !catalogs.classifiers[gate.classifier]) errors.push(`gates.${id}.classifier ${String(gate.classifier)}`);
    if (typeof gate.templateFamily !== "string" || !catalogs.templates[gate.templateFamily]) errors.push(`gates.${id}.templateFamily ${String(gate.templateFamily)}`);
    if (typeof gate.evidenceProjection !== "string" || !catalogs.projections[gate.evidenceProjection]) errors.push(`gates.${id}.evidenceProjection ${String(gate.evidenceProjection)}`);
    if (!isRecord(gate.producerByProfile)) {
      exactObjectKeys(gate.producerByProfile, `gates.${id}.producerByProfile`, gateProfiles, errors);
    } else {
      exactObjectKeys(gate.producerByProfile, `gates.${id}.producerByProfile`, gateProfiles, errors);
      for (const profile of gateProfiles) {
        if (!PRODUCERS.includes(gate.producerByProfile[profile] as CatalogProducer)) errors.push(`gates.${id}.producer ${profile}`);
      }
    }
  }

  const aggregateKeys = Object.keys(catalogs.aggregates);
  if (!arraysEqual(aggregateKeys.sort(), [...PUBLIC_FAMILY_AGGREGATE_GATE_IDS].sort())) errors.push("aggregates closed catalog");
  for (const [id, aggregate] of Object.entries(catalogs.aggregates)) {
    if (!isRecord(aggregate)) {
      exactObjectKeys(aggregate, `aggregates.${id}`, ["id", "profiles", "family", "children", "precedence"], errors);
      continue;
    }
    exactObjectKeys(aggregate, `aggregates.${id}`, ["id", "profiles", "family", "children", "precedence"], errors);
    const base = id.replace(/-both$/, "");
    const expectedChildren = MCP_ACCESS_GRANT_FAMILIES.map((family) => `${base}-${family}`);
    if (!isStringArray(aggregate.profiles) || !arraysEqual(aggregate.profiles, ["public-client", "compatibility"])) errors.push(`aggregates.${id}.profiles`);
    if (aggregate.id !== id || aggregate.family !== "both" || !isStringArray(aggregate.children) || !arraysEqual(aggregate.children, expectedChildren)) errors.push(`aggregates.${id}.children`);
    if (!isStringArray(aggregate.precedence) || !arraysEqual(aggregate.precedence, MCP_ACCESS_GRANT_OUTCOME_PRECEDENCE)) errors.push(`aggregates.${id}.precedence`);
    if (!isStringArray(aggregate.children)) continue;
    for (const child of aggregate.children) {
      if (!catalogs.gates[child]) errors.push(`aggregates.${id}.children.${child}`);
      else if (catalogs.gates[child].scope !== "family" || catalogs.gates[child].family === "none") errors.push(`aggregates.${id}.children.${child}.family`);
    }
    const aggregateGate = catalogs.gates[id];
    if (!aggregateGate || aggregateGate.scope !== "family-aggregate" || aggregateGate.family !== "both") errors.push(`aggregates.${id}.gate`);
  }
}

function graphNeighbors(catalogs: CatalogValidationInput, id: string): string[] {
  const dependencies = isRecord(catalogs.dependencies) && isStringArray(catalogs.dependencies[id]) ? catalogs.dependencies[id] : [];
  const aggregate = isRecord(catalogs.aggregates) && isRecord(catalogs.aggregates[id]) ? catalogs.aggregates[id] : undefined;
  const children = aggregate && isStringArray(aggregate.children) ? aggregate.children : [];
  return [...dependencies, ...children];
}

function validateGraph(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!isRecord(catalogs.gates) || !isRecord(catalogs.dependencies)) {
    if (!isRecord(catalogs.gates)) errors.push("gates must be an object");
    if (!isRecord(catalogs.dependencies)) errors.push("dependencies must be an object");
    return;
  }
  const gateIds = Object.keys(catalogs.gates);
  if (!arraysEqual(Object.keys(catalogs.dependencies).sort(), gateIds.sort())) errors.push("dependencies must cover every gate");
  for (const [id, dependencyIds] of Object.entries(catalogs.dependencies)) {
    if (!isStringArray(dependencyIds)) {
      errors.push(`dependencies.${id} must be a string array`);
      continue;
    }
    if (!unique(dependencyIds)) errors.push(`dependencies.${id} duplicates`);
    for (const dependencyId of dependencyIds) if (!catalogs.gates[dependencyId]) errors.push(`dependencies.${id}.${dependencyId} unknown reference`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      errors.push(`dependency graph cycle at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const neighbor of graphNeighbors(catalogs, id)) visit(neighbor);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of gateIds) visit(id);

  for (const [key, profileValue] of [["publicClient", isRecord(catalogs.profiles) ? catalogs.profiles.publicClient : undefined], ["compatibility", isRecord(catalogs.profiles) ? catalogs.profiles.compatibility : undefined]] as const) {
    if (!isRecord(profileValue) || !isStringArray(profileValue.expandedGateIds) || !isStringArray(profileValue.reachabilityRoots)) {
      errors.push(`profiles.${key}.reachabilityRoots`);
      continue;
    }
    const profile = profileValue;
    const reachable = new Set<string>();
    const walk = (id: string): void => {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const neighbor of graphNeighbors(catalogs, id)) walk(neighbor);
    };
    for (const root of profile.reachabilityRoots) {
      if (!profile.expandedGateIds.includes(root)) errors.push(`profiles.${key}.reachabilityRoots.${root} unknown`);
      walk(root);
    }
    for (const id of profile.expandedGateIds) if (!reachable.has(id)) errors.push(`profiles.${key}.${id} is unreachable`);
  }
}

function policyKey(profile: CatalogProfileName, source: CatalogSourceName, kind: CatalogFactKind): string {
  return `${profile}|${source}|${kind}`;
}

function factKey(identity: Pick<FactIdentityDefinition, "profile" | "source" | "kind" | "role" | "family">): string {
  return `${identity.profile}|${identity.source}|${identity.kind}|${identity.role}|${identity.family}`;
}

function validateFacts(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!Array.isArray(catalogs.sourcePolicies) || !Array.isArray(catalogs.factIdentities)) {
    if (!Array.isArray(catalogs.sourcePolicies)) errors.push("sourcePolicies must be an array");
    if (!Array.isArray(catalogs.factIdentities)) errors.push("factIdentities must be an array");
    return;
  }
  const expectedPolicyKeys = new Set(PROFILE_NAMES.flatMap((profile) => SOURCE_NAMES.flatMap((source) => FACT_KINDS.map((kind) => policyKey(profile, source, kind)))));
  const policies = new Map<string, SourcePolicyDefinition>();
  for (const [index, policy] of catalogs.sourcePolicies.entries()) {
    if (!isRecord(policy)) {
      exactObjectKeys(policy, `sourcePolicies.${index}`, ["profile", "source", "kind", "authority", "familyMode", "roles"], errors);
      continue;
    }
    exactObjectKeys(policy, `sourcePolicies.${index}`, ["profile", "source", "kind", "authority", "familyMode", "roles"], errors);
    const typedPolicy = policy as unknown as SourcePolicyDefinition;
    const key = policyKey(typedPolicy.profile, typedPolicy.source, typedPolicy.kind);
    if (policies.has(key)) errors.push(`sourcePolicies.${key} duplicate`);
    policies.set(key, typedPolicy);
    if (!PROFILE_NAMES.includes(typedPolicy.profile) || !SOURCE_NAMES.includes(typedPolicy.source) || !FACT_KINDS.includes(typedPolicy.kind)) errors.push(`sourcePolicies.${key} identity`);
    if (!(["authoritative", "shadow", "rejected"] as readonly string[]).includes(typedPolicy.authority)) errors.push(`sourcePolicies.${key}.authority`);
    if (!(["none", "family"] as readonly string[]).includes(typedPolicy.familyMode)) errors.push(`sourcePolicies.${key}.familyMode`);
    if (!isStringArray(typedPolicy.roles) || !unique(typedPolicy.roles) || !typedPolicy.roles.every((role) => FACT_ROLE_CATALOG[typedPolicy.kind]?.includes(role))) errors.push(`sourcePolicies.${key}.roles`);
    if (typedPolicy.authority === "rejected" && isStringArray(typedPolicy.roles) && typedPolicy.roles.length > 0) errors.push(`sourcePolicies.${key}.rejected roles`);
  }
  for (const key of expectedPolicyKeys) if (!policies.has(key)) errors.push(`sourcePolicies.${key} missing`);

  const identities = new Map<string, FactIdentityDefinition>();
  for (const [index, identity] of catalogs.factIdentities.entries()) {
    if (!isRecord(identity)) {
      exactObjectKeys(identity, `factIdentities.${index}`, ["profile", "source", "kind", "role", "family", "authority", "gateId"], errors);
      continue;
    }
    exactObjectKeys(identity, `factIdentities.${index}`, ["profile", "source", "kind", "role", "family", "authority", "gateId"], errors);
    const typedIdentity = identity as unknown as FactIdentityDefinition;
    const key = factKey(typedIdentity);
    if (identities.has(key)) errors.push(`factIdentities.${key} duplicate`);
    identities.set(key, typedIdentity);
    const policy = policies.get(policyKey(typedIdentity.profile, typedIdentity.source, typedIdentity.kind));
    if (!policy) {
      errors.push(`factIdentities.${key} policy missing`);
      continue;
    }
    if (policy.authority !== typedIdentity.authority || policy.authority === "rejected") errors.push(`factIdentities.${key}.authority`);
    if (!isStringArray(policy.roles) || !policy.roles.includes(typedIdentity.role)) errors.push(`factIdentities.${key}.role`);
    if (policy.familyMode === "family" ? !(["ipv4", "ipv6"] as readonly string[]).includes(typedIdentity.family) : typedIdentity.family !== "none") errors.push(`factIdentities.${key}.family`);
    const profile = isRecord(catalogs.profiles) && typedIdentity.profile === "public-client"
      ? catalogs.profiles.publicClient
      : isRecord(catalogs.profiles) && typedIdentity.profile === "compatibility"
        ? catalogs.profiles.compatibility
        : undefined;
    if (!isRecord(profile) || !isStringArray(profile.expandedGateIds) || !profile.expandedGateIds.includes(typedIdentity.gateId)) errors.push(`factIdentities.${key}.gateId`);
    const gate = isRecord(catalogs.gates) ? catalogs.gates[typedIdentity.gateId] : undefined;
    if (!isRecord(gate) || !isStringArray(gate.profiles) || !gate.profiles.includes(typedIdentity.profile) || !isStringArray(gate.factKinds) || !gate.factKinds.includes(typedIdentity.kind)) errors.push(`factIdentities.${key}.gate compatibility`);
  }
  for (const policy of policies.values()) {
    if (policy.authority === "rejected") continue;
    const families: CatalogFamily[] = policy.familyMode === "family" ? ["ipv4", "ipv6"] : ["none"];
    if (!isStringArray(policy.roles)) continue;
    for (const role of policy.roles) {
      for (const family of families) {
        if (!identities.has(factKey({ ...policy, role, family }))) errors.push(`factIdentities missing ${policyKey(policy.profile, policy.source, policy.kind)}:${role}:${family}`);
      }
    }
  }
}

function validateRecipesAndDecisions(catalogs: CatalogValidationInput, errors: string[]): void {
  if (!isRecord(catalogs.requestRecipes) || !isRecord(catalogs.decisionCases) || !isRecord(catalogs.classifiers) || !isRecord(catalogs.templates) || !isRecord(catalogs.projections)) {
    errors.push("request, decision, classifier, template, and projection catalogs must be objects");
    return;
  }
  const recipeKeys = Object.keys(catalogs.requestRecipes);
  const decisionKeys = Object.keys(catalogs.decisionCases);
  if (!arraysEqual([...recipeKeys].sort(), [...decisionKeys].sort())) errors.push("request/decision key equality");
  if (!arraysEqual([...recipeKeys].sort(), RECIPE_SEEDS.map((seed) => seed.key).sort())) errors.push("request recipes closed catalog");
  for (const [key, recipe] of Object.entries(catalogs.requestRecipes)) {
    if (!isRecord(recipe)) {
      exactObjectKeys(recipe, `requestRecipes.${key}`, ["profile", "source", "method", "operation", "decisionKey"], errors);
      continue;
    }
    exactObjectKeys(recipe, `requestRecipes.${key}`, ["profile", "source", "method", "operation", "decisionKey"], errors);
    if (!PROFILE_NAMES.includes(recipe.profile) || !SOURCE_NAMES.includes(recipe.source)) errors.push(`requestRecipes.${key}.identity`);
    if (!(["GET", "POST", "PATCH", "DELETE", "CALLBACK"] as readonly string[]).includes(recipe.method)) errors.push(`requestRecipes.${key}.method`);
    if (recipe.decisionKey !== key) errors.push(`requestRecipes.${key}.decisionKey`);
    if (typeof recipe.operation !== "string" || !recipe.operation) errors.push(`requestRecipes.${key}.operation`);
  }
  if (!arraysEqual([...decisionKeys].sort(), RECIPE_SEEDS.map((seed) => seed.key).sort())) errors.push("decision cases closed catalog");
  for (const [key, decision] of Object.entries(catalogs.decisionCases)) {
    if (!isRecord(decision)) {
      exactObjectKeys(decision, `decisionCases.${key}`, ["profile", "source", "recipeKey", "classifier", "templateFamily", "evidenceProjection"], errors);
      continue;
    }
    exactObjectKeys(decision, `decisionCases.${key}`, ["profile", "source", "recipeKey", "classifier", "templateFamily", "evidenceProjection"], errors);
    const recipe = catalogs.requestRecipes[key];
    if (!recipe || decision.recipeKey !== key || decision.profile !== recipe.profile || decision.source !== recipe.source) errors.push(`decisionCases.${key}.recipe`);
    if (typeof decision.classifier !== "string" || !catalogs.classifiers[decision.classifier]) errors.push(`decisionCases.${key}.classifier ${String(decision.classifier)}`);
    if (typeof decision.templateFamily !== "string" || !catalogs.templates[decision.templateFamily]) errors.push(`decisionCases.${key}.templateFamily ${String(decision.templateFamily)}`);
    if (typeof decision.evidenceProjection !== "string" || !catalogs.projections[decision.evidenceProjection]) errors.push(`decisionCases.${key}.evidenceProjection ${String(decision.evidenceProjection)}`);
  }
}

export function validateMcpAccessGrantCatalogs(catalogs: CatalogValidationInput): CatalogValidationResult {
  const errors: string[] = [];
  if (!isRecord(catalogs)) return { valid: false, errors: ["catalogs must be an object"] };
  exactObjectKeys(catalogs, "catalogs", ["profiles", "gates", "aggregates", "dependencies", "classifiers", "templates", "projections", "factIdentities", "sourcePolicies", "requestRecipes", "decisionCases"], errors);
  validateProfiles(catalogs, errors);
  validateClassifiersAndReferences(catalogs, errors);
  validateGatesAndAggregates(catalogs, errors);
  validateGraph(catalogs, errors);
  validateFacts(catalogs, errors);
  validateRecipesAndDecisions(catalogs, errors);
  return { valid: errors.length === 0, errors };
}

const INITIAL_CATALOG_VALIDATION = validateMcpAccessGrantCatalogs(MCP_ACCESS_GRANT_CATALOGS);
if (!INITIAL_CATALOG_VALIDATION.valid) {
  throw new Error(`Invalid MCP evidence catalog:\n${INITIAL_CATALOG_VALIDATION.errors.join("\n")}`);
}

export function classifyFactIdentity(input: FactIdentityInput): { accepted: boolean; authority: CatalogAuthority } {
  const identity = MCP_ACCESS_GRANT_CATALOGS.factIdentities.find((candidate) =>
    candidate.profile === input.profile &&
    candidate.source === input.source &&
    candidate.kind === input.kind &&
    candidate.role === input.role &&
    candidate.family === input.family,
  );
  return identity
    ? { accepted: true, authority: identity.authority }
    : { accepted: false, authority: "rejected" };
}

const RECOGNIZED_NEGATIVE_REGISTRATION_ERRORS = new Set([
  "invalid_client_metadata",
  "invalid_client",
  "invalid_redirect_uri",
  "invalid_grant_type",
  "invalid_response_type",
  "invalid_request",
  "unsupported_client",
  "unsupported_grant_type",
  "unsupported_response_type",
]);

export function classifyNegativeRegistration(observation: NegativeRegistrationObservation): GateStatus {
  if (observation.credentialPresence === "present") return "fail";
  if (observation.status !== undefined && observation.status >= 200 && observation.status < 300) return "fail";
  if (
    (observation.status === 400 || observation.status === 422) &&
    observation.credentialPresence === "absent" &&
    typeof observation.errorCode === "string" &&
    RECOGNIZED_NEGATIVE_REGISTRATION_ERRORS.has(observation.errorCode)
  ) return "pass";
  return "not-proven";
}
