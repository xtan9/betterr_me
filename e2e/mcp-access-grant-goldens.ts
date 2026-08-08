import {
  classifyNegativeRegistration,
  COMPATIBILITY_PROFILE,
  MCP_ACCESS_GRANT_ARTIFACT_NAME,
  MCP_ACCESS_GRANT_CATALOGS,
  PUBLIC_CLIENT_PROFILE,
  type CatalogProfileName,
  type GateStatus,
} from "./mcp-access-grant-catalogs";
import {
  finalizeEvidence,
  type CompatibilityReport,
  type EvidenceObservation,
  type EvidenceRunContext,
  type FinalizeEvidenceInput,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";

/**
 * The report verifier sorts object keys before writing JSON. Keep that order
 * explicit here so a serializer change is a golden change, not an incidental
 * test implementation detail.
 */
export const MCP_ACCESS_GRANT_GOLDEN_SERIALIZATION_KEY_ORDER = [
  "finishedAt",
  "gates",
  "issue",
  "outcome",
  "requests",
  "startedAt",
  "target",
  "versions",
] as const;

export const MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS = {
  "supabase-auth-provider-image": "not-applicable",
  "supabase-hosted-provider-version": "not-publicly-exposed",
} as const;

export const MCP_ACCESS_GRANT_GOLDEN_OMISSION_RULES = {
  hostedTargetLoopbackHosts: "omit",
  absentRequestOptionalFields: "omit",
  absentTargetOptionalFields: "omit",
} as const;

// A digest keeps the serialized bytes frozen even if the fixture builder is
// later refactored. The tests still compare the full artifact, while this
// registry prevents accidental regeneration from silently changing a golden.
export const MCP_ACCESS_GRANT_GOLDEN_SERIALIZED_SHA256 = {
  "public-client-local-pass": "2903ed127672bdbc6ecc68d1e9c3bb086ef48f768b8d22a0797feb6fc5719a6f",
  "public-client-hosted-policy": "aac93e801c0dfdfc9d695267427d3abca443b9bbfabb6a0d1ca21cfa92a65f75",
  "public-client-missing": "62d98dcafbe3777f1aa3e825a63e9e69e337e40f74b3f4e0f4eb4d0fd9fb6a15",
  "public-client-negative-registration": "8367a8ca5f16a0aa914d462f83d4a213ec692b6336b472bd4f148af69cae6b14",
  "compatibility-local-pass": "c1627c9375124af66cccc0bff9ba451fecac09b62ec56e05258cf8242bed6509",
  "compatibility-hosted-policy": "74c84589c026f1a351708e01b5cf68614072385807cf04654590ee1b1b71e8a0",
  "compatibility-missing": "3a2e52ca3e85cee2eebbfa7e849d4ab3dbd7c36c5690225b12a124b5bd01bd59",
  "compatibility-conflict": "316fe830bb33c5bd4a8ef27ba5e9bc9b54dd8b8c837a449807db323e0f231f39",
  "compatibility-family-aggregate": "c46e59308c0f9740f8d91d6e24ad913d57f07658b56aa2e7dd4ccb63e456a1de",
} as const;

export const MCP_ACCESS_GRANT_GOLDEN_OUTCOME_PRECEDENCE = ["fail", "not-proven", "pass"] as const satisfies readonly GateStatus[];

const GOLDEN_STARTED_AT = "2026-08-07T00:00:00.000Z";
const GOLDEN_FINISHED_AT = "2026-08-07T00:01:00.000Z";

const LOCAL_TARGET = {
  name: "local-golden",
  canonicalResource: "http://127.0.0.1:3000/mcp",
  supabaseUrl: "http://127.0.0.1:54321",
  expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
} as const;

const HOSTED_TARGET = {
  name: "hosted-golden",
  canonicalResource: "https://mcp.example.test/mcp",
  supabaseUrl: "https://supabase.example.test",
  expectedAuthorizationServer: "https://supabase.example.test/auth/v1",
} as const;

const COMPLETE_VERSIONS = {
  "@modelcontextprotocol/sdk": "1.28.0",
  "@playwright/test": "1.58.1",
  "@supabase/supabase-js": "2.95.2",
  "mcp-handler": "1.1.0",
  "supabase-auth-provider-image": "ghcr.io/supabase/gotrue:v2.192.0",
  "supabase-cli": "2.109.1",
} as const;

const HOSTED_VERSIONS = {
  ...COMPLETE_VERSIONS,
  ...MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS,
} as const;

const GOLDEN_REQUESTS: readonly MinimizedRequestObservation[] = [
  {
    method: "GET",
    url: "http://127.0.0.1:3000/.well-known/oauth-protected-resource",
    requestBodyFields: [],
    authorizationHeaderPresent: false,
    status: 200,
  },
  {
    method: "POST",
    url: "http://127.0.0.1:54321/auth/v1/token",
    requestBodyFields: ["code", "grant_type", "redirect_uri"],
    authorizationHeaderPresent: false,
    requestCodePresent: true,
    requestGrantType: "authorization_code",
    requestRedirectUri: "http://127.0.0.1/oauth/callback",
    status: 200,
  },
];

const HOSTED_REQUESTS: readonly MinimizedRequestObservation[] = [
  {
    method: "GET",
    url: "https://mcp.example.test/.well-known/oauth-protected-resource",
    requestBodyFields: [],
    authorizationHeaderPresent: false,
    status: 200,
  },
  {
    method: "GET",
    url: "https://supabase.example.test/auth/v1/.well-known/oauth-authorization-server",
    requestBodyFields: [],
    authorizationHeaderPresent: false,
    status: 404,
  },
];

// These are intentionally materialized here instead of being read from the
// live catalog. A catalog edit must produce a validation failure, not silently
// rewrite the compatibility contract under test.
const GOLDEN_REQUIRED_GATE_IDS = {
  "public-client": [
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
  ],
  compatibility: [
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
  ],
} as const satisfies Record<CatalogProfileName, readonly string[]>;

const GOLDEN_EXPANDED_GATE_IDS = {
  "public-client": [
    ...GOLDEN_REQUIRED_GATE_IDS["public-client"],
    "public-client-registration-ipv4",
    "public-client-registration-ipv6",
    "registration-negative-validation-ipv4",
    "registration-negative-validation-ipv6",
    "untrusted-client-metadata-ipv4",
    "untrusted-client-metadata-ipv6",
    "authorization-consent-ipv4",
    "authorization-consent-ipv6",
    "consent-denial-ipv4",
    "consent-denial-ipv6",
    "consent-abandonment-ipv4",
    "consent-abandonment-ipv6",
    "consent-cleanup-ipv4",
    "consent-cleanup-ipv6",
    "loopback-ipv4",
    "loopback-ipv6",
    "loopback-request-ipv4",
    "loopback-request-ipv6",
    "loopback-pkce-ipv4",
    "loopback-pkce-ipv6",
    "delegated-token-validation-ipv4",
    "delegated-token-validation-ipv6",
    "authenticated-mcp-operation-ipv4",
    "authenticated-mcp-operation-ipv6",
  ],
  compatibility: [
    ...GOLDEN_REQUIRED_GATE_IDS.compatibility,
    "public-client-registration-ipv4",
    "public-client-registration-ipv6",
    "registration-negative-validation-ipv4",
    "registration-negative-validation-ipv6",
    "untrusted-client-metadata-ipv4",
    "untrusted-client-metadata-ipv6",
    "authorization-consent-ipv4",
    "authorization-consent-ipv6",
    "consent-denial-ipv4",
    "consent-denial-ipv6",
    "consent-abandonment-ipv4",
    "consent-abandonment-ipv6",
    "consent-cleanup-ipv4",
    "consent-cleanup-ipv6",
    "loopback-ipv4",
    "loopback-ipv6",
    "loopback-request-ipv4",
    "loopback-request-ipv6",
    "loopback-pkce-ipv4",
    "loopback-pkce-ipv6",
    "delegated-token-validation-ipv4",
    "delegated-token-validation-ipv6",
    "authenticated-mcp-operation-ipv4",
    "authenticated-mcp-operation-ipv6",
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
  ],
} as const satisfies Record<CatalogProfileName, readonly string[]>;

const GOLDEN_PROFILE_ISSUES = {
  "public-client": "#765",
  compatibility: "#768",
} as const satisfies Record<CatalogProfileName, string>;

type ExpectedCaseStatusTable = Readonly<Record<string, Readonly<Record<string, GateStatus>>>>;

/*
 * This table is deliberately independent from the classifier implementation.
 * It is the reviewable characterization of the current runner decisions.
 */
const EXPECTED_CASE_STATUSES: ExpectedCaseStatusTable = {
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

function goldenTemplateText(classifier: string, status: GateStatus): string {
  return `${classifier}: ${status === "pass" ? "proven" : status === "fail" ? "failed closed" : "not proven"}`;
}

function negativeRegistrationObservation(caseId: string): Parameters<typeof classifyNegativeRegistration>[0] {
  switch (caseId) {
    case "credentials-present":
      return { status: 400, errorCode: "invalid_client_metadata", credentialPresence: "present" };
    case "success-2xx":
      return { status: 201, errorCode: undefined, credentialPresence: "absent" };
    case "recognized-400-metadata-error-without-credentials":
      return { status: 400, errorCode: "invalid_client_metadata", credentialPresence: "absent" };
    case "recognized-422-metadata-error-without-credentials":
      return { status: 422, errorCode: "unsupported_grant_type", credentialPresence: "absent" };
    case "other-response":
      return { status: 503, errorCode: "temporarily_unavailable", credentialPresence: "unknown" };
    default:
      throw new Error(`No negative-registration golden input for ${caseId}`);
  }
}

export interface McpAccessGrantDecisionGolden {
  readonly id: string;
  readonly classifier: string;
  readonly caseId: string;
  readonly status: GateStatus;
  readonly templateFamily: string;
  readonly evidenceProjection: string;
  readonly templateText: string;
  readonly gateIds: readonly string[];
  readonly decisionKeys: readonly string[];
  readonly securitySensitive: boolean;
}

function createDecisionGoldens(): McpAccessGrantDecisionGolden[] {
  return Object.entries(EXPECTED_CASE_STATUSES).flatMap(([classifier, cases]) =>
    Object.entries(cases).map(([caseId, status]) => {
      if (!status) throw new Error(`Missing MCP evidence golden status for ${classifier}:${caseId}`);
      const gateIds = Object.values(MCP_ACCESS_GRANT_CATALOGS.gates)
        .filter((gate) => gate.classifier === classifier)
        .map((gate) => gate.id);
      const decisionKeys = Object.entries(MCP_ACCESS_GRANT_CATALOGS.decisionCases)
        .filter(([, decision]) => decision.classifier === classifier)
        .map(([key]) => key);
      return {
        id: `${classifier}:${caseId}`,
        classifier,
        caseId,
        status,
        templateFamily: classifier,
        evidenceProjection: classifier,
        templateText: goldenTemplateText(classifier, status),
        gateIds,
        decisionKeys,
        securitySensitive: classifier === "negative-registration",
      };
    }),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const MCP_ACCESS_GRANT_DECISION_GOLDENS = deepFreeze(createDecisionGoldens());

type GoldenScenario = "local" | "hosted" | "missing" | "conflict" | "negative-registration" | "family-aggregate";

interface GoldenReportSpec {
  readonly id: string;
  readonly profile: CatalogProfileName;
  readonly scenario: GoldenScenario;
  readonly target: typeof LOCAL_TARGET | typeof HOSTED_TARGET;
  readonly versions: Readonly<Record<string, string>>;
  readonly statuses: Readonly<Record<string, GateStatus>>;
  readonly requests: readonly MinimizedRequestObservation[];
  readonly extraGateIds?: readonly string[];
  readonly conflictGateId?: string;
}

export interface McpAccessGrantGoldenReport {
  readonly id: string;
  readonly profile: CatalogProfileName;
  readonly scenario: GoldenScenario;
  readonly input: FinalizeEvidenceInput;
  readonly context: EvidenceRunContext;
  readonly expectedReport: CompatibilityReport;
  readonly serialized: string;
}

export interface McpAccessGrantGoldenComparison {
  readonly equal: boolean;
  readonly differences: readonly string[];
  readonly securityFollowUpRequired: boolean;
}

export interface McpAccessGrantGoldenValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly securityFollowUpRequired: boolean;
}

function goldenProfileFor(name: CatalogProfileName) {
  return {
    issue: GOLDEN_PROFILE_ISSUES[name],
    requiredGateIds: GOLDEN_REQUIRED_GATE_IDS[name],
    expandedGateIds: GOLDEN_EXPANDED_GATE_IDS[name],
  };
}

function catalogProfileFor(name: CatalogProfileName) {
  return name === "public-client" ? PUBLIC_CLIENT_PROFILE : COMPATIBILITY_PROFILE;
}

function allStatuses(profile: CatalogProfileName, status: GateStatus): Record<string, GateStatus> {
  return Object.fromEntries(
    goldenProfileFor(profile).requiredGateIds.map((id) => [id, id === "sanitized-evidence" ? "pass" : status]),
  );
}

function allExpandedStatuses(profile: CatalogProfileName, status: GateStatus): Record<string, GateStatus> {
  return Object.fromEntries(
    goldenProfileFor(profile).expandedGateIds.map((id) => [id, id === "sanitized-evidence" ? "pass" : status]),
  );
}

function expandedExtras(profile: CatalogProfileName): readonly string[] {
  const golden = goldenProfileFor(profile);
  const requiredGateIds = new Set<string>(golden.requiredGateIds);
  return golden.expandedGateIds.filter((id) => !requiredGateIds.has(id));
}

const REPORT_SPECS: readonly GoldenReportSpec[] = [
  {
    id: "public-client-local-pass",
    profile: "public-client",
    scenario: "local",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: allExpandedStatuses("public-client", "pass"),
    requests: GOLDEN_REQUESTS,
    extraGateIds: expandedExtras("public-client"),
  },
  {
    id: "public-client-hosted-policy",
    profile: "public-client",
    scenario: "hosted",
    target: HOSTED_TARGET,
    versions: HOSTED_VERSIONS,
    statuses: allExpandedStatuses("public-client", "not-proven"),
    requests: HOSTED_REQUESTS,
    extraGateIds: expandedExtras("public-client"),
  },
  {
    id: "public-client-missing",
    profile: "public-client",
    scenario: "missing",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: allStatuses("public-client", "not-proven"),
    requests: [],
  },
  {
    id: "public-client-negative-registration",
    profile: "public-client",
    scenario: "negative-registration",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: {
      ...allStatuses("public-client", "pass"),
      "registration-negative-validation-both": "fail",
    },
    requests: GOLDEN_REQUESTS,
  },
  {
    id: "compatibility-local-pass",
    profile: "compatibility",
    scenario: "local",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: allExpandedStatuses("compatibility", "pass"),
    requests: GOLDEN_REQUESTS,
  },
  {
    id: "compatibility-hosted-policy",
    profile: "compatibility",
    scenario: "hosted",
    target: HOSTED_TARGET,
    versions: HOSTED_VERSIONS,
    statuses: allExpandedStatuses("compatibility", "not-proven"),
    requests: HOSTED_REQUESTS,
    extraGateIds: expandedExtras("compatibility"),
  },
  {
    id: "compatibility-missing",
    profile: "compatibility",
    scenario: "missing",
    target: HOSTED_TARGET,
    versions: HOSTED_VERSIONS,
    statuses: allStatuses("compatibility", "not-proven"),
    requests: [],
  },
  {
    id: "compatibility-conflict",
    profile: "compatibility",
    scenario: "conflict",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: allExpandedStatuses("compatibility", "pass"),
    requests: GOLDEN_REQUESTS,
    conflictGateId: "resource-discovery",
  },
  {
    id: "compatibility-family-aggregate",
    profile: "compatibility",
    scenario: "family-aggregate",
    target: LOCAL_TARGET,
    versions: COMPLETE_VERSIONS,
    statuses: allExpandedStatuses("compatibility", "pass"),
    requests: GOLDEN_REQUESTS,
    extraGateIds: expandedExtras("compatibility"),
  },
];

function contextFor(spec: GoldenReportSpec): EvidenceRunContext {
  return {
    configuredSecrets: [],
    time: { startedAt: GOLDEN_STARTED_AT, finishedAt: GOLDEN_FINISHED_AT },
    versions: spec.versions,
  };
}

function classifierForGate(gateId: string): string {
  const classifier = MCP_ACCESS_GRANT_CATALOGS.gates[gateId]?.classifier;
  if (!classifier) throw new Error(`No classifier for MCP evidence gate ${gateId}`);
  return classifier;
}

function familyAggregateEvidence(status: GateStatus): Record<string, unknown> {
  const familyStatuses = status === "pass"
    ? ["pass", "pass"]
    : status === "fail"
      ? ["fail", "pass"]
      : ["not-proven", "not-proven"];
  return {
    families: [
      { family: "ipv4", status: familyStatuses[0] },
      { family: "ipv6", status: familyStatuses[1] },
    ],
  };
}

function gateObservation(
  gateId: string,
  status: GateStatus,
  scenario: GoldenScenario,
): EvidenceObservation {
  const classifier = classifierForGate(gateId);
  return {
    kind: "gate",
    gateId,
    status,
    detail: goldenTemplateText(classifier, status),
    evidence: classifier === "family-aggregate"
      ? familyAggregateEvidence(status)
      : { observedBoundary: scenario },
  };
}

function requestObservations(requests: readonly MinimizedRequestObservation[]): EvidenceObservation[] {
  return requests.map((request) => ({ kind: "request", request }));
}

function inputFor(spec: GoldenReportSpec): FinalizeEvidenceInput {
  const profile = goldenProfileFor(spec.profile);
  const extraGateIds = spec.extraGateIds ?? [];
  const observations: EvidenceObservation[] = [];

  if (spec.scenario !== "missing") {
    for (const gateId of [...profile.requiredGateIds, ...extraGateIds]) {
      observations.push(gateObservation(
        gateId,
        gateId === "sanitized-evidence" ? "pass" : spec.statuses[gateId] ?? "not-proven",
        spec.scenario,
      ));
    }
    if (spec.conflictGateId) {
      observations.push(gateObservation(spec.conflictGateId, "fail", spec.scenario));
    }
  } else {
    observations.push(gateObservation("sanitized-evidence", "pass", spec.scenario));
  }

  return {
    issue: profile.issue,
    target: spec.target,
    requiredGateIds: profile.requiredGateIds,
    observations: [...observations, ...requestObservations(spec.requests)],
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function serializeGoldenReport(report: CompatibilityReport): string {
  const serializedReport = canonicalize(report) as CompatibilityReport;
  // The verifier bounds arrays before writing evidence; the gate list is the
  // only golden array currently large enough to reach that boundary.
  serializedReport.gates = serializedReport.gates.slice(0, 32);
  const sanitizedEvidenceGate = serializedReport.gates.find(({ id }) => id === "sanitized-evidence");
  if (sanitizedEvidenceGate?.detail === "Evidence was verified in memory without bearer tokens, JWTs, passwords, cookies, or reusable credentials.") {
    sanitizedEvidenceGate.detail = "Evidence was verified in memory without Bearer [REDACTED] JWTs, passwords, cookies, or reusable credentials.";
  }
  for (const gate of serializedReport.gates) {
    if (gate.evidence?.errorKind === "conflicting-observation" && Array.isArray(gate.evidence.observedStatuses)) {
      gate.evidence.observedStatuses = gate.evidence.observedStatuses.map(() => "[REDACTED: depth limit]");
    }
    if (Array.isArray(gate.evidence?.familyResults)) {
      gate.evidence.familyResults = gate.evidence.familyResults.map(() => "[REDACTED: depth limit]");
    }
  }
  return `${JSON.stringify(serializedReport, null, 2)}\n`;
}

function expectedGate(
  gateId: string,
  status: GateStatus,
  scenario: GoldenScenario,
  missing: boolean,
  conflict: boolean,
): CompatibilityReport["gates"][number] {
  const classifier = classifierForGate(gateId);
  if (gateId === "sanitized-evidence") {
    return {
      id: gateId,
      status: "pass",
      detail: "Evidence was verified in memory without bearer tokens, JWTs, passwords, cookies, or reusable credentials.",
      evidence: { artifactFilename: MCP_ACCESS_GRANT_ARTIFACT_NAME },
    };
  }
  if (missing) {
    return {
      id: gateId,
      status: "not-proven",
      detail: "Gate was not reached because an earlier compatibility gate stopped the run.",
      evidence: {
        reached: false,
        observedBoundary: "not-reached",
        errorKind: "missing-observation",
      },
    };
  }
  if (conflict) {
    return {
      id: gateId,
      status: "fail",
      detail: "Conflicting observations were supplied for this gate.",
      evidence: {
        observedStatuses: ["pass", "fail"],
        errorKind: "conflicting-observation",
      },
    };
  }
  return {
    id: gateId,
    status,
    detail: goldenTemplateText(classifierForGate(gateId), status),
    evidence: classifier === "family-aggregate"
      ? { families: "[REDACTED: unexpected field]" }
      : { observedBoundary: scenario },
  };
}

function outcomeFor(gates: readonly CompatibilityReport["gates"][number][]): CompatibilityReport["outcome"] {
  const winningStatus = MCP_ACCESS_GRANT_GOLDEN_OUTCOME_PRECEDENCE.find((status) => gates.some((gate) => gate.status === status));
  return winningStatus === "fail" ? "blocked" : winningStatus === "not-proven" ? "not-proven" : "passed";
}

function expectedReportFor(spec: GoldenReportSpec): CompatibilityReport {
  const profile = goldenProfileFor(spec.profile);
  const extraGateIds = [...(spec.extraGateIds ?? [])].sort((left, right) => left.localeCompare(right));
  const gateIds = [...profile.requiredGateIds, ...extraGateIds];
  const conflictGateId = spec.conflictGateId;
  const gates = gateIds.map((gateId) => expectedGate(
    gateId,
    spec.statuses[gateId] ?? "not-proven",
    spec.scenario,
    spec.scenario === "missing",
    gateId === conflictGateId,
  ));
  return {
    issue: profile.issue,
    outcome: outcomeFor(gates),
    startedAt: GOLDEN_STARTED_AT,
    finishedAt: GOLDEN_FINISHED_AT,
    target: {
      name: spec.target.name,
      canonicalResource: spec.target.canonicalResource,
      supabaseUrl: spec.target.supabaseUrl,
      expectedAuthorizationServer: spec.target.expectedAuthorizationServer,
      ...("loopbackHosts" in spec.target ? { loopbackHosts: [...spec.target.loopbackHosts] } : {}),
    },
    versions: Object.fromEntries(Object.entries(spec.versions).sort(([left], [right]) => left.localeCompare(right))),
    gates,
    requests: spec.requests.map((request) => canonicalize(request) as MinimizedRequestObservation),
  };
}

function createGoldenReport(spec: GoldenReportSpec): McpAccessGrantGoldenReport {
  const input = inputFor(spec);
  const expectedReport = expectedReportFor(spec);
  return deepFreeze({
    id: spec.id,
    profile: spec.profile,
    scenario: spec.scenario,
    input,
    context: contextFor(spec),
    expectedReport,
    serialized: serializeGoldenReport(expectedReport),
  });
}

export const MCP_ACCESS_GRANT_GOLDEN_REPORTS = deepFreeze(REPORT_SPECS.map(createGoldenReport));

function expectedDecisionGoldenKeys(): Set<string> {
  return new Set(MCP_ACCESS_GRANT_DECISION_GOLDENS.map(({ classifier, caseId }) => `${classifier}:${caseId}`));
}

function reportKeyOrder(report: CompatibilityReport): string[] {
  return Object.keys(report);
}

export function validateMcpAccessGrantGoldens(
  reports: readonly McpAccessGrantGoldenReport[],
): McpAccessGrantGoldenValidation {
  const errors: string[] = [];
  let securityFollowUpRequired = false;
  const reportIds = new Set<string>();
  const exercisedClassifiers = new Set<string>();

  for (const report of reports) {
    if (reportIds.has(report.id)) errors.push(`duplicate golden report ${report.id}`);
    reportIds.add(report.id);
    const goldenProfile = goldenProfileFor(report.profile);
    const profile = catalogProfileFor(report.profile);
    if (report.input.issue !== goldenProfile.issue) errors.push(`${report.id} frozen issue identity`);
    if (report.input.requiredGateIds.join("|") !== goldenProfile.requiredGateIds.join("|")) errors.push(`${report.id} frozen required gate order`);
    if (goldenProfile.issue !== profile.issue) errors.push(`${report.id} catalog issue drift`);
    if (goldenProfile.requiredGateIds.join("|") !== profile.requiredGateIds.join("|")) errors.push(`${report.id} catalog required gate drift`);
    if (goldenProfile.expandedGateIds.join("|") !== profile.expandedGateIds.join("|")) errors.push(`${report.id} catalog expanded gate drift`);
    if (MCP_ACCESS_GRANT_GOLDEN_OUTCOME_PRECEDENCE.join("|") !== profile.outcomePrecedence.join("|")) errors.push(`${report.id} catalog outcome precedence drift`);
    if (report.expectedReport.issue !== goldenProfile.issue) errors.push(`${report.id} expected issue identity`);
    if (report.expectedReport.target.name !== report.input.target.name) errors.push(`${report.id} target projection`);
    if (reportKeyOrder(report.expectedReport).join("|") !== ["issue", "outcome", "startedAt", "finishedAt", "target", "versions", "gates", "requests"].join("|")) {
      errors.push(`${report.id} report key order`);
    }
    const serializedKeys = Object.keys(JSON.parse(report.serialized) as Record<string, unknown>);
    if (serializedKeys.join("|") !== MCP_ACCESS_GRANT_GOLDEN_SERIALIZATION_KEY_ORDER.join("|")) {
      errors.push(`${report.id} serialized key order`);
    }
    for (const observation of report.input.observations) {
      if (observation.kind !== "gate") continue;
      const classifier = classifierForGate(observation.gateId);
      exercisedClassifiers.add(classifier);
      if (observation.detail !== goldenTemplateText(classifier, observation.status ?? "not-proven")) {
        errors.push(`${report.id} adapter-authored detail ${observation.gateId}`);
      }
    }
  }

  for (const profile of ["public-client", "compatibility"] as const) {
    if (!reports.some((report) => report.profile === profile && report.scenario === "local")) errors.push(`${profile} local golden missing`);
    if (!reports.some((report) => report.profile === profile && report.scenario === "hosted")) errors.push(`${profile} hosted golden missing`);
    if (!reports.some((report) => report.profile === profile && report.scenario === "missing")) errors.push(`${profile} missing golden missing`);
  }
  if (!reports.some((report) => report.scenario === "conflict")) errors.push("conflict golden missing");
  if (!reports.some((report) => report.scenario === "family-aggregate")) errors.push("family aggregate golden missing");

  const expectedDecisionKeys = new Set(
    Object.entries(EXPECTED_CASE_STATUSES).flatMap(([classifier, cases]) =>
      Object.keys(cases).map((caseId) => `${classifier}:${caseId}`),
    ),
  );
  const catalogDecisionKeys = new Set(
    Object.entries(MCP_ACCESS_GRANT_CATALOGS.classifiers).flatMap(([classifier, definition]) =>
      Object.keys(definition.cases).map((caseId) => `${classifier}:${caseId}`),
    ),
  );
  for (const key of expectedDecisionKeys) if (!catalogDecisionKeys.has(key)) errors.push(`catalog decision case missing ${key}`);
  for (const key of catalogDecisionKeys) if (!expectedDecisionKeys.has(key)) errors.push(`catalog decision case is uncharacterized ${key}`);
  const actualDecisionKeys = expectedDecisionGoldenKeys();
  for (const key of expectedDecisionKeys) if (!actualDecisionKeys.has(key)) errors.push(`decision golden missing ${key}`);
  for (const key of actualDecisionKeys) if (!expectedDecisionKeys.has(key)) errors.push(`decision golden unreferenced ${key}`);

  const catalogTemplateKeys = new Set(Object.keys(MCP_ACCESS_GRANT_CATALOGS.templates));
  const catalogProjectionKeys = new Set(Object.keys(MCP_ACCESS_GRANT_CATALOGS.projections));
  const decisionTemplateKeys = new Set(MCP_ACCESS_GRANT_DECISION_GOLDENS.map(({ templateFamily }) => templateFamily));
  const decisionProjectionKeys = new Set(MCP_ACCESS_GRANT_DECISION_GOLDENS.map(({ evidenceProjection }) => evidenceProjection));
  for (const key of catalogTemplateKeys) {
    if (!decisionTemplateKeys.has(key)) errors.push(`template is unreferenced ${key}`);
  }
  for (const key of decisionTemplateKeys) {
    if (!catalogTemplateKeys.has(key)) errors.push(`template is unknown ${key}`);
  }
  for (const key of catalogProjectionKeys) {
    if (!decisionProjectionKeys.has(key)) errors.push(`projection is unreferenced ${key}`);
  }
  for (const key of decisionProjectionKeys) {
    if (!catalogProjectionKeys.has(key)) errors.push(`projection is unknown ${key}`);
  }
  for (const key of catalogTemplateKeys) {
    if (!exercisedClassifiers.has(key)) errors.push(`template is not exercised by a report ${key}`);
  }
  for (const key of catalogProjectionKeys) {
    if (!exercisedClassifiers.has(key)) errors.push(`projection is not exercised by a report ${key}`);
  }

  for (const golden of MCP_ACCESS_GRANT_DECISION_GOLDENS) {
    const classifier = MCP_ACCESS_GRANT_CATALOGS.classifiers[golden.classifier];
    const template = MCP_ACCESS_GRANT_CATALOGS.templates[golden.templateFamily];
    if (!classifier?.cases[golden.caseId]) errors.push(`unknown decision case ${golden.id}`);
    if (!template?.cases.includes(golden.caseId)) errors.push(`template case is not registered ${golden.id}`);
    if (template?.text[golden.status] !== golden.templateText) errors.push(`template wording drift ${golden.id}`);
    if (golden.classifier === "negative-registration") {
      const observed = classifyNegativeRegistration(negativeRegistrationObservation(golden.caseId));
      if (observed !== golden.status) {
        securityFollowUpRequired = true;
        errors.push(`security follow-up required for negative-registration golden ${golden.id}`);
      }
    }
  }

  for (const [classifier, statuses] of Object.entries(EXPECTED_CASE_STATUSES)) {
    const catalogCases = MCP_ACCESS_GRANT_CATALOGS.classifiers[classifier]?.cases ?? {};
    for (const caseId of Object.keys(statuses)) {
      if (!catalogCases[caseId]) errors.push(`decision status is unreferenced ${classifier}:${caseId}`);
    }
  }

  const hostedReport = reports.find(({ scenario }) => scenario === "hosted");
  if (hostedReport?.expectedReport.target.loopbackHosts !== undefined) {
    errors.push("hosted target loopback hosts must be omitted");
  }
  if (hostedReport?.expectedReport.versions["supabase-auth-provider-image"] !== MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS["supabase-auth-provider-image"]) {
    errors.push("hosted provider image sentinel drift");
  }
  if (hostedReport?.expectedReport.versions["supabase-hosted-provider-version"] !== MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS["supabase-hosted-provider-version"]) {
    errors.push("hosted provider version sentinel drift");
  }

  const recipeKeys = new Set(Object.keys(MCP_ACCESS_GRANT_CATALOGS.requestRecipes));
  const goldenRecipeKeys = new Set(MCP_ACCESS_GRANT_DECISION_GOLDENS.flatMap(({ decisionKeys }) => decisionKeys));
  for (const key of recipeKeys) if (!goldenRecipeKeys.has(key)) errors.push(`decision golden does not exercise recipe ${key}`);
  for (const key of goldenRecipeKeys) if (!recipeKeys.has(key)) errors.push(`decision golden references unknown recipe ${key}`);

  return { valid: errors.length === 0, errors, securityFollowUpRequired };
}

function goldenDifference(actual: CompatibilityReport, expected: CompatibilityReport, serialized: string, expectedSerialized: string): string[] {
  const differences: string[] = [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push("report bytes differ");
  if (serialized !== expectedSerialized) differences.push("serialized artifact bytes differ");
  return differences;
}

export function compareMcpAccessGrantGolden(
  golden: McpAccessGrantGoldenReport,
): McpAccessGrantGoldenComparison {
  const actual = finalizeEvidence(golden.input, golden.context);
  const differences = goldenDifference(actual.report, golden.expectedReport, actual.verification.serialized, golden.serialized);
  const actualNegativeStatus = actual.report.gates.find(({ id }) => id === "registration-negative-validation-both")?.status;
  const expectedNegativeStatus = golden.expectedReport.gates.find(({ id }) => id === "registration-negative-validation-both")?.status;
  const securityFollowUpRequired = golden.scenario === "negative-registration" && actualNegativeStatus !== expectedNegativeStatus;
  return {
    equal: differences.length === 0,
    differences,
    securityFollowUpRequired,
  };
}
