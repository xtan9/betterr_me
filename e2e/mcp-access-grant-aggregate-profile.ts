import { compactVerify, decodeJwt, decodeProtectedHeader, importJWK } from "jose";

import {
  classifyFactIdentity,
  MCP_ACCESS_GRANT_CATALOGS,
  COMPATIBILITY_PROFILE,
  MCP_ACCESS_GRANT_ARTIFACT_NAME,
  MCP_ACCESS_GRANT_LOOPBACK_HOSTS,
  type CatalogFamily,
  type CatalogFactKind,
  type GateStatus,
} from "./mcp-access-grant-catalogs";
import {
  createEvidenceRunContext,
  finalizeEvidence,
  sanitizeText,
  sanitizeUrl,
  type CompatibilityReport,
  type CompatibilityReportTarget,
  type EvidenceError,
  type EvidenceObservation,
  type EvidenceVerification,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";
import {
  evaluateDelegatedJwtPolicy,
  isSupportedLoopbackRegistrationRedirect,
  matchesS256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
} from "./mcp-access-grant-policy";

/**
 * The deterministic aggregate compatibility profile for Candidate 2.
 *
 * This is the only new value entry point in this slice. It owns one private
 * session and exposes two source-bound recorder ports: compatibility facts
 * are authoritative for the aggregate profile, while public-client facts are
 * accepted only as closed shadow discovery observations.
 */

export type AggregateCompatibilityCredentialPresence = "present" | "absent" | "unknown";

export type AggregateCompatibilityJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AggregateCompatibilityJsonValue[]
  | { readonly [key: string]: AggregateCompatibilityJsonValue };

export interface AggregateCompatibilityResponseSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body?: AggregateCompatibilityJsonValue;
  readonly headers?: { readonly [key: string]: AggregateCompatibilityJsonValue };
  readonly location?: string;
  readonly browserUrl?: string;
  readonly callbackUrl?: string;
}

export interface AggregateCompatibilityDiscoveryObservation {
  readonly response?: AggregateCompatibilityResponseSurface;
  readonly advertisedResource?: string;
  readonly advertisedAuthorizationServer?: string;
  readonly issuer?: string;
  readonly authorizationEndpoint?: string;
  readonly registrationEndpoint?: string;
  readonly tokenEndpoint?: string;
  readonly jwksUri?: string;
  readonly grantTypesSupported?: readonly string[];
  readonly responseTypesSupported?: readonly string[];
  readonly tokenEndpointAuthMethodsSupported?: readonly string[];
  readonly codeChallengeMethodsSupported?: readonly string[];
}

export interface AggregateCompatibilityDelegatedTokenObservation {
  readonly token?: string;
  readonly jwks?: string | AggregateCompatibilityJsonValue;
}

export interface AggregateCompatibilityRequest {
  readonly method: string;
  readonly url: string;
  readonly bodyFields?: readonly string[];
  readonly authorizationHeaderPresent?: boolean;
  readonly requestClientId?: string;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly status?: number;
  readonly response?: AggregateCompatibilityResponseSurface;
}

export interface AggregateCompatibilityConfigurationObservation {
  readonly loopbackHosts?: readonly string[];
  readonly providerCredentialsAvailable?: boolean;
}

export interface AggregateCompatibilityAuthorizationObservation {
  readonly authorizationRequestObserved?: boolean;
  readonly authorizationEndpoint?: string;
  readonly responseType?: string;
  readonly redirectUri?: string;
  readonly resource?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly callbackReceived?: boolean;
  readonly callbackUrl?: string;
  readonly expectedState?: string;
  readonly callbackState?: string;
}

export interface AggregateCompatibilityLoopbackObservation {
  readonly registeredRedirectUri: string;
  readonly callbackUrl?: string;
  readonly callbackReceived?: boolean;
  readonly requestCallbackUrl?: string;
  readonly requestResource?: string;
  readonly portSelectedAtRequest?: boolean;
}

export interface AggregateCompatibilityPkceObservation {
  readonly verifier?: string;
  readonly challenge?: string;
  readonly method?: string;
  readonly requestResource?: string;
  readonly redirectUri?: string;
}

export interface AggregateCompatibilityMcpObservation {
  readonly operationUrl?: string;
  readonly operationResource?: string;
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly callToolCompleted?: boolean;
  readonly resultIsError?: boolean;
}

export type AggregatePkceNegativeCase =
  | "missing-code-challenge"
  | "plain-code-challenge-method"
  | "missing-code-verifier"
  | "incorrect-code-verifier";

export type AggregateResourceNegativeCase =
  | "missing-resource"
  | "generic-resource"
  | "inferred-resource"
  | "unrelated-resource";

export type AggregateDelegatedTokenNegativeCase =
  | "modified-signature"
  | "unexpected-algorithm"
  | "unexpected-key"
  | "wrong-issuer"
  | "missing-subject"
  | "missing-audience"
  | "generic-audience"
  | "inferred-resource-audience"
  | "unrelated-resource-audience"
  | "invalid-time"
  | "missing-client-context";

export type AggregateCompatibilityFact =
  | {
      readonly kind: "resource-discovery";
      readonly role: "primary";
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly advertisedResource?: string;
      readonly advertisedAuthorizationServer?: string;
      readonly observation?: AggregateCompatibilityDiscoveryObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "provider-discovery";
      readonly role: "primary";
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly issuer?: string;
      readonly authorizationEndpoint?: string;
      readonly registrationEndpoint?: string;
      readonly tokenEndpoint?: string;
      readonly jwksUri?: string;
      readonly grantTypesSupported?: readonly string[];
      readonly responseTypesSupported?: readonly string[];
      readonly tokenEndpointAuthMethodsSupported?: readonly string[];
      readonly codeChallengeMethodsSupported?: readonly string[];
      readonly observation?: AggregateCompatibilityDiscoveryObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "configuration";
      readonly role: "snapshot";
      readonly observation?: AggregateCompatibilityConfigurationObservation;
    }
  | {
      readonly kind: "versions";
      readonly role: "snapshot";
      readonly values?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "registration";
      readonly role: "primary";
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "authorization";
      readonly role: "primary";
      readonly observation?: AggregateCompatibilityAuthorizationObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "loopback";
      readonly role: "callback" | "request";
      readonly observation?: AggregateCompatibilityLoopbackObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "pkce";
      readonly role: "positive";
      readonly observation?: AggregateCompatibilityPkceObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "pkce";
      readonly role: "negative";
      readonly caseId: AggregatePkceNegativeCase;
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "resource-binding";
      readonly role: "negative";
      readonly caseId: AggregateResourceNegativeCase;
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "delegated-token";
      readonly role: "validation";
      readonly token?: string;
      readonly jwks?: string | AggregateCompatibilityJsonValue;
      readonly observation?: AggregateCompatibilityDelegatedTokenObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "delegated-token";
      readonly role: "negative";
      readonly caseId: AggregateDelegatedTokenNegativeCase;
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "mcp-operation";
      readonly role: "authenticated";
      readonly observation?: AggregateCompatibilityMcpObservation;
      readonly request?: AggregateCompatibilityRequest;
    };

export type AggregatePublicClientFact =
  | {
      readonly kind: "resource-discovery";
      readonly role: "shadow";
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly advertisedResource?: string;
      readonly advertisedAuthorizationServer?: string;
      readonly observation?: AggregateCompatibilityDiscoveryObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "provider-discovery";
      readonly role: "shadow";
      readonly response?: AggregateCompatibilityResponseSurface;
      readonly issuer?: string;
      readonly authorizationEndpoint?: string;
      readonly registrationEndpoint?: string;
      readonly tokenEndpoint?: string;
      readonly jwksUri?: string;
      readonly grantTypesSupported?: readonly string[];
      readonly responseTypesSupported?: readonly string[];
      readonly tokenEndpointAuthMethodsSupported?: readonly string[];
      readonly codeChallengeMethodsSupported?: readonly string[];
      readonly observation?: AggregateCompatibilityDiscoveryObservation;
      readonly request?: AggregateCompatibilityRequest;
    };

export interface AggregateCompatibilityRecorders {
  readonly compatibility: {
    readonly record: (fact: AggregateCompatibilityFact) => Promise<void>;
  };
  readonly publicClient: {
    readonly record: (fact: AggregatePublicClientFact) => Promise<void>;
  };
}

export interface AggregateCompatibilityArtifact {
  readonly filename: typeof MCP_ACCESS_GRANT_ARTIFACT_NAME;
  readonly contents: string;
}

export type AggregateCompatibilityArtifactWriter =
  | ((artifact: AggregateCompatibilityArtifact) => void | Promise<void>)
  | { readonly write: (artifact: AggregateCompatibilityArtifact) => void | Promise<void> };

export interface AggregateCompatibilityEvidenceOptions {
  readonly target: CompatibilityReportTarget;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets?: readonly string[];
  readonly clock: () => string;
  readonly writer: AggregateCompatibilityArtifactWriter;
}

export interface AggregateCompatibilityEvidenceResult {
  readonly report: CompatibilityReport;
  readonly artifact: AggregateCompatibilityArtifact;
  readonly verification: EvidenceVerification;
  readonly artifactWriteSucceeded: boolean;
}

interface NormalizedSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body: Record<string, unknown>;
  readonly location?: string;
  readonly browserUrl?: string;
  readonly callbackUrl?: string;
  readonly credentialPresence: AggregateCompatibilityCredentialPresence;
}

interface NormalizedRequest {
  readonly request: MinimizedRequestObservation;
  readonly response?: NormalizedSurface;
  readonly responseCredentialPresence: AggregateCompatibilityCredentialPresence;
}

interface DelegatedTokenData {
  readonly tokenObserved: boolean;
  readonly tokenMalformed: boolean;
  readonly jwksObserved: boolean;
  readonly jwksMalformed: boolean;
  readonly header: DelegatedJwtHeader;
  readonly claims: DelegatedJwtClaims;
  readonly signingKeys: readonly DelegatedJwk[];
  readonly keySelected: boolean;
  readonly signatureValid: boolean;
  readonly sampledAtSeconds: number;
}

interface NormalizedFact {
  readonly source: "compatibility" | "public-client";
  readonly identity: string;
  readonly kind: CatalogFactKind;
  readonly role: string;
  readonly caseId?: string;
  readonly data: Record<string, unknown>;
  readonly request?: NormalizedRequest;
}

interface AggregateHistory {
  clientId?: string;
  redirectUri?: string;
  authorizationEndpoint?: string;
  registrationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  grantId?: string;
}

interface DerivedGate {
  readonly gateId: string;
  readonly status?: GateStatus;
  readonly evidence?: Record<string, unknown>;
  readonly error?: EvidenceError;
}

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 32;
const MAX_OBJECT_KEYS = 64;
const MAX_STRING_LENGTH = 500;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_JWKS_LENGTH = 65_536;
const MAX_JWKS_KEYS = 32;
const MAX_CONFIGURED_SECRETS = 32;
const MAX_CONFIGURED_SECRET_LENGTH = 500;

const SENSITIVE_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|verifier|state|code)$/i;
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|code)$/i;
const CREDENTIAL_QUERY_KEY = /^(?:code|code[_-]?verifier|access_token|refresh_token|id_token|client_secret|token)$/i;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
  "authorized", "rejected", "passed", "failed", "valid", "success", "signatureValid", "algorithmAllowed",
]);

const PKCE_NEGATIVE_CASES: readonly AggregatePkceNegativeCase[] = [
  "missing-code-challenge",
  "plain-code-challenge-method",
  "missing-code-verifier",
  "incorrect-code-verifier",
];
const RESOURCE_NEGATIVE_CASES: readonly AggregateResourceNegativeCase[] = [
  "missing-resource",
  "generic-resource",
  "inferred-resource",
  "unrelated-resource",
];
const DELEGATED_NEGATIVE_CASES: readonly AggregateDelegatedTokenNegativeCase[] = [
  "modified-signature",
  "unexpected-algorithm",
  "unexpected-key",
  "wrong-issuer",
  "missing-subject",
  "missing-audience",
  "generic-audience",
  "inferred-resource-audience",
  "unrelated-resource-audience",
  "invalid-time",
  "missing-client-context",
];

class AggregateCompatibilityEvidenceBoundaryError extends Error {
  constructor() {
    super("Aggregate compatibility evidence journey failed.");
    this.name = "AggregateCompatibilityEvidenceBoundaryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH ? value : undefined;
}

function boundedBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function boundedNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boundedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return undefined;
  return value.every((item) => boundedString(item) !== undefined)
    ? value.map((item) => boundedString(item) as string)
    : undefined;
}

function combineCredentialPresence(
  values: readonly AggregateCompatibilityCredentialPresence[],
): AggregateCompatibilityCredentialPresence {
  if (values.includes("present")) return "present";
  if (values.includes("unknown")) return "unknown";
  return "absent";
}

function credentialFromText(value: string | undefined): AggregateCompatibilityCredentialPresence {
  if (!value) return "absent";
  try {
    const url = new URL(value);
    const query = [...url.searchParams.entries()];
    const fragment = [...new URLSearchParams(url.hash.replace(/^#/, "")).entries()];
    return [...query, ...fragment].some(([key, queryValue]) => CREDENTIAL_QUERY_KEY.test(key) && queryValue.length > 0)
      ? "present"
      : "absent";
  } catch {
    return /(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=([^&#\s]+)/i.test(value)
      ? "present"
      : "unknown";
  }
}

function inspectJson(
  value: unknown,
  depth = 0,
  key?: string,
): { readonly value: unknown; readonly credentialPresence: AggregateCompatibilityCredentialPresence; readonly complete: boolean } {
  if (depth > MAX_DEPTH) return { value: "[REDACTED: depth limit]", credentialPresence: "unknown", complete: false };
  if (typeof value === "string") {
    const keyPresence = key && CREDENTIAL_KEY.test(key) && value.length > 0 ? "present" : "absent";
    const sensitive = key && SENSITIVE_KEY.test(key) && value.length > 0;
    if (value.length > MAX_STRING_LENGTH) return { value: "[REDACTED: length limit]", credentialPresence: "unknown", complete: false };
    const embedded = /Bearer\s+[^\s]+|\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=([^&#\s]+)/i.test(value)
      ? "present"
      : "absent";
    return {
      value: sensitive ? "[REDACTED]" : value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]").replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT REDACTED]"),
      credentialPresence: combineCredentialPresence([keyPresence, embedded]),
      complete: true,
    };
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return { value, credentialPresence: "absent", complete: true };
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) return { value: "[REDACTED: array limit]", credentialPresence: "unknown", complete: false };
    const children = value.map((child) => inspectJson(child, depth + 1, key));
    return {
      value: children.map((child) => child.value),
      credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)),
      complete: children.every((child) => child.complete),
    };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) return { value: "[REDACTED: object limit]", credentialPresence: "unknown", complete: false };
    const output: Record<string, unknown> = {};
    const children = entries.map(([childKey, child]) => {
      const result = inspectJson(child, depth + 1, childKey);
      const keyCredential = CREDENTIAL_KEY.test(childKey) && child !== null && child !== undefined && !(typeof child === "string" && child.length === 0);
      output[childKey] = SENSITIVE_KEY.test(childKey) ? "[REDACTED]" : result.value;
      return { ...result, credentialPresence: keyCredential ? "present" as const : result.credentialPresence };
    });
    return {
      value: output,
      credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)),
      complete: children.every((child) => child.complete),
    };
  }
  return { value: "[REDACTED: unsupported value]", credentialPresence: "unknown", complete: false };
}

function normalizeSurface(value: unknown): NormalizedSurface {
  if (!isRecord(value)) return { complete: false, body: {}, credentialPresence: "unknown" };
  const inspectedBody = "body" in value ? inspectJson(value.body) : { value: {}, credentialPresence: "absent" as const, complete: true };
  const inspectedHeaders = "headers" in value ? inspectJson(value.headers) : { value: {}, credentialPresence: "absent" as const, complete: true };
  const textKeys = ["location", "browserUrl", "callbackUrl"] as const;
  const textValues = textKeys.map((key) => boundedString(value[key]));
  const body = isRecord(inspectedBody.value) ? inspectedBody.value : {};
  const textComplete = textKeys.every((key) => !(key in value) || boundedString(value[key]) !== undefined);
  return {
    complete: value.complete === true && textComplete && inspectedBody.complete && inspectedHeaders.complete,
    status: boundedNumber(value.status),
    body,
    ...(textValues[0] ? { location: sanitizeUrl(textValues[0]) } : {}),
    ...(textValues[1] ? { browserUrl: sanitizeUrl(textValues[1]) } : {}),
    ...(textValues[2] ? { callbackUrl: sanitizeUrl(textValues[2]) } : {}),
    credentialPresence: combineCredentialPresence([
      inspectedBody.credentialPresence,
      inspectedHeaders.credentialPresence,
      ...textValues.map((text) => credentialFromText(text)),
    ]),
  };
}

function normalizeRequest(value: unknown): NormalizedRequest | undefined {
  if (!isRecord(value)) return undefined;
  const method = boundedString(value.method);
  const url = boundedString(value.url);
  if (!method || !url) throw new AggregateCompatibilityEvidenceBoundaryError();
  const response = "response" in value ? normalizeSurface(value.response) : undefined;
  const responseCredentialPresence = response?.credentialPresence ?? "unknown";
  const bodyFields = boundedStringList(value.bodyFields) ?? [];
  const request: MinimizedRequestObservation = {
    method,
    url: sanitizeUrl(url),
    requestBodyFields: bodyFields,
    authorizationHeaderPresent: boundedBoolean(value.authorizationHeaderPresent) ?? false,
    ...(boundedString(value.requestClientId) ? { requestClientId: sanitizeText(value.requestClientId as string) } : {}),
    ...(boundedString(value.requestGrantType) ? { requestGrantType: value.requestGrantType as string } : {}),
    ...(boundedString(value.requestRedirectUri) ? { requestRedirectUri: sanitizeUrl(value.requestRedirectUri as string) } : {}),
    ...(boundedString(value.requestResource) ? { requestResource: sanitizeUrl(value.requestResource as string) } : {}),
    ...(boundedString(value.requestCodeChallengeMethod) ? { requestCodeChallengeMethod: value.requestCodeChallengeMethod as string } : {}),
    ...(boundedBoolean(value.requestCodeChallengePresent) !== undefined ? { requestCodeChallengePresent: value.requestCodeChallengePresent as boolean } : {}),
    ...(boundedBoolean(value.requestCodePresent) !== undefined ? { requestCodePresent: value.requestCodePresent as boolean } : {}),
    ...(boundedBoolean(value.requestCodeVerifierPresent) !== undefined ? { requestCodeVerifierPresent: value.requestCodeVerifierPresent as boolean } : {}),
    ...(boundedNumber(value.status) !== undefined ? { status: value.status as number } : response?.status !== undefined ? { status: response.status } : {}),
    ...(response?.location ? { responseLocation: response.location } : {}),
    ...(response ? { responseBody: response.body, responseCredentialFields: Object.keys(response.body).filter((key) => CREDENTIAL_KEY.test(key)).sort(), responseContainsCredentials: response.credentialPresence === "present" } : {}),
  };
  return { request, response, responseCredentialPresence };
}

function bodyString(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && !value.startsWith("[REDACTED")) return value;
  }
  return undefined;
}

function bodyStringArray(body: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && !item.startsWith("[REDACTED"));
  }
  return [];
}

function discoveryData(raw: Record<string, unknown>): Record<string, unknown> {
  const observationValue = raw.observation;
  const observation = observationValue === undefined ? {} : observationValue;
  assertPrimitiveObservation(observation);
  const response = normalizeSurface(raw.response ?? observation.response);
  const body = response.body;
  const stringValue = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const direct = boundedString(raw[key] ?? observation[key]);
      if (direct) return direct;
      const bodyValue = bodyString(body, key);
      if (bodyValue) return bodyValue;
    }
    return undefined;
  };
  const listValue = (...keys: string[]): string[] => {
    for (const key of keys) {
      const direct = boundedStringList(raw[key] ?? observation[key]);
      if (direct) return direct;
      const bodyList = bodyStringArray(body, key);
      if (bodyList.length) return bodyList;
    }
    return [];
  };
  return {
    response,
    advertisedResource: stringValue("advertisedResource", "resource", "resource_uri"),
    advertisedAuthorizationServer: stringValue("advertisedAuthorizationServer", "authorization_server", "authorizationServer"),
    issuer: stringValue("issuer"),
    authorizationEndpoint: stringValue("authorizationEndpoint", "authorization_endpoint"),
    registrationEndpoint: stringValue("registrationEndpoint", "registration_endpoint"),
    tokenEndpoint: stringValue("tokenEndpoint", "token_endpoint"),
    jwksUri: stringValue("jwksUri", "jwks_uri"),
    grantTypesSupported: listValue("grantTypesSupported", "grant_types_supported"),
    responseTypesSupported: listValue("responseTypesSupported", "response_types_supported"),
    tokenEndpointAuthMethodsSupported: listValue("tokenEndpointAuthMethodsSupported", "token_endpoint_auth_methods_supported"),
    codeChallengeMethodsSupported: listValue("codeChallengeMethodsSupported", "code_challenge_methods_supported"),
  };
}

function assertNoConclusionFields(value: Record<string, unknown>): void {
  if (Object.keys(value).some((key) => CONCLUSION_KEYS.has(key))) throw new AggregateCompatibilityEvidenceBoundaryError();
}

function assertNoFamily(value: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(value, "family")) throw new AggregateCompatibilityEvidenceBoundaryError();
}

function assertPrimitiveObservation(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new AggregateCompatibilityEvidenceBoundaryError();
  assertNoConclusionFields(value);
  assertNoFamily(value);
}

function classifyIdentity(
  source: "compatibility" | "public-client",
  kind: CatalogFactKind,
  role: string,
): void {
  const result = classifyFactIdentity({
    profile: "compatibility",
    source,
    kind,
    role,
    family: "none" as CatalogFamily,
  });
  if (!result.accepted || (source === "compatibility" && result.authority !== "authoritative") || (source === "public-client" && result.authority !== "shadow")) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
}

function normalizeDelegatedClaims(claims: DelegatedJwtClaims): DelegatedJwtClaims {
  const minimized: DelegatedJwtClaims = {};
  for (const key of ["iss", "sub", "aud", "exp", "iat", "nbf", "client_id", "azp", "resource", "grant_id"]) {
    const value = claims[key];
    if (typeof value === "string" && value.length <= MAX_STRING_LENGTH) minimized[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) minimized[key] = value;
  }
  return minimized;
}

function normalizeDelegatedHeader(header: DelegatedJwtHeader): DelegatedJwtHeader {
  return {
    ...(boundedString(header.alg) ? { alg: boundedString(header.alg) } : {}),
    ...(boundedString(header.kid) ? { kid: boundedString(header.kid) } : {}),
    ...(boundedString(header.typ) ? { typ: boundedString(header.typ) } : {}),
  };
}

function minimizeSigningKey(value: unknown): DelegatedJwk | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_KEYS || keys.some((key) => key.length > MAX_STRING_LENGTH)) return undefined;
  const result: DelegatedJwk = {};
  for (const key of ["alg", "kid", "kty", "use", "crv", "n", "e", "x", "y"] as const) {
    const child = value[key];
    if (typeof child === "string" && child.length <= MAX_STRING_LENGTH) result[key] = child;
  }
  if (Array.isArray(value.key_ops) && value.key_ops.length <= MAX_ARRAY_ITEMS) {
    const keyOps = value.key_ops.filter((child): child is string => typeof child === "string" && child.length <= MAX_STRING_LENGTH);
    if (keyOps.length === value.key_ops.length) result.key_ops = keyOps;
  }
  return result;
}

function normalizeSigningKeys(keys: readonly DelegatedJwk[]): DelegatedJwk[] {
  return keys.slice(0, MAX_JWKS_KEYS).map((key) => minimizeSigningKey(key) ?? ({} as DelegatedJwk));
}

async function normalizeDelegatedToken(raw: Record<string, unknown>, sampledAtMillis: number): Promise<DelegatedTokenData> {
  const observationValue = raw.observation;
  const observation = observationValue === undefined ? {} : observationValue;
  assertPrimitiveObservation(observation);
  const absent: DelegatedTokenData = {
    tokenObserved: false,
    tokenMalformed: false,
    jwksObserved: false,
    jwksMalformed: false,
    header: {},
    claims: {},
    signingKeys: [],
    keySelected: false,
    signatureValid: false,
    sampledAtSeconds: Math.floor(sampledAtMillis / 1000),
  };
  const tokenValue = raw.token ?? observation.token;
  if (tokenValue === undefined) return absent;
  if (typeof tokenValue !== "string") throw new AggregateCompatibilityEvidenceBoundaryError();
  if (tokenValue.length === 0 || tokenValue.length > MAX_TOKEN_LENGTH) {
    return { ...absent, tokenObserved: true, tokenMalformed: true };
  }
  const token = tokenValue;

  let header: DelegatedJwtHeader;
  let claims: DelegatedJwtClaims;
  try {
    header = decodeProtectedHeader(token) as DelegatedJwtHeader;
    claims = decodeJwt(token) as DelegatedJwtClaims;
  } catch {
    return { ...absent, tokenObserved: true, tokenMalformed: true };
  }

  const rawJwks = raw.jwks ?? observation.jwks;
  if (rawJwks === undefined) {
    return { ...absent, tokenObserved: true, header: normalizeDelegatedHeader(header), claims: normalizeDelegatedClaims(claims) };
  }
  let jwksValue: unknown = rawJwks;
  if (typeof rawJwks === "string") {
    if (rawJwks.length === 0 || rawJwks.length > MAX_JWKS_LENGTH) return { ...absent, tokenObserved: true, header, claims: normalizeDelegatedClaims(claims), jwksObserved: true, jwksMalformed: true };
    try {
      jwksValue = JSON.parse(rawJwks);
    } catch {
      return { ...absent, tokenObserved: true, header, claims: normalizeDelegatedClaims(claims), jwksMalformed: true };
    }
  }
  if (!isRecord(jwksValue) || Object.keys(jwksValue).length > MAX_OBJECT_KEYS || Object.keys(jwksValue).some((key) => key.length > MAX_STRING_LENGTH) || !Array.isArray(jwksValue.keys) || jwksValue.keys.length > MAX_JWKS_KEYS) {
    return { ...absent, tokenObserved: true, header, claims: normalizeDelegatedClaims(claims), jwksObserved: true, jwksMalformed: true };
  }
  const keys = jwksValue.keys.map((key) => minimizeSigningKey(key));
  if (keys.some((key) => key === undefined)) {
    return { ...absent, tokenObserved: true, header, claims: normalizeDelegatedClaims(claims), jwksObserved: true, jwksMalformed: true };
  }
  const signingKeys = keys as DelegatedJwk[];
  const selected = selectDelegatedSigningJwk(header, signingKeys);
  if (!selected.ok) {
    return {
      ...absent,
      tokenObserved: true,
      header,
      claims: normalizeDelegatedClaims(claims),
      jwksObserved: true,
      signingKeys: normalizeSigningKeys(signingKeys),
    };
  }

  let signatureValid = false;
  try {
    const verificationKey = await importJWK(selected.key as Parameters<typeof importJWK>[0], header.alg as string);
    await compactVerify(token, verificationKey, { algorithms: [header.alg as string] });
    signatureValid = true;
  } catch {
    signatureValid = false;
  }
  return {
    tokenObserved: true,
    tokenMalformed: false,
    jwksObserved: true,
    jwksMalformed: false,
    header,
    claims: normalizeDelegatedClaims(claims),
    signingKeys: normalizeSigningKeys(signingKeys),
    keySelected: true,
    signatureValid,
    sampledAtSeconds: Math.floor(sampledAtMillis / 1000),
  };
}

function loopbackUrl(value: unknown): {
  readonly url: string;
  readonly host?: string;
  readonly path?: string;
  readonly port?: number;
  readonly hasQuery?: boolean;
  readonly hasFragment?: boolean;
} | undefined {
  const raw = boundedString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return {
      url: sanitizeUrl(raw),
      host: url.hostname.replace(/^\[|\]$/g, ""),
      path: url.pathname,
      port: url.port ? Number(url.port) : undefined,
      hasQuery: url.search.length > 0,
      hasFragment: url.hash.length > 0,
    };
  } catch {
    return { url: "[REDACTED: malformed URL]" };
  }
}

function normalizeFact(
  value: AggregateCompatibilityFact | AggregatePublicClientFact,
  source: "compatibility" | "public-client",
  sampledAtMillis: number,
): Promise<NormalizedFact> | NormalizedFact {
  if (!isRecord(value)) throw new AggregateCompatibilityEvidenceBoundaryError();
  assertNoConclusionFields(value);
  assertNoFamily(value);
  const kind = value.kind;
  const role = value.role;
  if (typeof kind !== "string" || typeof role !== "string") throw new AggregateCompatibilityEvidenceBoundaryError();
  classifyIdentity(source, kind as CatalogFactKind, role);

  if (kind === "resource-discovery" || kind === "provider-discovery") {
    if (role !== (source === "compatibility" ? "primary" : "shadow")) throw new AggregateCompatibilityEvidenceBoundaryError();
    const data = discoveryData(value);
    return {
      source,
      identity: `${source}|${kind}|${role}`,
      kind,
      role,
      data,
      request: normalizeRequest(value.request),
    };
  }
  if (source !== "compatibility") throw new AggregateCompatibilityEvidenceBoundaryError();
  if (kind === "configuration") {
    if (role !== "snapshot") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    return {
      source,
      identity: "compatibility|configuration|snapshot",
      kind,
      role,
      data: {
        loopbackHosts: boundedStringList(observation.loopbackHosts),
        providerCredentialsAvailable: boundedBoolean(observation.providerCredentialsAvailable),
      },
    };
  }
  if (kind === "versions") {
    if (role !== "snapshot") throw new AggregateCompatibilityEvidenceBoundaryError();
    if (!isRecord(value.values) || Object.keys(value.values).length > MAX_OBJECT_KEYS) throw new AggregateCompatibilityEvidenceBoundaryError();
    const values = Object.fromEntries(Object.entries(value.values).map(([key, child]) => {
      if (key.length > MAX_STRING_LENGTH || boundedString(child) === undefined) throw new AggregateCompatibilityEvidenceBoundaryError();
      return [key, child as string];
    }));
    return { source, identity: "compatibility|versions|snapshot", kind, role, data: { values } };
  }
  if (kind === "registration") {
    if (role !== "primary") throw new AggregateCompatibilityEvidenceBoundaryError();
    const response = normalizeSurface(value.response);
    return { source, identity: "compatibility|registration|primary", kind, role, data: { response }, request: normalizeRequest(value.request) };
  }
  if (kind === "authorization") {
    if (role !== "primary") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    const callbackUrl = boundedString(observation.callbackUrl);
    const callbackCredentialPresence = credentialFromText(callbackUrl);
    const callbackParameters = callbackUrl ? (() => {
      try {
        const url = new URL(callbackUrl);
        return {
          authorizationCodePresent: url.searchParams.has("code"),
          accessTokenPresent: url.searchParams.has("access_token"),
          refreshTokenPresent: url.searchParams.has("refresh_token"),
          idTokenPresent: url.searchParams.has("id_token"),
        };
      } catch {
        return { authorizationCodePresent: false, accessTokenPresent: false, refreshTokenPresent: false, idTokenPresent: false };
      }
    })() : { authorizationCodePresent: false, accessTokenPresent: false, refreshTokenPresent: false, idTokenPresent: false };
    return {
      source,
      identity: "compatibility|authorization|primary",
      kind,
      role,
      data: {
        authorizationRequestObserved: boundedBoolean(observation.authorizationRequestObserved),
        authorizationEndpoint: boundedString(observation.authorizationEndpoint),
        responseType: boundedString(observation.responseType),
        redirectUri: boundedString(observation.redirectUri),
        resource: boundedString(observation.resource),
        codeChallenge: boundedString(observation.codeChallenge),
        codeChallengeMethod: boundedString(observation.codeChallengeMethod),
        callbackReceived: boundedBoolean(observation.callbackReceived),
        callbackUrl: callbackUrl ? sanitizeUrl(callbackUrl) : undefined,
        callbackCredentialPresence,
        authorizationCodePresent: callbackParameters.authorizationCodePresent,
        accessTokenPresent: callbackParameters.accessTokenPresent,
        refreshTokenPresent: callbackParameters.refreshTokenPresent,
        idTokenPresent: callbackParameters.idTokenPresent,
        stateMatches: boundedString(observation.expectedState) !== undefined && boundedString(observation.callbackState) !== undefined
          ? observation.expectedState === observation.callbackState
          : undefined,
      },
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "loopback") {
    if (role !== "callback" && role !== "request") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    return {
      source,
      identity: `compatibility|loopback|${role}`,
      kind,
      role,
      data: {
        registeredRedirectUri: loopbackUrl(observation.registeredRedirectUri),
        callbackUrl: loopbackUrl(observation.callbackUrl),
        requestCallbackUrl: loopbackUrl(observation.requestCallbackUrl),
        callbackReceived: boundedBoolean(observation.callbackReceived),
        requestResource: boundedString(observation.requestResource),
        portSelectedAtRequest: boundedBoolean(observation.portSelectedAtRequest),
      },
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "pkce") {
    if (role === "positive") {
      const observation = value.observation === undefined ? {} : value.observation;
      assertPrimitiveObservation(observation);
      const verifier = boundedString(observation.verifier);
      const challenge = boundedString(observation.challenge);
      return {
        source,
        identity: "compatibility|pkce|positive",
        kind,
        role,
        data: {
          verifierPresent: Boolean(verifier),
          challengePresent: Boolean(challenge),
          verifierMatchesChallenge: matchesS256CodeChallenge(verifier, challenge, boundedString(observation.method)),
          method: boundedString(observation.method),
          requestResource: boundedString(observation.requestResource),
          redirectUri: boundedString(observation.redirectUri),
        },
        request: normalizeRequest(value.request),
      };
    }
    if (role !== "negative" || ![...PKCE_NEGATIVE_CASES].includes(value.caseId as AggregatePkceNegativeCase)) throw new AggregateCompatibilityEvidenceBoundaryError();
    return {
      source,
      identity: `compatibility|pkce|negative|${value.caseId}`,
      kind,
      role,
      caseId: value.caseId,
      data: { response: normalizeSurface(value.response) },
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "resource-binding") {
    if (role !== "negative" || ![...RESOURCE_NEGATIVE_CASES].includes(value.caseId as AggregateResourceNegativeCase)) throw new AggregateCompatibilityEvidenceBoundaryError();
    return {
      source,
      identity: `compatibility|resource-binding|negative|${value.caseId}`,
      kind,
      role,
      caseId: value.caseId,
      data: { response: normalizeSurface(value.response) },
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "delegated-token") {
    if (role === "validation") {
      return normalizeDelegatedToken(value, sampledAtMillis).then((data) => ({
        source,
        identity: "compatibility|delegated-token|validation",
        kind,
        role,
        data: { ...data },
        request: normalizeRequest(value.request),
      }));
    }
    if (role !== "negative" || ![...DELEGATED_NEGATIVE_CASES].includes(value.caseId as AggregateDelegatedTokenNegativeCase)) throw new AggregateCompatibilityEvidenceBoundaryError();
    return {
      source,
      identity: `compatibility|delegated-token|negative|${value.caseId}`,
      kind,
      role,
      caseId: value.caseId,
      data: { response: normalizeSurface(value.response) },
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "mcp-operation") {
    if (role !== "authenticated") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    return {
      source,
      identity: "compatibility|mcp-operation|authenticated",
      kind,
      role,
      data: {
        operationUrl: boundedString(observation.operationUrl),
        operationResource: boundedString(observation.operationResource),
        connected: boundedBoolean(observation.connected),
        listToolsCompleted: boundedBoolean(observation.listToolsCompleted),
        callToolCompleted: boundedBoolean(observation.callToolCompleted),
        resultIsError: boundedBoolean(observation.resultIsError),
      },
      request: normalizeRequest(value.request),
    };
  }
  throw new AggregateCompatibilityEvidenceBoundaryError();
}

function gate(
  gateId: string,
  status: GateStatus | undefined,
  evidence?: Record<string, unknown>,
  error?: EvidenceError,
): DerivedGate {
  return { gateId, status, evidence, error };
}

function statusFromValues(values: readonly (GateStatus | undefined)[]): GateStatus {
  if (values.some((value) => value === "fail")) return "fail";
  if (values.some((value) => value === "not-proven" || value === undefined)) return "not-proven";
  return "pass";
}

function normalizedGate(derived: DerivedGate): EvidenceObservation {
  return {
    kind: "gate",
    gateId: derived.gateId,
    ...(derived.status !== undefined ? { status: derived.status, detail: catalogTemplateText(derived.gateId, derived.status) } : {}),
    ...(derived.evidence !== undefined ? { evidence: derived.evidence } : {}),
    ...(derived.error ? { error: derived.error } : {}),
  };
}

function targetLoopbackHosts(target: CompatibilityReportTarget): readonly string[] {
  return target.loopbackHosts ?? [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6];
}

function responseFor(fact: NormalizedFact): NormalizedSurface | undefined {
  const dataResponse = fact.data.response;
  const normalizedDataResponse = isRecord(dataResponse) ? dataResponse as unknown as NormalizedSurface : undefined;
  if (fact.request?.response?.complete || fact.request?.response?.status !== undefined) return fact.request.response;
  return normalizedDataResponse;
}

function resourceDiscoveryGate(fact: NormalizedFact, target: CompatibilityReportTarget): DerivedGate {
  const response = fact.data.response as NormalizedSurface;
  if (!response.complete || response.status === undefined) return gate("resource-discovery", "not-proven");
  const resource = fact.data.advertisedResource as string | undefined;
  const provider = fact.data.advertisedAuthorizationServer as string | undefined;
  const resourceMatches = resource === target.canonicalResource;
  const providerMatches = provider === target.expectedAuthorizationServer;
  return gate("resource-discovery", resourceMatches && providerMatches ? "pass" : "fail", {
    resourceMatches,
    advertisedResource: resource ?? "unavailable",
    advertisedAuthorizationServer: provider ?? "unavailable",
    expectedAuthorizationServer: target.expectedAuthorizationServer,
  });
}

function providerDiscoveryGate(fact: NormalizedFact, target: CompatibilityReportTarget, history: AggregateHistory): DerivedGate {
  const response = fact.data.response as NormalizedSurface;
  const issuer = fact.data.issuer as string | undefined;
  if (!response.complete || response.status === undefined) return gate("provider-discovery", "not-proven");
  const responseTypes = fact.data.responseTypesSupported as string[] | undefined ?? [];
  const grantTypes = fact.data.grantTypesSupported as string[] | undefined ?? [];
  const authMethods = fact.data.tokenEndpointAuthMethodsSupported as string[] | undefined ?? [];
  const challenges = fact.data.codeChallengeMethodsSupported as string[] | undefined ?? [];
  const goldenPath = Boolean(fact.data.registrationEndpoint) && responseTypes.includes("code") && grantTypes.includes("authorization_code") && authMethods.includes("none") && challenges.includes("S256");
  const issuerMatches = issuer === target.expectedAuthorizationServer;
  if (issuerMatches && goldenPath) {
    history.authorizationEndpoint = fact.data.authorizationEndpoint as string | undefined;
    history.registrationEndpoint = fact.data.registrationEndpoint as string | undefined;
    history.tokenEndpoint = fact.data.tokenEndpoint as string | undefined;
    history.jwksUri = fact.data.jwksUri as string | undefined;
  }
  return gate("provider-discovery", issuerMatches && goldenPath ? "pass" : "fail", {
    issuerMatches,
    authorizationEndpoint: fact.data.authorizationEndpoint ?? "unavailable",
    registrationEndpoint: fact.data.registrationEndpoint ?? "unavailable",
    tokenEndpoint: fact.data.tokenEndpoint ?? "unavailable",
    jwksUri: fact.data.jwksUri ?? "unavailable",
  });
}

function configurationGate(fact: NormalizedFact, target: CompatibilityReportTarget): DerivedGate {
  const hosts = fact.data.loopbackHosts as string[] | undefined;
  const expectedHosts = targetLoopbackHosts(target);
  const validHosts = hosts?.join("|") === expectedHosts.join("|");
  const targetComplete = Boolean(target.canonicalResource && target.supabaseUrl && target.expectedAuthorizationServer);
  return gate("reproducible-configuration", targetComplete && validHosts ? "pass" : "not-proven", {
    canonicalResource: target.canonicalResource,
    supabaseUrl: target.supabaseUrl,
    expectedAuthorizationServer: target.expectedAuthorizationServer,
    loopbackHosts: hosts ?? "unavailable",
    hasProviderCredentials: fact.data.providerCredentialsAvailable ?? false,
  });
}

function versionsGate(fact: NormalizedFact): DerivedGate {
  const values = fact.data.values as Record<string, string>;
  const complete = COMPATIBILITY_PROFILE.versionRules.requiredKeys.every((key) => typeof values[key] === "string" && values[key].length > 0 && values[key] !== COMPATIBILITY_PROFILE.versionRules.unavailableValue);
  return gate("versions", complete ? "pass" : "not-proven", { versions: values });
}

function registrationGate(fact: NormalizedFact, target: CompatibilityReportTarget, history: AggregateHistory): DerivedGate {
  const response = fact.data.response as NormalizedSurface;
  const request = fact.request?.request;
  if (!response.complete || response.status === undefined || request === undefined) return gate("public-client-registration", "not-proven");
  if (response.status < 200 || response.status >= 300) return gate("public-client-registration", "fail", { registrationObserved: true, registrationStatus: "rejected", requestStatus: response.status, clientIdPresent: false });
  const redirectUris = bodyStringArray(response.body, "redirect_uris", "redirectUris");
  const grantTypes = bodyStringArray(response.body, "grant_types", "grantTypes");
  const responseTypes = bodyStringArray(response.body, "response_types", "responseTypes");
  const client = bodyString(response.body, "client_id", "clientId");
  const authMethod = bodyString(response.body, "token_endpoint_auth_method", "tokenEndpointAuthMethod");
  const clientSecretReturned = response.credentialPresence === "present" || Object.prototype.hasOwnProperty.call(response.body, "client_secret");
  const registeredRedirect = redirectUris.length === 1 && targetLoopbackHosts(target).some((host) => isSupportedLoopbackRegistrationRedirect(redirectUris[0] as string, host as "127.0.0.1" | "::1"));
  const registrationEndpointMatches = history.registrationEndpoint === undefined || request.url === sanitizeUrl(history.registrationEndpoint);
  const accepted = request.method.toUpperCase() === "POST" && registrationEndpointMatches && Boolean(client) && registeredRedirect && grantTypes.length === 1 && grantTypes[0] === "authorization_code" && responseTypes.length === 1 && responseTypes[0] === "code" && authMethod === "none" && !clientSecretReturned;
  if (accepted) {
    history.clientId = client;
    history.redirectUri = redirectUris[0];
  }
  return gate("public-client-registration", accepted ? "pass" : "fail", {
    registrationObserved: true,
    registrationStatus: accepted ? "accepted" : "rejected",
    requestStatus: response.status,
    clientIdPresent: Boolean(client),
  });
}

function authorizationGate(fact: NormalizedFact, history: AggregateHistory, target: CompatibilityReportTarget): DerivedGate {
  const data = fact.data;
  const request = fact.request?.request;
  const fields = [
    data.authorizationRequestObserved,
    data.callbackReceived,
    data.stateMatches,
    data.authorizationEndpoint !== undefined,
    data.responseType === "code",
    data.redirectUri === history.redirectUri,
    data.resource === target.canonicalResource,
    data.codeChallengeMethod === "S256",
    data.codeChallenge !== undefined,
    data.authorizationCodePresent,
  ];
  if (fields.some((value) => value === undefined)) return gate("authorization-consent", "not-proven");
  const endpointMatches = history.authorizationEndpoint === undefined || data.authorizationEndpoint === history.authorizationEndpoint;
  const requestObserved = request?.method.toUpperCase() === "GET" && (request.requestResource === undefined || request.requestResource === target.canonicalResource);
  const unexpectedCredential = data.accessTokenPresent === true || data.refreshTokenPresent === true || data.idTokenPresent === true;
  const valid = fields.every(Boolean) && endpointMatches && requestObserved && !unexpectedCredential;
  return gate("authorization-consent", valid ? "pass" : "fail", {
    authorizationRequestObserved: data.authorizationRequestObserved,
    callbackReceived: data.callbackReceived,
    stateMatches: data.stateMatches,
    credentialPresence: data.callbackCredentialPresence,
  });
}

function loopbackPkceGate(
  facts: readonly NormalizedFact[],
  target: CompatibilityReportTarget,
  history: AggregateHistory,
): DerivedGate {
  const callbackFact = facts.find((fact) => fact.kind === "loopback" && fact.role === "callback");
  const requestFact = facts.find((fact) => fact.kind === "loopback" && fact.role === "request");
  const pkceFact = facts.find((fact) => fact.kind === "pkce" && fact.role === "positive");
  if (!callbackFact && !requestFact && !pkceFact) return gate("loopback-pkce", undefined, undefined, { kind: "missing-observation" });
  const callbackData = callbackFact?.data;
  const requestData = requestFact?.data;
  const registered = callbackData?.registeredRedirectUri as ReturnType<typeof loopbackUrl> | undefined ?? requestData?.registeredRedirectUri as ReturnType<typeof loopbackUrl> | undefined;
  const callback = callbackData?.callbackUrl as ReturnType<typeof loopbackUrl> | undefined;
  const requestCallback = requestData?.requestCallbackUrl as ReturnType<typeof loopbackUrl> | undefined;
  const hosts = targetLoopbackHosts(target);
  const registeredValid = Boolean(registered?.url && registered.host && hosts.includes(registered.host) && registered.path === "/oauth/callback" && registered.port === undefined && !registered.hasQuery && !registered.hasFragment);
  const callbackValid = Boolean(callback?.host && hosts.includes(callback.host) && callback.path === "/oauth/callback" && callback.port && !callback.hasFragment);
  const requestValid = Boolean(requestCallback?.host && hosts.includes(requestCallback.host) && requestCallback.path === "/oauth/callback" && requestCallback.port && !requestCallback.hasQuery && !requestCallback.hasFragment && requestData?.requestResource === target.canonicalResource && requestData?.portSelectedAtRequest === true);
  const callbackComplete = callbackData?.callbackReceived !== undefined;
  const requestComplete = requestData?.portSelectedAtRequest !== undefined;
  const pkceData = pkceFact?.data;
  const pkceRequest = pkceFact?.request?.request;
  const pkceComplete = pkceData !== undefined && pkceData.verifierPresent === true && pkceData.challengePresent === true && pkceData.verifierMatchesChallenge !== undefined && pkceData.method !== undefined && pkceData.requestResource !== undefined && pkceData.redirectUri !== undefined;
  const pkceValid = pkceComplete && pkceData.verifierMatchesChallenge === true && pkceData.method === "S256" && pkceData.requestResource === target.canonicalResource && pkceData.redirectUri === (history.redirectUri ?? registered?.url) && Boolean(pkceRequest && pkceRequest.requestClientId === history.clientId && pkceRequest.requestGrantType === "authorization_code" && pkceRequest.requestCodePresent === true && pkceRequest.requestCodeVerifierPresent === true && pkceRequest.requestRedirectUri === history.redirectUri && pkceRequest.requestResource === target.canonicalResource && pkceRequest.authorizationHeaderPresent === false);
  const anyIncomplete = !callbackFact || !requestFact || !pkceFact || !callbackComplete || !requestComplete || !pkceComplete;
  const valid = callbackData?.callbackReceived === true && callbackValid && registeredValid && requestValid && pkceValid;
  const status = valid ? "pass" : anyIncomplete ? "not-proven" : "fail";
  return gate("loopback-pkce", status, {
    requestResource: requestData?.requestResource ?? "unavailable",
    redirectUri: registered?.url ?? "unavailable",
    codeChallengeMethod: pkceData?.method ?? "unavailable",
    codeVerifierMatchesChallenge: pkceData?.verifierMatchesChallenge ?? "unknown",
  });
}

function negativeCaseStatus(
  fact: NormalizedFact,
  delegated: boolean,
): { readonly status: GateStatus; readonly requestStatus: number | "unknown"; readonly credentialPresence: AggregateCompatibilityCredentialPresence } {
  const response = responseFor(fact);
  const request = fact.request?.request;
  const credentialPresence = response?.credentialPresence ?? fact.request?.responseCredentialPresence ?? "unknown";
  const requestStatus = response?.status ?? request?.status ?? "unknown";
  if (!response?.complete || response.status === undefined || request === undefined) return { status: "not-proven", requestStatus, credentialPresence };
  if (credentialPresence === "present") return { status: "fail", requestStatus, credentialPresence };
  const rejected = delegated
    ? (response.status === 401 || response.status === 403)
    : response.status >= 400 && response.status < 500;
  if (rejected) return { status: "pass", requestStatus, credentialPresence };
  if (response.status >= 200 && response.status < 300) return { status: "fail", requestStatus, credentialPresence };
  return { status: "not-proven", requestStatus, credentialPresence };
}

function negativeGate(
  gateId: string,
  facts: readonly NormalizedFact[],
  cases: readonly string[],
  delegated: boolean,
): DerivedGate | undefined {
  const relevant = facts.filter((fact) => fact.role === "negative" && typeof fact.caseId === "string");
  if (!relevant.length) return undefined;
  const byCase = new Map(relevant.map((fact) => [fact.caseId as string, negativeCaseStatus(fact, delegated)]));
  const statuses = cases.map((caseId) => byCase.get(caseId)?.status);
  const status = statusFromValues(statuses);
  return gate(gateId, status, {
    cases: cases.map((caseId) => ({ case: caseId, status: byCase.get(caseId)?.status ?? "not-proven", requestStatus: byCase.get(caseId)?.requestStatus ?? "unknown", credentialPresence: byCase.get(caseId)?.credentialPresence ?? "unknown" })),
    rejectedCount: statuses.filter((value) => value === "pass").length,
    authorizedCount: statuses.filter((value) => value === "fail").length,
    requestStatuses: statuses.map((_, index) => byCase.get(cases[index] as string)?.requestStatus ?? "unknown"),
  }, status === "not-proven" ? { kind: "missing-observation" } : undefined);
}

function delegatedValidationGate(fact: NormalizedFact, target: CompatibilityReportTarget, history: AggregateHistory): DerivedGate {
  const data = fact.data as unknown as DelegatedTokenData;
  const request = fact.request?.request;
  if (!data.tokenObserved) return gate("delegated-token-validation", "not-proven");
  if (data.tokenMalformed || data.jwksMalformed) return gate("delegated-token-validation", "fail", {
    jwksFetched: data.jwksObserved,
    jwksKeyMatched: false,
    signatureValid: false,
    failures: ["malformed-observation"],
    checks: {},
  }, { kind: "malformed-observation" });
  if (!data.jwksObserved) return gate("delegated-token-validation", "not-proven", {
    jwksFetched: false,
    jwksKeyMatched: false,
    signatureValid: false,
    failures: [],
    checks: {},
  });
  const expectedClientId = history.clientId;
  const policy = evaluateDelegatedJwtPolicy(data.header, data.claims, {
    canonicalResource: target.canonicalResource,
    expectedClientId: expectedClientId ?? "",
    expectedIssuer: target.expectedAuthorizationServer,
    nowSeconds: data.sampledAtSeconds,
    tokenRequest: {
      clientId: request?.requestClientId,
      grantType: request?.requestGrantType,
      resource: request?.requestResource,
    },
  });
  const claimGrant = data.claims.grant_id;
  const grantContextMatches = typeof claimGrant !== "string" || history.grantId === undefined || claimGrant === history.grantId;
  const checks = {
    algorithmAllowed: policy.checks.algorithmAllowed,
    issuerMatches: policy.checks.issuerMatches,
    audienceMatches: policy.checks.audienceMatches,
    clientContextMatches: policy.checks.clientContextMatches,
    grantContextMatches: policy.checks.grantContextMatches && grantContextMatches,
    timeBoundsValid: policy.checks.timeBoundsValid,
  };
  const securityFailure = !data.keySelected || !data.signatureValid || !policy.checks.algorithmAllowed || !policy.checks.issuerMatches || !policy.checks.subjectPresent || !policy.checks.audienceMatches || !policy.checks.timeBoundsValid || (expectedClientId !== undefined && !policy.checks.clientContextMatches) || (request !== undefined && (!policy.checks.grantContextMatches || !policy.checks.resourceContextMatches)) || !grantContextMatches;
  const missingHistory = expectedClientId === undefined || request === undefined;
  const valid = data.keySelected && data.signatureValid && Object.values(checks).every(Boolean);
  if (!securityFailure && valid && typeof claimGrant === "string" && history.grantId === undefined) history.grantId = claimGrant;
  return gate("delegated-token-validation", securityFailure ? "fail" : missingHistory ? "not-proven" : valid ? "pass" : "fail", {
    jwksFetched: true,
    jwksKeyMatched: data.keySelected,
    signatureValid: data.signatureValid,
    failures: policy.failures,
    checks,
  });
}

function mcpOperationGate(fact: NormalizedFact, target: CompatibilityReportTarget): DerivedGate {
  const data = fact.data;
  const request = fact.request?.request;
  const response = responseFor(fact);
  const operationUrl = data.operationUrl as string | undefined ?? request?.url;
  const operationResource = data.operationResource as string | undefined ?? request?.requestResource;
  const requestStatus = request?.status ?? response?.status;
  const resourceMatches = operationResource === undefined
    ? operationUrl === target.canonicalResource
    : operationUrl === target.canonicalResource && operationResource === target.canonicalResource;
  const requestComplete = Boolean(request && operationUrl && requestStatus !== undefined);
  const sdkComplete = [data.connected, data.listToolsCompleted, data.callToolCompleted, data.resultIsError].every((value) => value !== undefined);
  const responseCredentialPresence = response?.credentialPresence ?? fact.request?.responseCredentialPresence ?? "unknown";
  const rejectedByBoundary = requestComplete && resourceMatches &&
    (requestStatus === 401 || requestStatus === 403 || bodyString(response?.body ?? {}, "error", "error_code") === "invalid_token") &&
    responseCredentialPresence === "absent";
  const attemptedFailure = requestComplete && resourceMatches && (data.resultIsError === true || rejectedByBoundary);
  const authorized = requestComplete && resourceMatches && request?.authorizationHeaderPresent === true && requestStatus !== undefined && requestStatus >= 200 && requestStatus < 300 && sdkComplete && data.connected === true && data.listToolsCompleted === true && data.callToolCompleted === true && data.resultIsError === false;
  const status = authorized ? "pass" : attemptedFailure || (requestComplete && !resourceMatches) ? "fail" : "not-proven";
  return gate("authenticated-mcp-operation", status, {
    operationUrl,
    operationResourceMatches: resourceMatches,
    resultIsError: data.resultIsError ?? "unavailable",
    requestStatus: requestStatus ?? "unavailable",
  });
}

function gateForFact(fact: NormalizedFact): string | undefined {
  if (fact.kind === "resource-discovery") return "resource-discovery";
  if (fact.kind === "provider-discovery") return "provider-discovery";
  if (fact.kind === "configuration") return "reproducible-configuration";
  if (fact.kind === "versions") return "versions";
  if (fact.kind === "registration") return "public-client-registration";
  if (fact.kind === "authorization") return "authorization-consent";
  if (fact.kind === "loopback" || (fact.kind === "pkce" && fact.role === "positive")) return "loopback-pkce";
  if (fact.kind === "pkce") return "pkce-negative-proof";
  if (fact.kind === "resource-binding") return "resource-binding-negative";
  if (fact.kind === "delegated-token" && fact.role === "validation") return "delegated-token-validation";
  if (fact.kind === "delegated-token") return "delegated-token-negative-boundary";
  if (fact.kind === "mcp-operation") return "authenticated-mcp-operation";
  return undefined;
}

function internalObservations(
  facts: readonly NormalizedFact[],
  target: CompatibilityReportTarget,
): EvidenceObservation[] {
  const compatibilityFacts = facts.filter((fact) => fact.source === "compatibility");
  const observations = new Map<string, DerivedGate>();
  const conflicts = new Set<string>();
  const seen = new Map<string, string>();
  for (const fact of facts) {
    const payload = JSON.stringify({ data: fact.data, request: fact.request });
    const prior = seen.get(fact.identity);
    if (prior !== undefined && prior !== payload) {
      const gateId = gateForFact(fact);
      if (gateId) conflicts.add(gateId);
    } else if (prior === undefined) {
      seen.set(fact.identity, payload);
    }
  }
  const history: AggregateHistory = {};
  const resourceFact = compatibilityFacts.find((fact) => fact.kind === "resource-discovery");
  const resource = resourceFact ? resourceDiscoveryGate(resourceFact, target) : undefined;
  if (resource) observations.set(resource.gateId, resource);
  const providerFact = compatibilityFacts.find((fact) => fact.kind === "provider-discovery");
  const provider = providerFact && resource?.status === "pass"
    ? providerDiscoveryGate(providerFact, target, history)
    : providerFact ? gate("provider-discovery", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (provider) observations.set(provider.gateId, provider);
  const configurationFact = compatibilityFacts.find((fact) => fact.kind === "configuration");
  if (configurationFact) observations.set("reproducible-configuration", configurationGate(configurationFact, target));
  const versionsFact = compatibilityFacts.find((fact) => fact.kind === "versions");
  if (versionsFact) observations.set("versions", versionsGate(versionsFact));

  const registrationFact = compatibilityFacts.find((fact) => fact.kind === "registration");
  const registration = registrationFact && provider?.status === "pass"
    ? registrationGate(registrationFact, target, history)
    : registrationFact ? gate("public-client-registration", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (registration) observations.set(registration.gateId, registration);
  const authorizationFact = compatibilityFacts.find((fact) => fact.kind === "authorization");
  const authorization = authorizationFact && registration?.status === "pass"
    ? authorizationGate(authorizationFact, history, target)
    : authorizationFact ? gate("authorization-consent", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (authorization) observations.set(authorization.gateId, authorization);
  const loopbackFacts = compatibilityFacts.filter((fact) => fact.kind === "loopback" || (fact.kind === "pkce" && fact.role === "positive"));
  const loopback = loopbackFacts.length && authorization?.status === "pass"
    ? loopbackPkceGate(compatibilityFacts, target, history)
    : loopbackFacts.length ? gate("loopback-pkce", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (loopback) observations.set(loopback.gateId, loopback);

  const pkceNegativeFacts = compatibilityFacts.filter((fact) => fact.kind === "pkce" && fact.role === "negative");
  const resourceNegativeFacts = compatibilityFacts.filter((fact) => fact.kind === "resource-binding");
  const pkceNegative = pkceNegativeFacts.length && loopback?.status === "pass"
    ? negativeGate("pkce-negative-proof", pkceNegativeFacts, PKCE_NEGATIVE_CASES, false)
    : pkceNegativeFacts.length ? gate("pkce-negative-proof", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (pkceNegative) observations.set(pkceNegative.gateId, pkceNegative);
  const resourceNegative = resourceNegativeFacts.length && loopback?.status === "pass"
    ? negativeGate("resource-binding-negative", resourceNegativeFacts, RESOURCE_NEGATIVE_CASES, false)
    : resourceNegativeFacts.length ? gate("resource-binding-negative", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (resourceNegative) observations.set(resourceNegative.gateId, resourceNegative);

  const tokenFact = compatibilityFacts.find((fact) => fact.kind === "delegated-token" && fact.role === "validation");
  const token = tokenFact && loopback?.status === "pass"
    ? delegatedValidationGate(tokenFact, target, history)
    : tokenFact ? gate("delegated-token-validation", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (token) observations.set(token.gateId, token);
  const negativeTokenFacts = compatibilityFacts.filter((fact) => fact.kind === "delegated-token" && fact.role === "negative");
  const negativeToken = negativeTokenFacts.length && token?.status === "pass"
    ? negativeGate("delegated-token-negative-boundary", negativeTokenFacts, DELEGATED_NEGATIVE_CASES, true)
    : negativeTokenFacts.length ? gate("delegated-token-negative-boundary", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (negativeToken) observations.set(negativeToken.gateId, negativeToken);
  const operationFact = compatibilityFacts.find((fact) => fact.kind === "mcp-operation");
  const operation = operationFact && token?.status === "pass"
    ? mcpOperationGate(operationFact, target)
    : operationFact ? gate("authenticated-mcp-operation", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (operation) observations.set(operation.gateId, operation);

  for (const [gateId, derived] of [...observations]) {
    if (conflicts.has(gateId)) observations.set(gateId, gate(gateId, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }));
    else observations.set(gateId, derived);
  }

  return [
    ...COMPATIBILITY_PROFILE.expandedGateIds
      .filter((gateId) => observations.has(gateId))
      .map((gateId) => normalizedGate(observations.get(gateId) as DerivedGate)),
    ...facts.flatMap((fact) => fact.request ? [{ kind: "request" as const, request: fact.request.request }] : []),
  ];
}

function classifierForCatalogGate(gateId: string): string {
  return MCP_ACCESS_GRANT_CATALOGS.gates[gateId]?.classifier ?? "unknown";
}

function catalogTemplateText(gateId: string, status: GateStatus): string {
  const classifier = classifierForCatalogGate(gateId);
  return MCP_ACCESS_GRANT_CATALOGS.templates[classifier]?.text[status] ?? `${classifier}: ${status}`;
}

function stableFailure(error?: unknown): AggregateCompatibilityEvidenceBoundaryError {
  void error;
  return new AggregateCompatibilityEvidenceBoundaryError();
}

function writerFunction(writer: AggregateCompatibilityArtifactWriter): (artifact: AggregateCompatibilityArtifact) => void | Promise<void> {
  return typeof writer === "function" ? writer : writer.write.bind(writer);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotOptions(options: AggregateCompatibilityEvidenceOptions): AggregateCompatibilityEvidenceOptions {
  if (!isRecord(options) || !isRecord(options.target) || typeof options.clock !== "function" || !options.writer || (typeof options.writer !== "function" && typeof options.writer.write !== "function")) throw new AggregateCompatibilityEvidenceBoundaryError();
  if (!isRecord(options.versions) || Object.keys(options.versions).length > MAX_OBJECT_KEYS) throw new AggregateCompatibilityEvidenceBoundaryError();
  const configuredSecrets = options.configuredSecrets ?? [];
  if (!Array.isArray(configuredSecrets) || configuredSecrets.length > MAX_CONFIGURED_SECRETS || configuredSecrets.some((secret) => typeof secret !== "string" || secret.length > MAX_CONFIGURED_SECRET_LENGTH)) throw new AggregateCompatibilityEvidenceBoundaryError();
  const versions = Object.fromEntries(Object.entries(options.versions).map(([key, value]) => {
    if (key.length > MAX_STRING_LENGTH || typeof value !== "string" || value.length > MAX_STRING_LENGTH) throw new AggregateCompatibilityEvidenceBoundaryError();
    return [key, value];
  }));
  const target = {
    name: boundedString(options.target.name) ?? "",
    canonicalResource: boundedString(options.target.canonicalResource) ?? "",
    supabaseUrl: boundedString(options.target.supabaseUrl) ?? "",
    expectedAuthorizationServer: boundedString(options.target.expectedAuthorizationServer) ?? "",
    ...(options.target.loopbackHosts ? { loopbackHosts: [...options.target.loopbackHosts] } : {}),
  } satisfies CompatibilityReportTarget;
  return deepFreeze({ target, versions, configuredSecrets: [...configuredSecrets], clock: options.clock, writer: writerFunction(options.writer) });
}

function sampleClock(clock: () => string, previous?: number): { readonly value: string; readonly millis: number } {
  let value: unknown;
  try {
    value = clock();
  } catch {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  if (typeof value !== "string" || value.length > 64) throw new AggregateCompatibilityEvidenceBoundaryError();
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || (previous !== undefined && millis < previous)) throw new AggregateCompatibilityEvidenceBoundaryError();
  return { value: new Date(millis).toISOString(), millis };
}

async function persist(writer: (artifact: AggregateCompatibilityArtifact) => void | Promise<void>, artifact: AggregateCompatibilityArtifact): Promise<boolean> {
  try {
    await writer(artifact);
    return true;
  } catch {
    return false;
  }
}

function artifact(contents: string): AggregateCompatibilityArtifact {
  return deepFreeze({ filename: MCP_ACCESS_GRANT_ARTIFACT_NAME, contents });
}

function finalizeRun(
  facts: readonly NormalizedFact[],
  options: AggregateCompatibilityEvidenceOptions,
  startedAt: string,
  finishedAt: string,
  artifactWriteSucceeded?: boolean,
) {
  const context = createEvidenceRunContext({
    configuredSecrets: options.configuredSecrets ?? [],
    time: { startedAt, finishedAt },
    versions: options.versions,
  });
  return finalizeEvidence({
    issue: COMPATIBILITY_PROFILE.issue,
    target: options.target,
    requiredGateIds: COMPATIBILITY_PROFILE.expandedGateIds,
    observations: internalObservations(facts, options.target),
    ...(artifactWriteSucceeded !== undefined ? { artifactWriteSucceeded } : {}),
  }, context);
}

/** Run one private aggregate compatibility evidence session. */
export async function runAggregateCompatibilityEvidence(
  optionsInput: AggregateCompatibilityEvidenceOptions,
  journey: (recorders: AggregateCompatibilityRecorders) => void | Promise<void>,
): Promise<AggregateCompatibilityEvidenceResult> {
  let options: AggregateCompatibilityEvidenceOptions;
  try {
    options = snapshotOptions(optionsInput);
  } catch (error) {
    throw stableFailure(error);
  }
  let start: { readonly value: string; readonly millis: number };
  try {
    start = sampleClock(options.clock);
  } catch (error) {
    throw stableFailure(error);
  }

  const facts: NormalizedFact[] = [];
  const pending = new Set<Promise<void>>();
  let recordChain = Promise.resolve();
  let closed = false;
  let poisoned = false;
  let lastClock = start.millis;

  const record = (source: "compatibility" | "public-client", fact: AggregateCompatibilityFact | AggregatePublicClientFact): Promise<void> => {
    if (closed) {
      const failure = Promise.reject(stableFailure());
      void failure.catch(() => undefined);
      return failure;
    }
    const accepted = recordChain.then(async () => {
      try {
        const sampled = isRecord(fact) && fact.kind === "delegated-token"
          ? sampleClock(options.clock, lastClock)
          : { value: "", millis: lastClock };
        lastClock = sampled.millis;
        const normalized = await normalizeFact(fact, source, sampled.millis);
        facts.push(normalized);
      } catch (error) {
        poisoned = true;
        throw stableFailure(error);
      }
    });
    recordChain = accepted.catch(() => undefined);
    pending.add(accepted);
    void accepted.finally(() => pending.delete(accepted)).catch(() => undefined);
    return accepted;
  };

  const recorders: AggregateCompatibilityRecorders = Object.freeze({
    compatibility: Object.freeze({ record: (fact: AggregateCompatibilityFact) => record("compatibility", fact) }),
    publicClient: Object.freeze({ record: (fact: AggregatePublicClientFact) => record("public-client", fact) }),
  });
  try {
    await journey(recorders);
  } catch (error) {
    closed = true;
    await Promise.allSettled([...pending]);
    throw stableFailure(error);
  }
  closed = true;
  await Promise.allSettled([...pending]);
  if (poisoned) throw stableFailure();

  let finish: { readonly value: string; readonly millis: number };
  try {
    finish = sampleClock(options.clock, lastClock);
  } catch (error) {
    throw stableFailure(error);
  }
  const writer = writerFunction(options.writer);
  const preliminary = finalizeRun(facts, options, start.value, finish.value, true);
  const preliminaryArtifact = artifact(preliminary.verification.serialized);
  if (preliminary.verification.sanitized && await persist(writer, preliminaryArtifact)) {
    return { report: preliminary.report, artifact: preliminaryArtifact, verification: preliminary.verification, artifactWriteSucceeded: true };
  }
  const failure = finalizeRun(facts, options, start.value, finish.value, false);
  const failureArtifact = artifact(failure.verification.serialized);
  let failureWriteSucceeded = false;
  for (let attempt = 0; attempt < 2 && !failureWriteSucceeded; attempt += 1) failureWriteSucceeded = await persist(writer, failureArtifact);
  return { report: failure.report, artifact: failureArtifact, verification: failure.verification, artifactWriteSucceeded: failureWriteSucceeded };
}
