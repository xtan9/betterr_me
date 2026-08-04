import {
  evaluateDelegatedJwtPolicy,
  isExactCanonicalResource,
  matchesS256CodeChallenge,
  publicBoundaryRejects,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
  type DelegatedJwtPolicy,
} from "./mcp-access-grant-policy";

export type GateStatus = "pass" | "fail" | "not-proven";
export type CompatibilityOutcome = "passed" | "blocked" | "not-proven";

export const EVIDENCE_ARTIFACT_FILENAME = "mcp-access-grant-evidence.json";

export interface CompatibilityGate {
  id: string;
  status: GateStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface CompatibilityReportTarget {
  name: string;
  canonicalResource: string;
  supabaseUrl: string;
  expectedAuthorizationServer: string;
  loopbackHosts?: readonly string[];
}

export interface CompatibilityReport {
  issue: string;
  outcome: CompatibilityOutcome;
  startedAt: string;
  finishedAt: string;
  target: CompatibilityReportTarget;
  versions: Record<string, string>;
  gates: CompatibilityGate[];
  requests: MinimizedRequestObservation[];
}

export interface EvidenceRunContext {
  readonly configuredSecrets: readonly string[];
  readonly time: {
    readonly startedAt: string;
    readonly finishedAt: string;
  };
  readonly versions: Readonly<Record<string, string>>;
}

export interface MinimizedRequestObservation {
  readonly method: string;
  readonly url: string;
  readonly requestBodyFields: readonly string[];
  readonly authorizationHeaderPresent: boolean;
  readonly requestClientIdPresent?: boolean;
  readonly requestClientId?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeVerifierMatchesChallenge?: boolean;
  readonly requestCodeVerifierHash?: string;
  readonly status?: number;
  readonly responseLocation?: string;
  readonly responseBody?: Readonly<Record<string, unknown>>;
  readonly responseCredentialFields?: readonly string[];
  readonly responseContainsCredentials?: boolean;
  readonly networkError?: string;
}

export type EvidenceErrorKind =
  | "missing-observation"
  | "malformed-observation"
  | "conflicting-observation"
  | "secret-leak"
  | "unsupported-observation";

export interface EvidenceError {
  readonly kind: EvidenceErrorKind;
  readonly code?: string;
}

interface BaseObservation {
  readonly gateId: string;
  readonly detail?: unknown;
  readonly evidence?: unknown;
  readonly error?: EvidenceError;
}

export interface GateObservation extends BaseObservation {
  readonly kind: "gate";
  readonly status?: GateStatus;
}

export interface DelegatedJwtObservation extends BaseObservation {
  readonly kind: "delegated-jwt";
  readonly header: DelegatedJwtHeader;
  readonly claims: DelegatedJwtClaims;
  readonly policy: DelegatedJwtPolicy;
  readonly signingKeys?: readonly DelegatedJwk[];
  readonly signatureValid: boolean;
}

export interface PublicBoundaryObservation extends BaseObservation {
  readonly kind: "public-boundary";
  readonly status?: number;
  readonly responseContainsCredentials: boolean;
}

export interface PkceObservation extends BaseObservation {
  readonly kind: "pkce";
  readonly verifier?: string;
  readonly challenge?: string;
  readonly method?: string;
}

export interface ResourceBindingObservation extends BaseObservation {
  readonly kind: "resource-binding";
  readonly canonicalResource: string;
  readonly observedResource?: string;
}

export interface RequestObservation {
  readonly kind: "request";
  readonly request: MinimizedRequestObservation;
}

export type EvidenceObservation =
  | GateObservation
  | DelegatedJwtObservation
  | PublicBoundaryObservation
  | PkceObservation
  | ResourceBindingObservation
  | RequestObservation;

export interface FinalizeEvidenceInput {
  readonly issue: string;
  readonly target: CompatibilityReportTarget;
  readonly requiredGateIds: readonly string[];
  readonly observations: readonly EvidenceObservation[];
}

export interface SanitizedValue {
  readonly value: unknown;
  readonly secretLeak: boolean;
}

export interface EvidenceVerification {
  readonly sanitized: boolean;
  readonly serialized: string;
  readonly secretLeak: boolean;
  readonly diagnostics: readonly string[];
}

export interface FinalizedEvidence {
  readonly report: CompatibilityReport;
  readonly verification: EvidenceVerification;
}

const MAX_DIAGNOSTIC_LENGTH = 500;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 32;
const MAX_OBJECT_KEYS = 64;
const SAFE_KEYS = new Set([
  "issue", "outcome", "startedAt", "finishedAt", "target", "gates", "requests", "id", "status", "detail", "evidence",
  "name", "canonicalResource", "supabaseUrl", "expectedAuthorizationServer", "loopbackHosts", "artifactFilename", "errorKind",
  "errorCode", "observedStatuses", "authorizationHeaderPresent", "requestClientId", "networkError", "requestCodeVerifierHash",
  "accepted", "advertisedAuthorizationServer", "advertisedResource", "algorithmAllowed", "authorizationEndpoint",
  "authorizationServers", "authorization_code", "callbackReceived", "client", "clientId", "clientIdPresent",
  "clientName", "clientSecretReturned", "codeChallengeMethodsSupported", "contentType", "createdAt", "error",
  "errorCode", "errorDescription", "expectedAuthorizationServer", "expectedIssuer", "expectedKeyId", "expiresIn",
  "failure", "failures", "grantEndpointObserved", "grantTypes", "grantTypesSupported", "grantedAt", "httpStatus",
  "issuer", "jwksUri", "keyIdPresent", "keyType", "method", "observedBoundary", "observedResource", "outcome",
  "publicTokenAuthentication", "redirectUris", "registrationEndpoint", "registrationType", "requestBodyFields",
  "requestCodeChallengeMethod", "requestCodeChallengePresent", "requestCodePresent", "requestClientIdPresent",
  "requestGrantType", "requestRedirectUri", "requestResource", "requestCodeVerifierMatchesChallenge", "responseBody",
  "responseCredentialFields", "responseContainsCredentials", "responseLocation", "responseTypes", "responseTypesSupported",
  "resource", "scopes", "scopesSupported", "scope", "signatureValid", "status", "supportedGrantTypes", "url",
  "supportedRedirects", "supportedResponseTypes", "tokenEndpoint", "tokenEndpointAuthMethodsSupported", "tokenType",
  "untrustedDisclaimerVisible", "valid", "version", "versions", "reached", "checks", "keyIdPresent", "timeBoundsValid",
  "issuerMatches", "subjectPresent", "audienceMatches", "clientContextMatches", "grantContextMatches", "resourceContextMatches",
]);
const SENSITIVE_KEY = /^(?:access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|secret|token|code)$/i;
const SENSITIVE_TEXT = /(access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|secret|token|code)\s*[:=]/i;
const UNSAFE_CREDENTIAL = /Bearer\s+(?!\[REDACTED\])[^\s]+|\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|"(?:access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|code)"\s*:\s*"(?!\[REDACTED\])[^\"]+"|(?:access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|code)\s*=\s*(?!\[REDACTED\])[^&\s,}]+/i;

function cloneAndFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) cloneAndFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createEvidenceRunContext(input: EvidenceRunContext): EvidenceRunContext {
  return cloneAndFreeze({
    configuredSecrets: [...input.configuredSecrets],
    time: { startedAt: input.time.startedAt, finishedAt: input.time.finishedAt },
    versions: { ...input.versions },
  });
}

function redactText(value: string, secrets: readonly string[]): { value: string; secretLeak: boolean } {
  let result = value;
  let secretLeak = false;
  for (const secret of secrets) {
    if (!secret) continue;
    if (result.includes(secret)) secretLeak = true;
    result = result.split(secret).join("[REDACTED]");
  }
  result = result
    .replace(/(access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|secret|token|code)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/([?&](?:code|state|client_id|code_challenge)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/("(?:access_token|refresh_token|id_token|client_secret|code_verifier|password|cookie|authorization|secret|token|code)"\s*:\s*")[^"]*(")/gi, "$1[REDACTED]$2")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT REDACTED]");
  return { value: result.slice(0, MAX_DIAGNOSTIC_LENGTH), secretLeak };
}

function sanitizeValue(value: unknown, context: EvidenceRunContext, depth = 0): SanitizedValue {
  if (depth > MAX_DEPTH) return { value: "[REDACTED: depth limit]", secretLeak: false };
  if (typeof value === "string") {
    const result = redactText(value, context.configuredSecrets);
    return { value: result.value, secretLeak: result.secretLeak };
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return { value, secretLeak: false };
  if (Array.isArray(value)) {
    const secretLeak = false;
    const sanitized = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, context, depth + 1));
    return { value: sanitized.map((item) => item.value), secretLeak: secretLeak || sanitized.some((item) => item.secretLeak) };
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    let secretLeak = false;
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      const keyIsSensitive = SENSITIVE_KEY.test(key);
      const itemResult = sanitizeValue(item, context, depth + 1);
      const alreadyRedacted = typeof itemResult.value === "string" && /^\[(?:REDACTED|JWT REDACTED)/.test(itemResult.value);
      secretLeak ||= itemResult.secretLeak;
      if (keyIsSensitive && !alreadyRedacted) secretLeak = true;
      result[key] = SAFE_KEYS.has(key) || !keyIsSensitive ? itemResult.value : "[REDACTED]";
      if (!SAFE_KEYS.has(key) && !keyIsSensitive) result[key] = "[REDACTED: unexpected field]";
    }
    return { value: result, secretLeak };
  }
  return { value: "[REDACTED: unsupported value]", secretLeak: true };
}

export function sanitizeEvidence(value: unknown, context: EvidenceRunContext): SanitizedValue {
  return sanitizeValue(value, context);
}

function detailText(detail: unknown, context: EvidenceRunContext): { value: string; secretLeak: boolean } {
  const result = sanitizeValue(typeof detail === "string" ? detail : detail === undefined ? "" : String(detail), context);
  return { value: typeof result.value === "string" ? result.value : "[REDACTED]", secretLeak: result.secretLeak };
}

function statusForError(error: EvidenceError | undefined): GateStatus | undefined {
  if (!error) return undefined;
  return error.kind === "missing-observation" || error.kind === "unsupported-observation" ? "not-proven" : "fail";
}

function gateFromObservation(observation: BaseObservation & { status?: GateStatus }, context: EvidenceRunContext): { gate: CompatibilityGate; secretLeak: boolean } {
  const detail = detailText(observation.detail, context);
  const sanitizedEvidence = sanitizeEvidence(observation.evidence ?? {}, context);
  const errorStatus = statusForError(observation.error);
  const status = errorStatus ?? observation.status ?? "not-proven";
  const missingStatus = !errorStatus && !observation.status;
  const finalStatus = missingStatus ? "not-proven" : status;
  const evidence = {
    ...(sanitizedEvidence.value && typeof sanitizedEvidence.value === "object" ? sanitizedEvidence.value as Record<string, unknown> : {}),
    ...(observation.error ? { errorKind: observation.error.kind, ...(observation.error.code ? { errorCode: observation.error.code } : {}) } : {}),
  };
  if (missingStatus) evidence.errorKind = "missing-observation";
  return {
    gate: { id: observation.gateId, status: finalStatus, detail: detail.value, ...(Object.keys(evidence).length ? { evidence } : {}) },
    secretLeak: detail.secretLeak || sanitizedEvidence.secretLeak,
  };
}

export class GateAccumulator {
  private readonly gates = new Map<string, CompatibilityGate>();
  private readonly conflicts = new Set<string>();

  constructor(initial: readonly CompatibilityGate[] = []) {
    for (const gate of initial) this.add(gate);
  }

  add(gate: CompatibilityGate): void {
    const existing = this.gates.get(gate.id);
    if (!existing) {
      this.gates.set(gate.id, { ...gate, ...(gate.evidence ? { evidence: { ...gate.evidence } } : {}) });
      return;
    }
    if (existing.status !== gate.status) {
      this.conflicts.add(gate.id);
      this.gates.set(gate.id, {
        id: gate.id,
        status: "fail",
        detail: "Conflicting observations were supplied for this gate.",
        evidence: { errorKind: "conflicting-observation", observedStatuses: [existing.status, gate.status] },
      });
      return;
    }
    if (!this.conflicts.has(gate.id)) this.gates.set(gate.id, gate);
  }

  snapshot(requiredGateIds: readonly string[]): CompatibilityGate[] {
    const required = [...new Set(requiredGateIds)];
    for (const id of required) {
      if (!this.gates.has(id)) {
        this.gates.set(id, {
          id,
          status: "not-proven",
          detail: "Gate was not reached because an earlier compatibility gate stopped the run.",
          evidence: { errorKind: "missing-observation", reached: false, observedBoundary: "not-reached" },
        });
      }
    }
    const order = new Map(required.map((id, index) => [id, index]));
    return [...this.gates.values()]
      .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
      .map((gate) => ({ ...gate, ...(gate.evidence ? { evidence: { ...gate.evidence } } : {}) }));
  }
}

export function accumulateGate(
  gates: readonly CompatibilityGate[],
  gate: CompatibilityGate,
): CompatibilityGate[] {
  const accumulator = new GateAccumulator(gates);
  accumulator.add(gate);
  return accumulator.snapshot([]);
}

function evaluateObservation(observation: EvidenceObservation, context: EvidenceRunContext): { gate?: CompatibilityGate; request?: MinimizedRequestObservation; secretLeak: boolean } {
  if (observation.kind === "request") {
    const sanitized = sanitizeEvidence(observation.request, context);
    return { request: sanitized.value as MinimizedRequestObservation, secretLeak: sanitized.secretLeak };
  }
  if (observation.kind === "gate") return { ...gateFromObservation(observation, context) };
  if (observation.kind === "delegated-jwt") {
    const policyResult = evaluateDelegatedJwtPolicy(observation.header, observation.claims, observation.policy);
    const keyResult = observation.signingKeys
      ? selectDelegatedSigningJwk(observation.header, observation.signingKeys)
      : { ok: true as const };
    const valid = observation.signatureValid && policyResult.valid && keyResult.ok;
    const evidence = {
      valid,
      signatureValid: observation.signatureValid,
      failures: policyResult.failures,
      checks: policyResult.checks,
      ...(keyResult.ok ? {} : { failure: keyResult.reason }),
    };
    const result = gateFromObservation({
      ...observation,
      status: valid ? "pass" : "fail",
      evidence: { ...(observation.evidence as Record<string, unknown> | undefined), ...evidence },
    }, context);
    return result;
  }
  if (observation.kind === "public-boundary") {
    const status = observation.status === undefined
      ? undefined
      : publicBoundaryRejects(observation.status, observation.responseContainsCredentials) ? "pass" : "fail";
    return gateFromObservation({
      ...observation,
      status,
      error: status === undefined ? { kind: "missing-observation" } : observation.error,
      evidence: { ...(observation.evidence as Record<string, unknown> | undefined), httpStatus: observation.status, responseContainsCredentials: observation.responseContainsCredentials },
    }, context);
  }
  if (observation.kind === "pkce") {
    const status = matchesS256CodeChallenge(observation.verifier, observation.challenge, observation.method) ? "pass" : "fail";
    return gateFromObservation({ ...observation, status }, context);
  }
  const status = observation.observedResource !== undefined && isExactCanonicalResource(observation.canonicalResource, observation.observedResource)
    ? "pass"
    : "fail";
  return gateFromObservation({ ...observation, status }, context);
}

function targetForReport(target: CompatibilityReportTarget, context: EvidenceRunContext): { target: CompatibilityReportTarget; secretLeak: boolean } {
  const sanitized = sanitizeEvidence(target, context);
  return { target: sanitized.value as CompatibilityReportTarget, secretLeak: sanitized.secretLeak };
}

export function verifyEvidence(report: CompatibilityReport, context: EvidenceRunContext): EvidenceVerification {
  const sanitizedValue = sanitizeEvidence(report, context);
  const serialized = `${JSON.stringify(sanitizedValue.value, null, 2)}\n`;
  const diagnostics: string[] = [];
  if (sanitizedValue.secretLeak) diagnostics.push("Configured secret material was observed and redacted.");
  if (SENSITIVE_TEXT.test(serialized)) diagnostics.push("Sensitive diagnostic text was redacted or contained an unexpected credential field.");
  const isSanitized = !sanitizedValue.secretLeak && !UNSAFE_CREDENTIAL.test(serialized);
  return { sanitized: isSanitized, serialized, secretLeak: !isSanitized, diagnostics };
}

export function isEvidenceSanitized(serialized: string, configuredSecrets: readonly string[] = []): boolean {
  const context = createEvidenceRunContext({
    configuredSecrets,
    time: { startedAt: "", finishedAt: "" },
    versions: {},
  });
  return !UNSAFE_CREDENTIAL.test(serialized) && !sanitizeEvidence(serialized, context).secretLeak;
}

export function finalizeEvidence(input: FinalizeEvidenceInput, contextInput: EvidenceRunContext): FinalizedEvidence {
  const context = createEvidenceRunContext(contextInput);
  const accumulator = new GateAccumulator();
  const requests: MinimizedRequestObservation[] = [];
  let secretLeak = false;
  for (const observation of input.observations) {
    const result = evaluateObservation(observation, context);
    secretLeak ||= result.secretLeak;
    if (result.gate) accumulator.add(result.gate);
    if (result.request) requests.push(result.request);
  }
  const target = targetForReport(input.target, context);
  const versions = sanitizeVersions(context);
  secretLeak ||= target.secretLeak;
  secretLeak ||= versions.secretLeak;
  const baseReport: CompatibilityReport = {
    issue: input.issue,
    outcome: "not-proven",
    startedAt: context.time.startedAt,
    finishedAt: context.time.finishedAt,
    target: baseTarget(target.target),
    versions: versions.versions,
    gates: accumulator.snapshot(input.requiredGateIds.filter((id) => id !== "sanitized-evidence")),
    requests,
  };
  let report = { ...baseReport, gates: [...baseReport.gates] };
  const firstVerification = verifyEvidence(report, context);
  if (input.requiredGateIds.includes("sanitized-evidence")) {
    accumulator.add({
      id: "sanitized-evidence",
      status: secretLeak || !firstVerification.sanitized ? "fail" : "pass",
      detail: secretLeak || !firstVerification.sanitized
        ? "Evidence could not be proven free of bearer tokens, JWTs, passwords, cookies, or reusable credentials."
        : "Evidence was verified in memory without bearer tokens, JWTs, passwords, cookies, or reusable credentials.",
      evidence: { ...(secretLeak ? { errorKind: "secret-leak" } : {}), artifactFilename: EVIDENCE_ARTIFACT_FILENAME },
    });
    report = { ...report, gates: accumulator.snapshot(input.requiredGateIds) };
  }
  const outcome: CompatibilityOutcome = report.gates.some((gate) => gate.status === "fail")
    ? "blocked"
    : report.gates.some((gate) => gate.status === "not-proven")
      ? "not-proven"
      : "passed";
  report = { ...report, outcome };
  const verification = verifyEvidence(report, context);
  return { report, verification: secretLeak ? { ...verification, secretLeak: true, sanitized: false } : verification };
}

export function finalizeReport(input: FinalizeEvidenceInput, context: EvidenceRunContext): CompatibilityReport {
  return finalizeEvidence(input, context).report;
}

export function createEvidenceKernel(contextInput: EvidenceRunContext) {
  const context = createEvidenceRunContext(contextInput);
  return {
    context,
    accumulateGate,
    sanitizeEvidence: (value: unknown) => sanitizeEvidence(value, context),
    verifyEvidence: (report: CompatibilityReport) => verifyEvidence(report, context),
    finalizeEvidence: (input: FinalizeEvidenceInput) => finalizeEvidence(input, context),
    finalizeReport: (input: FinalizeEvidenceInput) => finalizeReport(input, context),
  } as const;
}

function baseTarget(target: CompatibilityReportTarget): CompatibilityReportTarget {
  return {
    name: target.name,
    canonicalResource: target.canonicalResource,
    supabaseUrl: target.supabaseUrl,
    expectedAuthorizationServer: target.expectedAuthorizationServer,
    ...(target.loopbackHosts ? { loopbackHosts: [...target.loopbackHosts] } : {}),
  };
}

function sanitizeVersions(context: EvidenceRunContext): { versions: Record<string, string>; secretLeak: boolean } {
  const result: Record<string, string> = {};
  let secretLeak = false;
  for (const key of Object.keys(context.versions).sort()) {
    const sanitized = sanitizeEvidence(context.versions[key], context);
    const value = sanitized.value;
    secretLeak ||= sanitized.secretLeak;
    result[key] = typeof value === "string" ? value : "[REDACTED]";
  }
  return { versions: result, secretLeak };
}
