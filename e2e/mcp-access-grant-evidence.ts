import {
  evaluateDelegatedJwtPolicy,
  isExactCanonicalResource,
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
  readonly verifierMatchesChallenge?: boolean;
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
  readonly artifactWriteSucceeded?: boolean;
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
  "access_token", "refresh_token", "id_token", "client_secret", "code_verifier", "password", "cookie", "authorization", "code",
  "client_uri", "logo_uri", "software_id", "software_version", "error_code", "error_description", "grant_types_supported",
  "response_types_supported", "token_endpoint_auth_method", "token_endpoint_auth_methods_supported", "registration_endpoint",
  "redirect_uris", "authorization_endpoint", "jwks_uri", "token_endpoint", "updated_at", "msg", "client_type", "created_at",
  "scopes_supported", "scope", "logoUri", "clientUri", "softwareId", "softwareVersion", "requestTimeCallbackUrl",
  "hasProviderCredentials", "hasProviderClientKey", "resourceMetadataUrl", "authorizationServerCount",
  "registrationObserved", "registeredTokenEndpointAuthMethod", "registeredGrantTypes", "registeredResponseTypes",
  "registeredRedirectUris", "tokenRequestObserved", "grantType", "redirectUri", "resourceMatchesCanonical",
  "codeVerifierMatchesChallenge", "jwksFetched", "jwksStatus", "jwksKeyMatched", "signatureAlgorithm",
  "localVerification", "providerValidationRoundTrip", "operationResourceMatches", "operationUrl", "resultIsError",
  "tool", "replacementCredentialsStored", "initialTokens", "firstReplacement", "secondReplacement", "replacementOperation",
  "previous", "replacement", "providerReturnedAccessToken", "providerReturnedRefreshToken", "accessTokenChanged",
  "refreshTokenChanged", "tokenEndpointStatus", "succeeded", "tokenSummary", "errorDetail", "requestStatuses",
  "rootReplayDetected", "everyIssuedDescendantRejected", "familyMemberCountExercised", "familyResults", "grantCount",
  "registeredClientIdPresent", "grant", "grantStatus", "grantRevoked", "grantIdentified", "revokeEndpointObserved", "requestStatus",
  "accessTokenHasIssuedAt", "accessTokenHasExpiry", "documentedLifetimeSeconds", "secondsRemaining", "withinDocumentedLifetime",
  "operationStatus", "accessTokenLifetime", "cases", "id", "responseType", "callbackHost", "callbackPath",
  "tokenRequestObserved", "initial", "firstDescendant", "secondDescendant", "familyResults", "grantRevoked",
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

function sanitizeVersionMap(value: unknown, context: EvidenceRunContext, depth: number): SanitizedValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return sanitizeValue(value, context, depth + 1);
  }
  const result: Record<string, unknown> = {};
  let secretLeak = false;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_OBJECT_KEYS)) {
    const sanitized = sanitizeValue(item, context, depth + 1);
    result[key] = sanitized.value;
    secretLeak ||= sanitized.secretLeak;
  }
  return { value: result, secretLeak };
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
      if (key === "versions") {
        const versions = sanitizeVersionMap(item, context, depth);
        result[key] = versions.value;
        secretLeak ||= versions.secretLeak;
        continue;
      }
      const keyIsSensitive = SENSITIVE_KEY.test(key);
      const itemResult = sanitizeValue(item, context, depth + 1);
      const alreadyRedacted = typeof itemResult.value === "string" && /^\[(?:REDACTED|JWT REDACTED)/.test(itemResult.value);
      secretLeak ||= itemResult.secretLeak;
      if (keyIsSensitive && !alreadyRedacted) secretLeak = true;
      result[key] = keyIsSensitive
        ? alreadyRedacted ? itemResult.value : "[REDACTED]"
        : SAFE_KEYS.has(key) ? itemResult.value : "[REDACTED: unexpected field]";
    }
    return { value: result, secretLeak };
  }
  return { value: "[REDACTED: unsupported value]", secretLeak: true };
}

export function sanitizeEvidence(value: unknown, context: EvidenceRunContext): SanitizedValue {
  return sanitizeValue(value, context);
}

/**
 * Minimize a live response before it becomes an inert request observation.
 * The adapters must not hand raw provider payloads to the evidence boundary.
 */
export function minimizeResponseBody(text: string, contentType: string | null): Record<string, unknown> | undefined {
  if (!text) return undefined;
  if (contentType?.includes("json")) {
    try {
      const sanitized = sanitizeEvidence(
        JSON.parse(text),
        createEvidenceRunContext({
          configuredSecrets: [],
          time: { startedAt: "", finishedAt: "" },
          versions: {},
        }),
      );
      return sanitized.value && typeof sanitized.value === "object" && !Array.isArray(sanitized.value)
        ? sanitized.value as Record<string, unknown>
        : { type: Array.isArray(sanitized.value) ? "array" : typeof sanitized.value };
    } catch {
      return { body: "[REDACTED NON-JSON RESPONSE]" };
    }
  }
  return { contentType: contentType ?? "unknown", body: "[REDACTED RESPONSE BODY]" };
}

export function sanitizeText(value: string, context?: EvidenceRunContext): string {
  const effectiveContext = context ?? createEvidenceRunContext({
    configuredSecrets: [],
    time: { startedAt: "", finishedAt: "" },
    versions: {},
  });
  return redactText(value, effectiveContext.configuredSecrets).value;
}

export function sanitizeUrl(value: string | URL, context?: EvidenceRunContext): string {
  const effectiveContext = context ?? createEvidenceRunContext({
    configuredSecrets: [],
    time: { startedAt: "", finishedAt: "" },
    versions: {},
  });
  try {
    const url = new URL(value.toString());
    const safeQueryKeys = new Set([
      "code_challenge_method", "grant_type", "redirect_uri", "response_type", "resource", "scope",
    ]);
    const query = new URLSearchParams();
    for (const [key, queryValue] of url.searchParams) {
      query.set(
        key,
        safeQueryKeys.has(key)
          ? key === "redirect_uri" || key === "resource"
            ? sanitizeUrl(queryValue, effectiveContext)
            : sanitizeText(queryValue, effectiveContext)
          : "[REDACTED]",
      );
    }
    const queryText = query.toString();
    return `${url.origin}${url.pathname}${queryText ? `?${queryText}` : ""}`;
  } catch {
    return sanitizeText(value.toString(), effectiveContext).replace(/([?&](?:code|state|client_id|code_challenge)=[^&]+)/gi, "$1=[REDACTED]");
  }
}

export interface ConsentPresentationObservation {
  readonly clientNameVisible: boolean;
  readonly clientUriVisible: boolean;
  readonly logoVisible: boolean;
  readonly softwareIdVisible: boolean;
  readonly softwareVersionVisible: boolean;
  readonly untrustedDisclaimerVisible: boolean;
  readonly endorsementLanguageVisible: boolean;
  readonly affirmativeControlVisible: boolean;
  readonly denialControlVisible: boolean;
  readonly callbackBeforeDecision: boolean;
}

export function classifyConsentPresentation(observation: ConsentPresentationObservation): GateStatus {
  return observation.clientNameVisible &&
    observation.clientUriVisible &&
    observation.logoVisible &&
    observation.softwareIdVisible &&
    observation.softwareVersionVisible &&
    observation.untrustedDisclaimerVisible &&
    !observation.endorsementLanguageVisible &&
    observation.affirmativeControlVisible &&
    observation.denialControlVisible &&
    !observation.callbackBeforeDecision
    ? "pass"
    : "fail";
}

export interface AuthorizationOutcomeObservation {
  readonly kind: "denial" | "abandonment";
  readonly callbackReceived: boolean;
  readonly authorizationError: boolean;
  readonly stateMatches?: boolean;
  readonly authorizationCodePresent: boolean;
  readonly tokenRequestObserved: boolean;
  readonly accessTokenObserved: boolean;
  readonly refreshTokenObserved: boolean;
  readonly idTokenObserved?: boolean;
  readonly browserFragmentCredentialObserved?: boolean;
}

export function classifyAuthorizationOutcome(observation: AuthorizationOutcomeObservation): GateStatus {
  const credentialObserved = observation.authorizationCodePresent ||
    observation.tokenRequestObserved ||
    observation.accessTokenObserved ||
    observation.refreshTokenObserved ||
    Boolean(observation.idTokenObserved) ||
    Boolean(observation.browserFragmentCredentialObserved);
  if (credentialObserved) return "fail";
  if (observation.kind === "denial") {
    return observation.callbackReceived && observation.authorizationError && observation.stateMatches === true ? "pass" : "fail";
  }
  return observation.callbackReceived ? "fail" : "pass";
}

export interface BrowserUrlCredentialEvidence {
  readonly credentialObserved: boolean;
  readonly authorizationCodePresent: boolean;
  readonly accessTokenPresent: boolean;
  readonly refreshTokenPresent: boolean;
  readonly idTokenPresent: boolean;
  readonly fragmentKeys: readonly string[];
}

export function browserUrlCredentialEvidence(value: string): BrowserUrlCredentialEvidence {
  try {
    const fragment = new URLSearchParams(new URL(value).hash.replace(/^#/, ""));
    const authorizationCodePresent = fragment.has("code");
    const accessTokenPresent = fragment.has("access_token");
    const refreshTokenPresent = fragment.has("refresh_token");
    const idTokenPresent = fragment.has("id_token");
    return {
      credentialObserved: authorizationCodePresent || accessTokenPresent || refreshTokenPresent || idTokenPresent,
      authorizationCodePresent,
      accessTokenPresent,
      refreshTokenPresent,
      idTokenPresent,
      fragmentKeys: [...fragment.keys()].filter((key) => /^(code|access_token|refresh_token|id_token)$/i.test(key)),
    };
  } catch {
    return { credentialObserved: false, authorizationCodePresent: false, accessTokenPresent: false, refreshTokenPresent: false, idTokenPresent: false, fragmentKeys: [] };
  }
}

export function classifyPublicRegistrationBoundary(
  registrationObserved: boolean,
  validationAccepted: boolean,
  statusCode: number | undefined,
  networkError: string | undefined,
): GateStatus {
  if (registrationObserved && validationAccepted) return "pass";
  if (!registrationObserved || statusCode === undefined || networkError || statusCode >= 500 || statusCode < 200 || statusCode >= 600) return "not-proven";
  return "fail";
}

export function isRegistrationMetadataError(observedError: unknown): boolean {
  return typeof observedError === "string" &&
    /invalid_client_metadata|invalid_(?:client|redirect_uri|grant_type|response_type|request)|unsupported_(?:client|grant|response)/i.test(observedError);
}

export type RegistrationProbeStatus = "accepted" | "rejected" | "not-proven";

export function classifyRegistrationProbe(statusCode: number, observedError: unknown): RegistrationProbeStatus {
  if (statusCode >= 200 && statusCode < 300) return "accepted";
  if ((statusCode === 400 || statusCode === 422) && isRegistrationMetadataError(observedError)) return "rejected";
  return "not-proven";
}

export function hasUnnegatedEndorsementLanguage(text: string): boolean {
  const endorsementTerms = /\b(?:verified|endorsed|approved|trusted|recommended|sponsored|official(?:ly)?|partner)\b/gi;
  for (const match of text.matchAll(endorsementTerms)) {
    const index = match.index ?? 0;
    const statementStart = Math.max(
      text.lastIndexOf(".", index - 1),
      text.lastIndexOf("!", index - 1),
      text.lastIndexOf("?", index - 1),
      text.lastIndexOf(";", index - 1),
      text.lastIndexOf("\n", index - 1),
    ) + 1;
    const localPrefix = text.slice(Math.max(statementStart, index - 48), index);
    if (!/\b(?:not|never|cannot|can't|doesn't|does not|unverified|untrusted|without)\b[\s\S]{0,30}$/i.test(localPrefix)) return true;
  }
  return false;
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

function gateEvidence(observation: GateObservation): Record<string, unknown> | undefined {
  const evidence = observation.evidence && typeof observation.evidence === "object"
    ? observation.evidence as Record<string, unknown>
    : {};
  const errorEvidence = observation.error
    ? { errorKind: observation.error.kind, ...(observation.error.code ? { errorCode: observation.error.code } : {}) }
    : {};
  const combined = { ...evidence, ...errorEvidence };
  return Object.keys(combined).length > 0 ? combined : undefined;
}

export class GateAccumulator {
  private readonly gates = new Map<string, GateObservation>();

  constructor(initial: readonly CompatibilityGate[] = []) {
    for (const gate of initial) this.add(gate);
  }

  add(gate: CompatibilityGate): void {
    this.gates.set(gate.id, {
      kind: "gate",
      gateId: gate.id,
      status: gate.status,
      detail: gate.detail,
      evidence: gate.evidence,
    });
  }

  replace(observation: GateObservation): void {
    this.gates.set(observation.gateId, { ...observation });
  }

  has(gateId: string): boolean {
    return this.gates.has(gateId);
  }

  get(gateId: string): CompatibilityGate | undefined {
    const observation = this.gates.get(gateId);
    if (!observation) return undefined;
    const evidence = gateEvidence(observation);
    return {
      id: observation.gateId,
      status: observation.status ?? "not-proven",
      detail: typeof observation.detail === "string" ? observation.detail : "",
      ...(evidence ? { evidence } : {}),
    };
  }

  observations(): GateObservation[] {
    return [...this.gates.values()].map((observation) => ({ ...observation }));
  }

  snapshot(requiredGateIds: readonly string[]): CompatibilityGate[] {
    const required = [...new Set(requiredGateIds)];
    for (const id of required) {
      if (!this.gates.has(id)) {
        this.gates.set(id, {
          kind: "gate",
          gateId: id,
          status: "not-proven",
          detail: "Gate was not reached because an earlier compatibility gate stopped the run.",
          error: { kind: "missing-observation" },
          evidence: { reached: false, observedBoundary: "not-reached" },
        });
      }
    }
    const order = new Map(required.map((id, index) => [id, index]));
    return [...this.gates.values()]
      .sort((a, b) => (order.get(a.gateId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.gateId) ?? Number.MAX_SAFE_INTEGER) || a.gateId.localeCompare(b.gateId))
      .map((observation) => {
        const evidence = gateEvidence(observation);
        return {
          id: observation.gateId,
          status: observation.status ?? "not-proven",
          detail: typeof observation.detail === "string" ? observation.detail : "",
          ...(evidence ? { evidence } : {}),
        };
      });
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
    const status = observation.verifierMatchesChallenge === undefined
      ? undefined
      : observation.verifierMatchesChallenge && observation.method === "S256" ? "pass" : "fail";
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
  const observedGateStatuses = new Map<string, GateStatus>();
  const conflictingGateIds = new Set<string>();
  for (const observation of input.observations) {
    const result = evaluateObservation(observation, context);
    secretLeak ||= result.secretLeak;
    if (result.gate) {
      if (conflictingGateIds.has(result.gate.id)) continue;
      const previous = observedGateStatuses.get(result.gate.id);
      if (previous !== undefined && previous !== result.gate.status) {
        conflictingGateIds.add(result.gate.id);
        accumulator.replace({
          kind: "gate",
          gateId: result.gate.id,
          status: "fail",
          detail: "Conflicting observations were supplied for this gate.",
          error: { kind: "conflicting-observation" },
          evidence: { observedStatuses: [previous, result.gate.status] },
        });
      } else {
        observedGateStatuses.set(result.gate.id, result.gate.status);
        accumulator.add(result.gate);
      }
    }
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
    accumulator.replace({
      kind: "gate",
      gateId: "sanitized-evidence",
      status: secretLeak || !firstVerification.sanitized || input.artifactWriteSucceeded === false ? "fail" : "pass",
      detail: secretLeak || !firstVerification.sanitized
        ? "Evidence could not be proven free of bearer tokens, JWTs, passwords, cookies, or reusable credentials."
        : input.artifactWriteSucceeded === false
          ? "Evidence was verified in memory, but the evidence artifact could not be written."
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
