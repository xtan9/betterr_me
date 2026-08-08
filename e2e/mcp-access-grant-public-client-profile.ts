import {
  classifyNegativeRegistration,
  classifyFactIdentity,
  MCP_ACCESS_GRANT_ARTIFACT_NAME,
  MCP_ACCESS_GRANT_CATALOGS,
  MCP_ACCESS_GRANT_FAMILIES,
  MCP_ACCESS_GRANT_LOOPBACK_HOSTS,
  PUBLIC_CLIENT_PROFILE,
  type CatalogFamily,
  type CatalogFactKind,
  type GateStatus,
} from "./mcp-access-grant-catalogs";
import {
  browserUrlCredentialEvidence,
  classifyAuthorizationOutcome,
  classifyConsentPresentation,
  createEvidenceRunContext,
  finalizeEvidence,
  hasUnnegatedEndorsementLanguage,
  sanitizeUrl,
  type AuthorizationOutcomeObservation,
  type CompatibilityReport,
  type CompatibilityReportTarget,
  type EvidenceError,
  type EvidenceObservation,
  type EvidenceVerification,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";
import {
  isSupportedLoopbackRegistrationRedirect,
  matchesS256CodeChallenge,
} from "./mcp-access-grant-policy";
import type { LoopbackHost } from "./mcp-access-grant-journey";

/**
 * The standalone Candidate 2 public-client operation.
 *
 * This module is deterministic and deliberately does not import either live
 * adapter. The callback receives only a source-bound recorder. The recorder
 * accepts primitive protocol observations and derives all evidence decisions
 * after the callback has settled.
 */

export type PublicClientFamily = "ipv4" | "ipv6";
export type PublicClientCredentialPresence = "present" | "absent" | "unknown";

type JsonPrimitive = string | number | boolean | null;
export type PublicClientJsonValue =
  | JsonPrimitive
  | readonly PublicClientJsonValue[]
  | { readonly [key: string]: PublicClientJsonValue };

export interface PublicClientResponseSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body?: PublicClientJsonValue;
  readonly headers?: { readonly [key: string]: PublicClientJsonValue };
  readonly location?: string;
  readonly browserUrl?: string;
  readonly callbackUrl?: string;
}

export interface PublicClientRequestInput {
  readonly method: string;
  readonly url: string;
  readonly bodyFields?: readonly string[];
  readonly authorizationHeaderPresent?: boolean;
  readonly status?: number;
  readonly response?: PublicClientResponseSurface;
}

export interface PublicClientDiscoveryObservation {
  readonly response?: PublicClientResponseSurface;
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

export interface PublicClientConfigurationObservation {
  readonly loopbackHosts?: readonly string[];
  readonly providerCredentialsAvailable?: boolean;
}

export interface PublicClientConsentObservation {
  readonly clientNameVisible?: boolean;
  readonly clientUriVisible?: boolean;
  readonly logoVisible?: boolean;
  readonly softwareIdVisible?: boolean;
  readonly softwareVersionVisible?: boolean;
  readonly untrustedDisclaimerVisible?: boolean;
  readonly endorsementText?: string;
  readonly endorsementLanguageVisible?: boolean;
}

export interface PublicClientApprovalObservation {
  readonly affirmativeControlVisible?: boolean;
  readonly denialControlVisible?: boolean;
  readonly callbackBeforeDecision?: boolean;
  readonly decision?: "affirmative" | "denial" | "abandonment";
}

export interface PublicClientAuthorizationOutcomeObservation {
  readonly callbackComplete?: boolean;
  readonly callbackReceived?: boolean;
  readonly callbackUrl?: string;
  readonly browserUrl?: string;
  readonly expectedState?: string;
  readonly callbackState?: string;
  readonly authorizationError?: boolean;
  readonly tokenRequestObserved?: boolean;
  readonly tokenResponse?: PublicClientResponseSurface;
}

export interface PublicClientLoopbackObservation {
  readonly registeredRedirectUri: string;
  readonly callbackUrl?: string;
  readonly callbackReceived?: boolean;
  readonly requestCallbackUrl?: string;
  readonly requestResource?: string;
  readonly portSelectedAtRequest?: boolean;
}

export interface PublicClientPkceObservation {
  readonly verifier?: string;
  readonly challenge?: string;
  readonly method?: string;
  readonly requestResource?: string;
}

export interface PublicClientCleanupObservation {
  readonly grantPresent?: boolean;
  readonly requestStatus?: number;
}

export type PublicClientFact =
  | {
      readonly kind: "resource-discovery";
      readonly role: "primary";
      readonly response?: PublicClientResponseSurface;
      readonly advertisedResource?: string;
      readonly advertisedAuthorizationServer?: string;
      readonly observation?: PublicClientDiscoveryObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "provider-discovery";
      readonly role: "primary";
      readonly response?: PublicClientResponseSurface;
      readonly issuer?: string;
      readonly authorizationEndpoint?: string;
      readonly registrationEndpoint?: string;
      readonly tokenEndpoint?: string;
      readonly jwksUri?: string;
      readonly grantTypesSupported?: readonly string[];
      readonly responseTypesSupported?: readonly string[];
      readonly tokenEndpointAuthMethodsSupported?: readonly string[];
      readonly codeChallengeMethodsSupported?: readonly string[];
      readonly observation?: PublicClientDiscoveryObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "configuration";
      readonly role: "snapshot";
      readonly observation?: PublicClientConfigurationObservation;
    }
  | {
      readonly kind: "versions";
      readonly role: "snapshot";
      readonly values?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "registration";
      readonly role: "primary" | "negative";
      readonly family: PublicClientFamily;
      readonly caseId?: PublicClientNegativeRegistrationCase;
      readonly response?: PublicClientResponseSurface;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "consent";
      readonly role: "metadata";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientConsentObservation;
    }
  | {
      readonly kind: "authorization";
      readonly role: "approval" | "denial" | "abandonment";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientApprovalObservation | PublicClientAuthorizationOutcomeObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "loopback";
      readonly role: "callback" | "request";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientLoopbackObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "pkce";
      readonly role: "exchange";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientPkceObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "cleanup";
      readonly role: "family";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientCleanupObservation;
    };

export type PublicClientNegativeRegistrationCase =
  | "unsupported-client-auth-method"
  | "unsupported-grant-type"
  | "unsupported-response-type"
  | "malformed-metadata"
  | "unsafe-redirect-metadata";

export interface PublicClientArtifact {
  readonly filename: typeof MCP_ACCESS_GRANT_ARTIFACT_NAME;
  readonly contents: string;
}

export type PublicClientArtifactWriter =
  | ((artifact: PublicClientArtifact) => void | Promise<void>)
  | { readonly write: (artifact: PublicClientArtifact) => void | Promise<void> };

export interface PublicClientEvidenceOptions {
  readonly target: CompatibilityReportTarget;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets?: readonly string[];
  readonly clock: () => string;
  readonly writer: PublicClientArtifactWriter;
}

export interface PublicClientEvidenceResult {
  readonly report: CompatibilityReport;
  readonly artifact: PublicClientArtifact;
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
  readonly credentialPresence: PublicClientCredentialPresence;
}

interface NormalizedRequest {
  readonly request: MinimizedRequestObservation;
  readonly responseCredentialPresence: PublicClientCredentialPresence;
}

interface NormalizedFact {
  readonly identity: string;
  readonly kind: PublicClientFact["kind"];
  readonly role: string;
  readonly family?: PublicClientFamily;
  readonly caseId?: PublicClientNegativeRegistrationCase;
  readonly data: Record<string, unknown>;
  readonly request?: NormalizedRequest;
}

interface DerivedGate {
  readonly gateId: string;
  readonly status?: GateStatus;
  readonly evidence?: Record<string, unknown>;
  readonly error?: EvidenceError;
}

const MAX_FACT_DEPTH = 4;
const MAX_FACT_ARRAY_ITEMS = 32;
const MAX_FACT_OBJECT_KEYS = 64;
const MAX_FACT_STRING_LENGTH = 500;
const MAX_CONFIGURED_SECRETS = 32;
const MAX_CONFIGURED_SECRET_LENGTH = 500;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
]);
const SENSITIVE_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|verifier|state|code)$/i;
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|cookie|authorization|secret|token|code)$/i;
const CREDENTIAL_QUERY_KEY = /^(?:code|access_token|refresh_token|id_token|client_secret|token)$/i;
const PUBLIC_FAMILY_KINDS = new Set(["registration", "consent", "authorization", "loopback", "pkce", "cleanup"]);
const NEGATIVE_CASES: readonly PublicClientNegativeRegistrationCase[] = [
  "unsupported-client-auth-method",
  "unsupported-grant-type",
  "unsupported-response-type",
  "malformed-metadata",
  "unsafe-redirect-metadata",
];
const FAMILY_GATE_BASES = [
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

class PublicClientEvidenceBoundaryError extends Error {
  constructor() {
    super("Public-client evidence journey failed.");
    this.name = "PublicClientEvidenceBoundaryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoConclusionFields(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (CONCLUSION_KEYS.has(key)) throw new PublicClientEvidenceBoundaryError();
  }
}

function boundedString(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= MAX_FACT_STRING_LENGTH ? value : undefined;
}

function boundedBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function boundedNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function minimizeEmbeddedCredentialText(value: string): { readonly value: string; readonly credentialPresence: PublicClientCredentialPresence } {
  const credentialPattern = /Bearer\s+[^\s]+|\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=([^&#\s]+)/i;
  const credentialPresence = credentialPattern.test(value) ? "present" : "absent";
  return {
    value: value
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT REDACTED]")
      .replace(/((?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=)[^&#\s]+/gi, "$1[REDACTED]"),
    credentialPresence,
  };
}

function credentialFromText(value: string | undefined): PublicClientCredentialPresence {
  if (!value) return "absent";
  try {
    const url = new URL(value);
    for (const [key, queryValue] of url.searchParams) {
      if (CREDENTIAL_QUERY_KEY.test(key) && queryValue.length > 0) return "present";
    }
    for (const [key, queryValue] of new URLSearchParams(url.hash.replace(/^#/, ""))) {
      if (CREDENTIAL_QUERY_KEY.test(key) && queryValue.length > 0) return "present";
    }
  } catch {
    if (/(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=/i.test(value)) {
      return "present";
    }
  }
  return "absent";
}

interface UrlCredentialEvidence {
  readonly credentialPresence: PublicClientCredentialPresence;
  readonly authorizationCodePresent: boolean;
  readonly accessTokenPresent: boolean;
  readonly refreshTokenPresent: boolean;
  readonly idTokenPresent: boolean;
}

function urlCredentialEvidence(value: string | undefined): UrlCredentialEvidence {
  const absent: UrlCredentialEvidence = {
    credentialPresence: "absent",
    authorizationCodePresent: false,
    accessTokenPresent: false,
    refreshTokenPresent: false,
    idTokenPresent: false,
  };
  if (!value) return absent;
  try {
    const url = new URL(value);
    const parameters = [
      ...url.searchParams.entries(),
      ...new URLSearchParams(url.hash.replace(/^#/, "")).entries(),
    ];
    const present = parameters.filter(([key, queryValue]) => CREDENTIAL_QUERY_KEY.test(key) && queryValue.length > 0);
    return {
      credentialPresence: present.length > 0 ? "present" : "absent",
      authorizationCodePresent: present.some(([key]) => key.toLowerCase() === "code"),
      accessTokenPresent: present.some(([key]) => key.toLowerCase() === "access_token"),
      refreshTokenPresent: present.some(([key]) => key.toLowerCase() === "refresh_token"),
      idTokenPresent: present.some(([key]) => key.toLowerCase() === "id_token"),
    };
  } catch {
    return /(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=([^&#\s]+)/i.test(value)
      ? { ...absent, credentialPresence: "present" }
      : { ...absent, credentialPresence: "unknown" };
  }
}

function bodyCredentialEvidence(body: Record<string, unknown>): UrlCredentialEvidence {
  const keys = Object.keys(body).filter((key) => CREDENTIAL_KEY.test(key));
  return {
    credentialPresence: keys.length > 0 ? "present" : "absent",
    authorizationCodePresent: keys.some((key) => key.toLowerCase() === "code"),
    accessTokenPresent: keys.some((key) => /^(?:access[_-]?token)$/i.test(key)),
    refreshTokenPresent: keys.some((key) => /^(?:refresh[_-]?token)$/i.test(key)),
    idTokenPresent: keys.some((key) => /^(?:id[_-]?token)$/i.test(key)),
  };
}

function combineCredentialPresence(
  values: readonly PublicClientCredentialPresence[],
): PublicClientCredentialPresence {
  if (values.includes("present")) return "present";
  if (values.includes("unknown")) return "unknown";
  return "absent";
}

function inspectJson(
  value: unknown,
  depth = 0,
  key?: string,
): { value: unknown; credentialPresence: PublicClientCredentialPresence; complete: boolean } {
  if (depth > MAX_FACT_DEPTH) return { value: "[REDACTED: depth limit]", credentialPresence: "unknown", complete: false };
  if (typeof value === "string") {
    const keyCredentialPresence = key && CREDENTIAL_KEY.test(key) && value.length > 0 ? "present" : "absent";
    const sensitive = key && SENSITIVE_KEY.test(key) && value.length > 0;
    if (value.length > MAX_FACT_STRING_LENGTH) return { value: "[REDACTED: length limit]", credentialPresence: "unknown", complete: false };
    const minimized = minimizeEmbeddedCredentialText(value);
    return {
      value: sensitive ? "[REDACTED]" : minimized.value,
      credentialPresence: combineCredentialPresence([keyCredentialPresence, minimized.credentialPresence]),
      complete: true,
    };
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return { value, credentialPresence: "absent", complete: true };
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_FACT_ARRAY_ITEMS) return { value: "[REDACTED: array limit]", credentialPresence: "unknown", complete: false };
    const children = value.map((child) => inspectJson(child, depth + 1, key));
    return {
      value: children.map((child) => child.value),
      credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)),
      complete: children.every((child) => child.complete),
    };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_FACT_OBJECT_KEYS) return { value: "[REDACTED: object limit]", credentialPresence: "unknown", complete: false };
    const output: Record<string, unknown> = {};
    const children = entries.map(([childKey, child]) => {
      const result = inspectJson(child, depth + 1, childKey);
      const sensitive = SENSITIVE_KEY.test(childKey);
      const credential = CREDENTIAL_KEY.test(childKey) && child !== null && child !== undefined && !(typeof child === "string" && child.length === 0);
      output[childKey] = sensitive ? "[REDACTED]" : result.value;
      return {
        ...result,
        credentialPresence: credential ? "present" as const : result.credentialPresence,
      };
    });
    return {
      value: output,
      credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)),
      complete: children.every((child) => child.complete),
    };
  }
  return { value: "[REDACTED: unsupported value]", credentialPresence: "unknown", complete: false };
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

function normalizeSurface(value: unknown): NormalizedSurface {
  if (!isRecord(value)) {
    return { complete: false, body: {}, credentialPresence: "unknown" };
  }
  const inspectedBody = "body" in value
    ? inspectJson(value.body)
    : { value: {}, credentialPresence: "absent" as const, complete: true };
  const inspectedHeaders = "headers" in value
    ? inspectJson(value.headers)
    : { value: {}, credentialPresence: "absent" as const, complete: true };
  const completeFlag = value.complete === true;
  const textKeys = ["location", "browserUrl", "callbackUrl"] as const;
  const textValues = textKeys.map((key) => boundedString(value[key]));
  const textCredential = combineCredentialPresence(textValues.map(credentialFromText));
  const credentialPresence = combineCredentialPresence([
    inspectedBody.credentialPresence,
    inspectedHeaders.credentialPresence,
    textCredential,
  ]);
  const body = isRecord(inspectedBody.value) ? inspectedBody.value : {};
  const textComplete = textKeys.every((key) => !(key in value) || boundedString(value[key]) !== undefined);
  const complete = completeFlag && inspectedBody.complete && inspectedHeaders.complete && textComplete;
  const location = boundedString(value.location);
  const browserUrl = boundedString(value.browserUrl);
  const callbackUrl = boundedString(value.callbackUrl);
  return {
    complete,
    status: boundedNumber(value.status),
    body,
    ...(location ? { location: sanitizeUrl(location) } : {}),
    ...(browserUrl ? { browserUrl: sanitizeUrl(browserUrl) } : {}),
    ...(callbackUrl ? { callbackUrl: sanitizeUrl(callbackUrl) } : {}),
    credentialPresence: complete ? credentialPresence : credentialPresence === "present" ? "present" : "unknown",
  };
}

function normalizeRequest(value: unknown): NormalizedRequest | undefined {
  if (!isRecord(value)) return undefined;
  const method = boundedString(value.method);
  const url = boundedString(value.url);
  if (!method || !url) throw new PublicClientEvidenceBoundaryError();
  const response = normalizeSurface(value.response);
  const request: MinimizedRequestObservation = {
    method: method.toUpperCase(),
    url: sanitizeUrl(url),
    requestBodyFields: Array.isArray(value.bodyFields)
      ? value.bodyFields.slice(0, MAX_FACT_ARRAY_ITEMS).filter((field): field is string => typeof field === "string" && field.length <= MAX_FACT_STRING_LENGTH).map((field) => field.replace(/(?:code|state|token|secret|verifier)/gi, "[REDACTED]"))
      : [],
    authorizationHeaderPresent: value.authorizationHeaderPresent === true,
    ...(boundedNumber(value.status) !== undefined ? { status: boundedNumber(value.status) } : {}),
    ...(response.credentialPresence === "present"
      ? { responseContainsCredentials: true }
      : response.complete && response.credentialPresence === "absent"
        ? { responseContainsCredentials: false }
        : {}),
  };
  return { request, responseCredentialPresence: response.credentialPresence };
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_FACT_ARRAY_ITEMS) return undefined;
  const result = value.map((item) => boundedString(item));
  return result.every((item): item is string => item !== undefined) ? result : undefined;
}

function discoveryData(fact: Record<string, unknown>): Record<string, unknown> {
  const observation = isRecord(fact.observation) ? fact.observation : {};
  const response = fact.response ?? observation.response;
  const normalized = normalizeSurface(response);
  return {
    response: normalized,
    advertisedResource: boundedString(fact.advertisedResource ?? observation.advertisedResource) ?? bodyString(normalized.body, "resource", "resource_uri"),
    advertisedAuthorizationServer: boundedString(fact.advertisedAuthorizationServer ?? observation.advertisedAuthorizationServer) ?? bodyString(normalized.body, "authorization_server", "authorizationServer"),
    issuer: boundedString(fact.issuer ?? observation.issuer) ?? bodyString(normalized.body, "issuer"),
    authorizationEndpoint: boundedString(fact.authorizationEndpoint ?? observation.authorizationEndpoint) ?? bodyString(normalized.body, "authorization_endpoint", "authorizationEndpoint"),
    registrationEndpoint: boundedString(fact.registrationEndpoint ?? observation.registrationEndpoint) ?? bodyString(normalized.body, "registration_endpoint", "registrationEndpoint"),
    tokenEndpoint: boundedString(fact.tokenEndpoint ?? observation.tokenEndpoint) ?? bodyString(normalized.body, "token_endpoint", "tokenEndpoint"),
    jwksUri: boundedString(fact.jwksUri ?? observation.jwksUri) ?? bodyString(normalized.body, "jwks_uri", "jwksUri"),
    grantTypesSupported: normalizeStringList(fact.grantTypesSupported ?? observation.grantTypesSupported) ?? bodyStringArray(normalized.body, "grant_types_supported", "grantTypesSupported"),
    responseTypesSupported: normalizeStringList(fact.responseTypesSupported ?? observation.responseTypesSupported) ?? bodyStringArray(normalized.body, "response_types_supported", "responseTypesSupported"),
    tokenEndpointAuthMethodsSupported: normalizeStringList(fact.tokenEndpointAuthMethodsSupported ?? observation.tokenEndpointAuthMethodsSupported) ?? bodyStringArray(normalized.body, "token_endpoint_auth_methods_supported", "tokenEndpointAuthMethodsSupported"),
    codeChallengeMethodsSupported: normalizeStringList(fact.codeChallengeMethodsSupported ?? observation.codeChallengeMethodsSupported) ?? bodyStringArray(normalized.body, "code_challenge_methods_supported", "codeChallengeMethodsSupported"),
  };
}

function validateTopLevelFact(fact: unknown): asserts fact is Record<string, unknown> {
  if (!isRecord(fact)) throw new PublicClientEvidenceBoundaryError();
  assertNoConclusionFields(fact);
  if (typeof fact.kind !== "string" || typeof fact.role !== "string") throw new PublicClientEvidenceBoundaryError();
  if (PUBLIC_FAMILY_KINDS.has(fact.kind)) {
    if (fact.family !== "ipv4" && fact.family !== "ipv6") throw new PublicClientEvidenceBoundaryError();
  } else if ("family" in fact) {
    throw new PublicClientEvidenceBoundaryError();
  }
}

function normalizedFamily(value: unknown): PublicClientFamily | undefined {
  return value === "ipv4" || value === "ipv6" ? value : undefined;
}

function loopbackHost(family: PublicClientFamily): LoopbackHost {
  return family === "ipv4" ? "127.0.0.1" : "::1";
}

interface NormalizedLoopbackUrl {
  readonly url: string;
  readonly protocol?: string;
  readonly host?: string;
  readonly path?: string;
  readonly port?: number;
  readonly hasQuery?: boolean;
  readonly hasFragment?: boolean;
  readonly hasCredential: boolean;
}

function normalizeLoopbackUrl(value: unknown): NormalizedLoopbackUrl | undefined {
  const raw = boundedString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return {
      url: sanitizeUrl(raw),
      protocol: url.protocol,
      host: url.hostname.replace(/^\[|\]$/g, ""),
      path: url.pathname,
      port: url.port ? Number(url.port) : undefined,
      hasQuery: url.search.length > 0,
      hasFragment: url.hash.length > 0,
      hasCredential: credentialFromText(raw) === "present",
    };
  } catch {
    return { url: "[REDACTED: malformed URL]", hasCredential: credentialFromText(raw) === "present" };
  }
}

function normalizeFact(value: PublicClientFact): NormalizedFact {
  validateTopLevelFact(value);
  const raw = value as unknown as Record<string, unknown>;
  const kind = raw.kind as PublicClientFact["kind"];
  const role = typeof raw.role === "string" ? raw.role : "";
  const family = normalizedFamily(raw.family);
  if (PUBLIC_FAMILY_KINDS.has(kind) && !family) throw new PublicClientEvidenceBoundaryError();
  const catalogIdentity = classifyFactIdentity({
    profile: "public-client",
    source: "public-client",
    kind: kind as CatalogFactKind,
    role,
    family: (family ?? "none") as CatalogFamily,
  });
  if (!catalogIdentity.accepted || catalogIdentity.authority !== "authoritative") throw new PublicClientEvidenceBoundaryError();

  if (kind === "resource-discovery" || kind === "provider-discovery") {
    if (role !== "primary") throw new PublicClientEvidenceBoundaryError();
    const data = discoveryData(raw);
    return {
      identity: `${kind}|primary`,
      kind,
      role,
      data,
      request: normalizeRequest(raw.request),
    };
  }
  if (kind === "configuration") {
    if (role !== "snapshot") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const hosts = normalizeStringList(observation.loopbackHosts);
    return {
      identity: "configuration|snapshot",
      kind,
      role,
      data: {
        loopbackHosts: hosts,
        providerCredentialsAvailable: boundedBoolean(observation.providerCredentialsAvailable),
      },
    };
  }
  if (kind === "versions") {
    if (role !== "snapshot") throw new PublicClientEvidenceBoundaryError();
    const versionEntries = isRecord(raw.values) ? Object.entries(raw.values) : [];
    if (versionEntries.length > MAX_FACT_OBJECT_KEYS) throw new PublicClientEvidenceBoundaryError();
    const values = isRecord(raw.values) ? Object.fromEntries(
      Object.entries(raw.values).map(([key, child]) => [key, boundedString(child)]).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ) : {};
    return { identity: "versions|snapshot", kind, role, data: { values } };
  }
  if (!family) throw new PublicClientEvidenceBoundaryError();

  if (kind === "registration") {
    if (role !== "primary" && role !== "negative") throw new PublicClientEvidenceBoundaryError();
    const response = normalizeSurface(raw.response);
    const request = normalizeRequest(raw.request);
    const caseId = raw.caseId;
    if (role === "negative" && !NEGATIVE_CASES.includes(caseId as PublicClientNegativeRegistrationCase)) throw new PublicClientEvidenceBoundaryError();
    if (role === "primary" && caseId !== undefined) throw new PublicClientEvidenceBoundaryError();
    return {
      identity: `registration|${role}|${family}|${caseId ?? "primary"}`,
      kind,
      role,
      family,
      caseId: caseId as PublicClientNegativeRegistrationCase | undefined,
      data: {
        response,
        ...(role === "primary" ? { clientId: bodyString(response.body, "client_id", "clientId") } : {}),
      },
      request,
    };
  }

  if (kind === "consent") {
    if (role !== "metadata") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const endorsementText = boundedString(observation.endorsementText);
    const endorsementLanguageVisible = endorsementText !== undefined
      ? hasUnnegatedEndorsementLanguage(endorsementText)
      : boundedBoolean(observation.endorsementLanguageVisible);
    return {
      identity: `consent|metadata|${family}`,
      kind,
      role,
      family,
      data: {
        clientNameVisible: boundedBoolean(observation.clientNameVisible),
        clientUriVisible: boundedBoolean(observation.clientUriVisible),
        logoVisible: boundedBoolean(observation.logoVisible),
        softwareIdVisible: boundedBoolean(observation.softwareIdVisible),
        softwareVersionVisible: boundedBoolean(observation.softwareVersionVisible),
        untrustedDisclaimerVisible: boundedBoolean(observation.untrustedDisclaimerVisible),
        endorsementLanguageVisible,
      },
    };
  }

  if (kind === "authorization") {
    if (role !== "approval" && role !== "denial" && role !== "abandonment") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    if (role === "approval") {
      return {
        identity: `authorization|approval|${family}`,
        kind,
        role,
        family,
        data: {
          affirmativeControlVisible: boundedBoolean(observation.affirmativeControlVisible),
          denialControlVisible: boundedBoolean(observation.denialControlVisible),
          callbackBeforeDecision: boundedBoolean(observation.callbackBeforeDecision),
          decision: observation.decision === "affirmative" || observation.decision === "denial" || observation.decision === "abandonment" ? observation.decision : undefined,
        },
        request: normalizeRequest(raw.request),
      };
    }
    const callbackUrl = boundedString(observation.callbackUrl);
    const browserUrl = boundedString(observation.browserUrl);
    const callbackEvidence = urlCredentialEvidence(callbackUrl);
    const browserEvidence = browserUrl ? browserUrlCredentialEvidence(browserUrl) : undefined;
    const expectedState = boundedString(observation.expectedState);
    const callbackState = boundedString(observation.callbackState);
    const tokenResponse = normalizeSurface(observation.tokenResponse);
    const tokenResponsePresence: PublicClientCredentialPresence = "tokenResponse" in observation
      ? tokenResponse.credentialPresence
      : "absent";
    const tokenBodyEvidence = bodyCredentialEvidence(tokenResponse.body);
    const credentialPresence = combineCredentialPresence([
      callbackEvidence.credentialPresence,
      browserEvidence?.credentialObserved ? "present" : "absent",
      tokenResponsePresence,
      observation.callbackComplete === true ? "absent" : "unknown",
    ]);
    const authorizationCodePresent = callbackEvidence.authorizationCodePresent || Boolean(browserEvidence?.authorizationCodePresent) || tokenBodyEvidence.authorizationCodePresent;
    const accessTokenObserved = callbackEvidence.accessTokenPresent || Boolean(browserEvidence?.accessTokenPresent) || tokenBodyEvidence.accessTokenPresent;
    const refreshTokenObserved = callbackEvidence.refreshTokenPresent || Boolean(browserEvidence?.refreshTokenPresent) || tokenBodyEvidence.refreshTokenPresent;
    const idTokenObserved = callbackEvidence.idTokenPresent || Boolean(browserEvidence?.idTokenPresent) || tokenBodyEvidence.idTokenPresent;
    return {
      identity: `authorization|${role}|${family}`,
      kind,
      role,
      family,
      data: {
        callbackReceived: boundedBoolean(observation.callbackReceived) ?? Boolean(observation.callbackComplete && callbackUrl),
        callbackComplete: observation.callbackComplete === true,
        authorizationError: boundedBoolean(observation.authorizationError),
        stateMatches: expectedState !== undefined && callbackState !== undefined
          ? expectedState === callbackState
          : undefined,
        tokenRequestObserved: boundedBoolean(observation.tokenRequestObserved),
        credentialPresence,
        authorizationCodePresent,
        accessTokenObserved,
        refreshTokenObserved,
        idTokenObserved,
        unexpectedCredentialObserved: credentialPresence === "present" && !authorizationCodePresent && !accessTokenObserved && !refreshTokenObserved && !idTokenObserved,
        callbackUrl: callbackUrl ? sanitizeUrl(callbackUrl) : undefined,
      },
      request: normalizeRequest(raw.request),
    };
  }

  if (kind === "loopback") {
    if (role !== "callback" && role !== "request") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const registeredRedirectUriRaw = boundedString(observation.registeredRedirectUri);
    const registeredRedirectUri = normalizeLoopbackUrl(observation.registeredRedirectUri);
    const callbackUrl = normalizeLoopbackUrl(observation.callbackUrl);
    const requestCallbackUrl = normalizeLoopbackUrl(observation.requestCallbackUrl);
    return {
      identity: `loopback|${role}|${family}`,
      kind,
      role,
      family,
      data: {
        registeredRedirectUri,
        registeredRedirectSupported: registeredRedirectUriRaw
          ? isSupportedLoopbackRegistrationRedirect(registeredRedirectUriRaw, loopbackHost(family))
          : undefined,
        callbackUrl,
        requestCallbackUrl,
        callbackReceived: boundedBoolean(observation.callbackReceived),
        requestResource: boundedString(observation.requestResource),
        portSelectedAtRequest: boundedBoolean(observation.portSelectedAtRequest),
      },
      request: normalizeRequest(raw.request),
    };
  }

  if (kind === "pkce") {
    if (role !== "exchange") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const verifier = boundedString(observation.verifier);
    const challenge = boundedString(observation.challenge);
    return {
      identity: `pkce|exchange|${family}`,
      kind,
      role,
      family,
      data: {
        verifierPresent: Boolean(verifier),
        challengePresent: Boolean(challenge),
        verifierMatchesChallenge: verifier && challenge
          ? matchesS256CodeChallenge(verifier, challenge, boundedString(observation.method))
          : undefined,
        method: boundedString(observation.method),
        requestResource: boundedString(observation.requestResource),
      },
      request: normalizeRequest(raw.request),
    };
  }

  if (kind === "cleanup") {
    if (role !== "family") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    return {
      identity: `cleanup|family|${family}`,
      kind,
      role,
      family,
      data: {
        grantPresent: boundedBoolean(observation.grantPresent),
        requestStatus: boundedNumber(observation.requestStatus),
      },
    };
  }

  throw new PublicClientEvidenceBoundaryError();
}

function classifierForGate(gateId: string): string {
  return MCP_ACCESS_GRANT_CATALOGS.gates[gateId]?.classifier ?? "unknown";
}

function templateText(gateId: string, status: GateStatus): string {
  const classifier = classifierForGate(gateId);
  return MCP_ACCESS_GRANT_CATALOGS.templates[classifier]?.text[status] ?? `${classifier}: ${status}`;
}

function gate(
  gateId: string,
  status: GateStatus | undefined,
  evidence?: Record<string, unknown>,
  error?: EvidenceError,
): DerivedGate {
  return {
    gateId,
    status,
    evidence,
    error,
  };
}

function registrationGateId(family: PublicClientFamily, role: string): string {
  return `${role === "negative" ? "registration-negative-validation" : "public-client-registration"}-${family}`;
}

function statusFromFamilyValues(values: readonly (GateStatus | undefined)[]): GateStatus {
  if (values.some((value) => value === "fail")) return "fail";
  if (values.some((value) => value === "not-proven" || value === undefined)) return "not-proven";
  return "pass";
}

function statusFromObservationFields(values: readonly (boolean | undefined)[]): GateStatus {
  if (values.every((value) => value !== undefined)) return values.every(Boolean) ? "pass" : "fail";
  return "not-proven";
}

function publicRegistrationStatus(
  fact: NormalizedFact,
): DerivedGate {
  const family = fact.family!;
  const response = fact.data.response as NormalizedSurface;
  if (!response.complete || response.status === undefined || response.status < 200 || response.status >= 600) {
    return gate(registrationGateId(family, fact.role), "not-proven", { registrationStatus: "not-proven" });
  }
  if (fact.role === "negative") {
    const observedErrorCode = bodyString(response.body, "error_code", "error");
    const errorCode = observedErrorCode && /^[A-Za-z0-9_.:-]{1,100}$/.test(observedErrorCode) ? observedErrorCode : undefined;
    const status = classifyNegativeRegistration({
      status: response.status,
      errorCode,
      credentialPresence: response.credentialPresence,
    });
    return gate(registrationGateId(family, fact.role), status, {
      case: fact.caseId,
      status: response.status,
      errorCode: errorCode ?? "unavailable",
      credentialPresence: response.credentialPresence,
    });
  }
  if (response.status < 200 || response.status >= 300) {
    return gate(registrationGateId(family, fact.role), "not-proven", { registrationStatus: "not-proven", status: response.status });
  }
  const redirectUris = bodyStringArray(response.body, "redirect_uris", "redirectUris");
  const grantTypes = bodyStringArray(response.body, "grant_types", "grantTypes");
  const responseTypes = bodyStringArray(response.body, "response_types", "responseTypes");
  const clientId = bodyString(response.body, "client_id", "clientId");
  const authMethod = bodyString(response.body, "token_endpoint_auth_method", "tokenEndpointAuthMethod");
  const expectedHost = loopbackHost(family);
  const supportedRedirects = redirectUris.length === 1 && isSupportedLoopbackRegistrationRedirect(redirectUris[0], expectedHost);
  const supportedGrantTypes = grantTypes.length === 1 && grantTypes[0] === "authorization_code";
  const supportedResponseTypes = responseTypes.length === 1 && responseTypes[0] === "code";
  const publicTokenAuthentication = authMethod === "none";
  const clientSecretReturned = response.credentialPresence === "present" || "client_secret" in response.body;
  const accepted = Boolean(clientId && supportedRedirects && supportedGrantTypes && supportedResponseTypes && publicTokenAuthentication && !clientSecretReturned);
    return gate(registrationGateId(family, fact.role), accepted ? "pass" : "fail", {
      registrationStatus: accepted ? "accepted" : "rejected",
      registrationRedirectUri: redirectUris[0] ? sanitizeUrl(redirectUris[0]) : "unavailable",
    clientIdPresent: Boolean(clientId),
    clientSecretReturned,
    registeredGrantTypes: grantTypes,
  });
}

function deriveFactGate(
  fact: NormalizedFact,
  target: CompatibilityReportTarget,
): DerivedGate | undefined {
  if (fact.kind === "resource-discovery") {
    const response = fact.data.response as NormalizedSurface;
    const resource = fact.data.advertisedResource as string | undefined;
    const authorizationServer = fact.data.advertisedAuthorizationServer as string | undefined;
    if (!response.complete || response.status === undefined) return gate("resource-discovery", "not-proven");
    const resourceMatches = resource === target.canonicalResource;
    const providerMatches = authorizationServer === target.expectedAuthorizationServer;
    return gate("resource-discovery", resourceMatches && providerMatches ? "pass" : "fail", {
      resourceMatches,
      advertisedResource: resource ?? "unavailable",
      advertisedAuthorizationServer: authorizationServer ?? "unavailable",
      expectedAuthorizationServer: target.expectedAuthorizationServer,
    });
  }
  if (fact.kind === "provider-discovery") {
    const response = fact.data.response as NormalizedSurface;
    const issuer = fact.data.issuer as string | undefined;
    if (!response.complete || response.status === undefined) return gate("provider-discovery", "not-proven");
    const issuerMatches = issuer === target.expectedAuthorizationServer;
    const responseTypesSupported = (fact.data.responseTypesSupported as string[] | undefined) ?? [];
    const grantTypesSupported = (fact.data.grantTypesSupported as string[] | undefined) ?? [];
    const tokenEndpointAuthMethodsSupported = (fact.data.tokenEndpointAuthMethodsSupported as string[] | undefined) ?? [];
    const codeChallengeMethodsSupported = (fact.data.codeChallengeMethodsSupported as string[] | undefined) ?? [];
    const supportsGoldenPath =
      Boolean(fact.data.registrationEndpoint) &&
      responseTypesSupported.includes("code") &&
      grantTypesSupported.includes("authorization_code") &&
      tokenEndpointAuthMethodsSupported.includes("none") &&
      codeChallengeMethodsSupported.includes("S256");
    return gate("provider-discovery", issuerMatches && supportsGoldenPath ? "pass" : "fail", {
      issuerMatches,
      authorizationEndpoint: fact.data.authorizationEndpoint ?? "unavailable",
      registrationEndpoint: fact.data.registrationEndpoint ?? "unavailable",
      tokenEndpoint: fact.data.tokenEndpoint ?? "unavailable",
      jwksUri: fact.data.jwksUri ?? "unavailable",
    });
  }
  if (fact.kind === "configuration") {
    const hosts = fact.data.loopbackHosts as string[] | undefined;
    const validHosts = hosts?.join("|") === ["127.0.0.1", "::1"].join("|");
    const targetValid = Boolean(target.canonicalResource && target.supabaseUrl && target.expectedAuthorizationServer);
    return gate("reproducible-configuration", validHosts && targetValid ? "pass" : hosts ? "not-proven" : "not-proven", {
      canonicalResource: target.canonicalResource,
      supabaseUrl: target.supabaseUrl,
      expectedAuthorizationServer: target.expectedAuthorizationServer,
      loopbackHosts: hosts ?? "unavailable",
      hasProviderCredentials: fact.data.providerCredentialsAvailable ?? false,
    });
  }
  if (fact.kind === "versions") {
    const values = fact.data.values as Record<string, string>;
    const required = PUBLIC_CLIENT_PROFILE.versionRules.requiredKeys;
    const complete = required.every((key) => typeof values[key] === "string" && values[key].length > 0);
    return gate("versions", complete ? "pass" : "not-proven", { versions: values });
  }
  if (fact.kind === "registration") return publicRegistrationStatus(fact);
  if (fact.kind === "consent") {
    const data = fact.data;
    const noEndorsementLanguage = data.endorsementLanguageVisible === undefined
      ? undefined
      : !(data.endorsementLanguageVisible as boolean);
    const presentationFields = [
      data.clientNameVisible as boolean | undefined,
      data.clientUriVisible as boolean | undefined,
      data.logoVisible as boolean | undefined,
      data.softwareIdVisible as boolean | undefined,
      data.softwareVersionVisible as boolean | undefined,
      data.untrustedDisclaimerVisible as boolean | undefined,
      noEndorsementLanguage,
    ];
    const status = presentationFields.some((value) => value === undefined)
      ? "not-proven"
      : classifyConsentPresentation({
        clientNameVisible: data.clientNameVisible as boolean,
        clientUriVisible: data.clientUriVisible as boolean,
        logoVisible: data.logoVisible as boolean,
        softwareIdVisible: data.softwareIdVisible as boolean,
        softwareVersionVisible: data.softwareVersionVisible as boolean,
        untrustedDisclaimerVisible: data.untrustedDisclaimerVisible as boolean,
        endorsementLanguageVisible: data.endorsementLanguageVisible as boolean,
        affirmativeControlVisible: true,
        denialControlVisible: true,
        callbackBeforeDecision: false,
      });
    return gate(`untrusted-client-metadata-${fact.family}`, status, {
      clientNameVisible: data.clientNameVisible,
      clientUriVisible: data.clientUriVisible,
      logoVisible: data.logoVisible,
      softwareIdVisible: data.softwareIdVisible,
      softwareVersionVisible: data.softwareVersionVisible,
      untrustedDisclaimerVisible: data.untrustedDisclaimerVisible,
    });
  }
  if (fact.kind === "authorization") {
    if (fact.role === "approval") {
      const data = fact.data;
      const status = data.decision === undefined
        ? "not-proven"
        : statusFromObservationFields([
          data.affirmativeControlVisible as boolean | undefined,
          data.denialControlVisible as boolean | undefined,
          data.callbackBeforeDecision === undefined ? undefined : !(data.callbackBeforeDecision as boolean),
          data.decision === "affirmative",
        ]);
      return gate(`authorization-consent-${fact.family}`, status, {
        affirmativeControlVisible: data.affirmativeControlVisible,
        denialControlVisible: data.denialControlVisible,
        callbackBeforeDecision: data.callbackBeforeDecision,
        decision: data.decision ?? "unavailable",
      });
    }
    const data = fact.data;
    const unknownCredential = data.credentialPresence === "unknown";
    const outcome: AuthorizationOutcomeObservation = {
      kind: fact.role as AuthorizationOutcomeObservation["kind"],
      callbackReceived: data.callbackReceived === true,
      authorizationError: data.authorizationError === true,
      stateMatches: data.stateMatches as boolean | undefined,
      authorizationCodePresent: data.authorizationCodePresent === true || unknownCredential,
      tokenRequestObserved: data.tokenRequestObserved === true || data.tokenRequestObserved === undefined,
      accessTokenObserved: data.accessTokenObserved === true,
      refreshTokenObserved: data.refreshTokenObserved === true,
      idTokenObserved: data.idTokenObserved === true,
      browserFragmentCredentialObserved: unknownCredential || data.unexpectedCredentialObserved === true,
    };
    const status = data.callbackComplete === true ? classifyAuthorizationOutcome(outcome) : "not-proven";
    return gate(`${fact.role === "denial" ? "consent-denial" : "consent-abandonment"}-${fact.family}`, status, {
      callbackReceived: data.callbackReceived,
      stateMatches: data.stateMatches,
      authorizationError: data.authorizationError,
      authorizationCodePresent: data.authorizationCodePresent,
      accessTokenObserved: data.accessTokenObserved,
      refreshTokenObserved: data.refreshTokenObserved,
    });
  }
  if (fact.kind === "loopback") {
    const data = fact.data;
    const registered = data.registeredRedirectUri as NormalizedLoopbackUrl | undefined;
    const callback = data.callbackUrl as NormalizedLoopbackUrl | undefined;
    const expectedHost = loopbackHost(fact.family!);
    if (fact.role === "callback") {
      const status = data.callbackReceived === undefined
        ? "not-proven"
        : data.callbackReceived === true && data.registeredRedirectSupported === true && Boolean(registered && callback && callback.protocol === "http:" && !callback.hasFragment && registered.host === expectedHost && registered.path === "/oauth/callback" &&
          callback.host === expectedHost && callback.path === "/oauth/callback" && Boolean(callback.port))
          ? "pass"
          : "fail";
      return gate(`loopback-${fact.family}`, status, {
        family: fact.family,
        callbackHost: callback?.host ?? "unavailable",
        callbackPath: callback?.path ?? "unavailable",
        callbackReceived: data.callbackReceived,
      });
    }
    const request = data.requestCallbackUrl as NormalizedLoopbackUrl | undefined;
    const requestResource = data.requestResource as string | undefined;
    const registeredMatches = data.registeredRedirectSupported === true && registered?.host === expectedHost && registered.path === "/oauth/callback";
    const status = registeredMatches && request && request.protocol === "http:" && !request.hasQuery && !request.hasFragment && request.host === expectedHost && request.path === "/oauth/callback" && Boolean(request.port) &&
      requestResource === target.canonicalResource && data.portSelectedAtRequest === true ? "pass" : data.requestCallbackUrl ? "fail" : "not-proven";
    return gate(`loopback-request-${fact.family}`, status, {
      family: fact.family,
      registrationRedirectUri: registered?.url ?? "unavailable",
      requestTimeCallbackUrl: request?.url ?? "unavailable",
      portSelectedAtRequest: data.portSelectedAtRequest,
      resource: requestResource ?? "unavailable",
    });
  }
  if (fact.kind === "pkce") {
    const data = fact.data;
    if (data.verifierMatchesChallenge === undefined) return gate(`loopback-pkce-${fact.family}`, "not-proven", {
      method: data.method ?? "unavailable",
      codeChallengePresent: data.challengePresent,
      codeVerifierMatchesChallenge: "unknown",
      resourceMatchesCanonical: data.requestResource === target.canonicalResource,
    });
    const status = data.verifierMatchesChallenge === true && data.method === "S256" && data.requestResource === target.canonicalResource ? "pass" : "fail";
    return gate(`loopback-pkce-${fact.family}`, status, {
      method: data.method ?? "unavailable",
      codeChallengePresent: data.challengePresent,
      codeVerifierMatchesChallenge: data.verifierMatchesChallenge,
      resourceMatchesCanonical: data.requestResource === target.canonicalResource,
    });
  }
  if (fact.kind === "cleanup") {
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    return gate(`consent-cleanup-${fact.family}`, grantPresent === undefined ? "not-proven" : grantPresent ? "fail" : "pass", {
      grantStatus: grantPresent === undefined ? "unknown" : grantPresent ? "present" : "absent",
      grantIdentified: grantPresent === true,
      grantRevoked: grantPresent === false,
      requestStatus: fact.data.requestStatus,
    });
  }
  return undefined;
}

function aggregateGate(base: typeof FAMILY_GATE_BASES[number], statuses: ReadonlyMap<PublicClientFamily, GateStatus | undefined>): DerivedGate {
  const children = MCP_ACCESS_GRANT_FAMILIES.map((family) => statuses.get(family));
  const status = statusFromFamilyValues(children);
  return gate(`${base}-both`, status, {
    families: MCP_ACCESS_GRANT_FAMILIES.map((family, index) => ({ family, status: children[index] ?? "not-proven" })),
  }, children.every((child) => child === undefined) ? { kind: "missing-observation" } : undefined);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, omitUndefined(child)]),
  );
}

function snapshotOptions(options: PublicClientEvidenceOptions): PublicClientEvidenceOptions {
  if (!isRecord(options.target) || typeof options.clock !== "function") throw new PublicClientEvidenceBoundaryError();
  if (!options.writer || (typeof options.writer !== "function" && typeof options.writer.write !== "function")) throw new PublicClientEvidenceBoundaryError();
  if (!isRecord(options.versions) || Object.keys(options.versions).length > MAX_FACT_OBJECT_KEYS) throw new PublicClientEvidenceBoundaryError();
  const configuredSecrets = options.configuredSecrets ?? [];
  if (!Array.isArray(configuredSecrets) || configuredSecrets.length > MAX_CONFIGURED_SECRETS || configuredSecrets.some((secret) => typeof secret !== "string" || secret.length > MAX_CONFIGURED_SECRET_LENGTH)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const versions = Object.fromEntries(Object.entries(options.versions).map(([key, value]) => {
    if (key.length > MAX_FACT_STRING_LENGTH || typeof value !== "string" || value.length > MAX_FACT_STRING_LENGTH) throw new PublicClientEvidenceBoundaryError();
    return [key, value];
  }));
  const targetLoopbackHosts = options.target.loopbackHosts
    ? [...options.target.loopbackHosts]
    : [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6];
  if (targetLoopbackHosts.length !== 2 || targetLoopbackHosts.some((host) => typeof host !== "string" || host.length > MAX_FACT_STRING_LENGTH) ||
    targetLoopbackHosts.join("|") !== [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6].join("|")) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const target = {
    name: boundedString(options.target.name) ?? "",
    canonicalResource: boundedString(options.target.canonicalResource) ?? "",
    supabaseUrl: boundedString(options.target.supabaseUrl) ?? "",
    expectedAuthorizationServer: boundedString(options.target.expectedAuthorizationServer) ?? "",
    loopbackHosts: targetLoopbackHosts,
  } satisfies CompatibilityReportTarget;
  const writer = writerFunction(options.writer);
  return deepFreeze({
    target,
    versions,
    configuredSecrets: [...configuredSecrets],
    clock: options.clock,
    writer,
  });
}

function sampleIso(clock: () => string, previous?: number): { value: string; millis: number } {
  let value: unknown;
  try {
    value = clock();
  } catch {
    throw new PublicClientEvidenceBoundaryError();
  }
  if (typeof value !== "string" || value.length > 64) throw new PublicClientEvidenceBoundaryError();
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || (previous !== undefined && millis < previous)) throw new PublicClientEvidenceBoundaryError();
  return { value: new Date(millis).toISOString(), millis };
}

function writerFunction(writer: PublicClientArtifactWriter): (artifact: PublicClientArtifact) => void | Promise<void> {
  return typeof writer === "function" ? writer : writer.write.bind(writer);
}

async function persist(
  writer: (artifact: PublicClientArtifact) => void | Promise<void>,
  artifact: PublicClientArtifact,
): Promise<boolean> {
  try {
    await writer(artifact);
    return true;
  } catch {
    return false;
  }
}

function makeArtifact(contents: string): PublicClientArtifact {
  return deepFreeze({ filename: MCP_ACCESS_GRANT_ARTIFACT_NAME, contents });
}

function internalObservations(
  facts: readonly NormalizedFact[],
  target: CompatibilityReportTarget,
): EvidenceObservation[] {
  const observations: EvidenceObservation[] = [];
  const shared = new Map<string, DerivedGate>();
  const family = new Map<string, Map<PublicClientFamily, DerivedGate>>();
  const negative = new Map<string, Map<PublicClientFamily, Map<PublicClientNegativeRegistrationCase, DerivedGate>>>();
  const conflictingGateIds = new Set<string>();
  const seen = new Map<string, { readonly payload: string; readonly gateId: string }>();

  for (const fact of facts) {
    const derived = deriveFactGate(fact, target);
    if (!derived) continue;
    const serialized = JSON.stringify(derived);
    const previous = seen.get(fact.identity);
    if (previous !== undefined) {
      if (previous.payload !== serialized) {
        conflictingGateIds.add(previous.gateId);
        conflictingGateIds.add(derived.gateId);
      }
    } else {
      seen.set(fact.identity, { payload: serialized, gateId: derived.gateId });
    }
    if (fact.kind === "registration" && fact.role === "negative" && fact.family && fact.caseId) {
      const byFamily = negative.get("registration-negative-validation") ?? new Map();
      const byCase = byFamily.get(fact.family) ?? new Map();
      byCase.set(fact.caseId, derived);
      byFamily.set(fact.family, byCase);
      negative.set("registration-negative-validation", byFamily);
    } else if (fact.family) {
      const byFamily = family.get(derived.gateId.replace(/-(?:ipv4|ipv6)$/, "")) ?? new Map();
      byFamily.set(fact.family, derived);
      family.set(derived.gateId.replace(/-(?:ipv4|ipv6)$/, ""), byFamily);
    } else {
      shared.set(derived.gateId, derived);
    }
  }

  const normalizedGate = (derived: DerivedGate): EvidenceObservation => ({
    kind: "gate",
    gateId: derived.gateId,
    ...(derived.status !== undefined ? { status: derived.status } : {}),
    ...(derived.status !== undefined ? { detail: templateText(derived.gateId, derived.status) } : {}),
    ...(derived.evidence !== undefined ? { evidence: omitUndefined(derived.evidence) } : {}),
    error: derived.error,
  });

  for (const gateId of ["resource-discovery", "provider-discovery", "reproducible-configuration", "versions"]) {
    const derived = shared.get(gateId);
    if (derived) {
      observations.push(normalizedGate(conflictingGateIds.has(gateId)
        ? gate(gateId, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" })
        : derived));
    }
  }

  for (const base of FAMILY_GATE_BASES) {
    const byFamily = family.get(base) ?? new Map<PublicClientFamily, DerivedGate>();
    if (base === "registration-negative-validation") {
      const negativeByFamily = negative.get(base) ?? new Map();
      for (const currentFamily of MCP_ACCESS_GRANT_FAMILIES) {
        const cases = negativeByFamily.get(currentFamily);
        const statuses = NEGATIVE_CASES.map((caseId) => cases?.get(caseId)?.status);
        const status = cases && cases.size > 0 ? statusFromFamilyValues(statuses) : undefined;
        const evidence = cases
          ? { cases: NEGATIVE_CASES.map((caseId) => ({ case: caseId, status: cases.get(caseId)?.status ?? "not-proven" })) }
          : undefined;
        const identity = `registration-negative-validation-${currentFamily}`;
        observations.push(normalizedGate(conflictingGateIds.has(identity)
          ? gate(identity, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" })
          : gate(identity, status, evidence, status === undefined ? { kind: "missing-observation" } : undefined)));
      }
    } else {
      for (const currentFamily of MCP_ACCESS_GRANT_FAMILIES) {
        const derived = byFamily.get(currentFamily);
        const identity = `${base}-${currentFamily}`;
        observations.push(normalizedGate(conflictingGateIds.has(identity)
          ? gate(identity, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" })
          : derived ?? gate(identity, undefined, undefined, { kind: "missing-observation" })));
      }
    }
    const statuses = new Map<PublicClientFamily, GateStatus | undefined>();
    for (const currentFamily of MCP_ACCESS_GRANT_FAMILIES) {
      if (base === "registration-negative-validation") {
        const cases = negative.get(base)?.get(currentFamily);
        const identity = `${base}-${currentFamily}`;
        statuses.set(currentFamily, conflictingGateIds.has(identity)
          ? "fail"
          : cases && cases.size > 0 ? statusFromFamilyValues(NEGATIVE_CASES.map((caseId) => cases.get(caseId)?.status)) : undefined);
      } else {
        const identity = `${base}-${currentFamily}`;
        statuses.set(currentFamily, conflictingGateIds.has(identity) ? "fail" : byFamily.get(currentFamily)?.status);
      }
    }
    observations.push(normalizedGate(aggregateGate(base, statuses)));
  }

  for (const fact of facts) {
    if (fact.request) observations.push({ kind: "request", request: fact.request.request });
  }
  return observations;
}

function finalizeRun(
  facts: readonly NormalizedFact[],
  options: PublicClientEvidenceOptions,
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
    issue: PUBLIC_CLIENT_PROFILE.issue,
    target: options.target,
    requiredGateIds: PUBLIC_CLIENT_PROFILE.expandedGateIds,
    observations: internalObservations(facts, options.target),
    ...(artifactWriteSucceeded !== undefined ? { artifactWriteSucceeded } : {}),
  }, context);
}

function stableFailure(error?: unknown): PublicClientEvidenceBoundaryError {
  void error;
  return new PublicClientEvidenceBoundaryError();
}

/**
 * Run exactly one private public-client evidence session.
 *
 * The callback cannot choose a profile, source, gate, status, report wording,
 * finalizer, or artifact destination. It can only submit public-client facts.
 */
export async function runPublicClientEvidence(
  optionsInput: PublicClientEvidenceOptions,
  journey: (recorder: { readonly record: (fact: PublicClientFact) => Promise<void> }) => void | Promise<void>,
): Promise<PublicClientEvidenceResult> {
  let options: PublicClientEvidenceOptions;
  try {
    options = snapshotOptions(optionsInput);
  } catch (error) {
    throw stableFailure(error);
  }

  let start: { value: string; millis: number };
  try {
    start = sampleIso(options.clock);
  } catch (error) {
    throw stableFailure(error);
  }

  const facts: NormalizedFact[] = [];
  const identities = new Map<string, string>();
  const pending = new Set<Promise<void>>();
  let closed = false;
  let poisoned = false;
  let lastClock = start.millis;

  const record = (fact: PublicClientFact): Promise<void> => {
    if (closed) {
      const failure = Promise.reject(stableFailure());
      void failure.catch(() => undefined);
      return failure;
    }
    let normalized: NormalizedFact;
    try {
      normalized = normalizeFact(fact);
      const clock = sampleIso(options.clock, lastClock);
      lastClock = clock.millis;
    } catch (error) {
      poisoned = true;
      const failure = Promise.reject(stableFailure(error));
      const handled = failure.catch(() => undefined);
      pending.add(handled);
      void handled.finally(() => pending.delete(handled));
      return failure;
    }
    const payload = JSON.stringify(normalized);
    const previous = identities.get(normalized.identity);
    if (previous === undefined) {
      identities.set(normalized.identity, payload);
    }
    if (previous === undefined || previous !== payload || normalized.request !== undefined) facts.push(normalized);
    const accepted = Promise.resolve();
    pending.add(accepted);
    void accepted.finally(() => pending.delete(accepted));
    return accepted;
  };

  const recorder = Object.freeze({ record });
  try {
    await journey(recorder);
  } catch (error) {
    closed = true;
    await Promise.allSettled([...pending]);
    throw stableFailure(error);
  }
  closed = true;
  await Promise.allSettled([...pending]);
  if (poisoned) throw stableFailure();

  let finish: { value: string; millis: number };
  try {
    finish = sampleIso(options.clock, lastClock);
  } catch (error) {
    throw stableFailure(error);
  }

  const writer = writerFunction(options.writer);
  const finalized = finalizeRun(facts, options, start.value, finish.value, true);
  const artifact = makeArtifact(finalized.verification.serialized);
  const optimisticWriteSucceeded = finalized.verification.sanitized && await persist(writer, artifact);
  if (optimisticWriteSucceeded) {
    return {
      report: finalized.report,
      artifact,
      verification: finalized.verification,
      artifactWriteSucceeded: true,
    };
  }

  const failure = finalizeRun(facts, options, start.value, finish.value, false);
  const failureArtifact = makeArtifact(failure.verification.serialized);
  let failureWriteSucceeded = false;
  for (let attempt = 0; attempt < 2 && !failureWriteSucceeded; attempt += 1) {
    failureWriteSucceeded = await persist(writer, failureArtifact);
  }
  return {
    report: failure.report,
    artifact: failureArtifact,
    verification: failure.verification,
    artifactWriteSucceeded: failureWriteSucceeded,
  };
}
