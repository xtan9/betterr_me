import crypto from "node:crypto";

import { compactVerify, decodeJwt, decodeProtectedHeader, importJWK, type JWK } from "jose";

import {
  browserUrlCredentialEvidence,
  classifyAuthorizationOutcome,
  classifyConsentPresentation,
  hasUnnegatedEndorsementLanguage,
  sanitizeUrl,
  type AuthorizationOutcomeObservation,
  type CompatibilityReportTarget,
  type EvidenceError,
  type GateStatus,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";
import {
  ALLOWED_DELEGATED_JWT_ALGORITHMS,
  evaluateDelegatedJwtPolicy,
  isSupportedLoopbackRegistrationRedirect,
  matchesS256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
} from "./mcp-access-grant-policy";

/**
 * Canonical observation port emitted by the live public-client journey.
 *
 * Profile-owned configuration and version snapshots deliberately do not cross
 * this boundary. Each deterministic profile records those inputs through its
 * own profile surface while sharing this journey fact contract.
 */

export type PublicClientFamily = "ipv4" | "ipv6";

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
  readonly requestClientId?: string;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly requestCodeVerifierHash?: string;
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
  readonly authorizationRequest?: PublicClientRequestInput;
}

export interface PublicClientCleanupObservation {
  readonly listRequestObserved?: boolean;
  readonly remainingClientIds?: readonly string[];
  readonly remainingGrantIds?: readonly string[];
  readonly grantPresent?: boolean;
  readonly requestStatus?: number;
  readonly request?: PublicClientRequestInput;
  readonly response?: PublicClientResponseSurface;
}

export interface PublicClientDelegatedTokenObservation {
  readonly token?: string;
  readonly jwks?: string | PublicClientJsonValue;
}

export interface PublicClientMcpSdkObservation {
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly listToolsObserved?: boolean;
  readonly callToolCompleted?: boolean;
  readonly callToolObserved?: boolean;
  readonly resultIsError?: boolean;
  readonly toolName?: string;
}

export interface PublicClientMcpOperationObservation {
  readonly operationUrl?: string;
  readonly operationResource?: string;
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly callToolCompleted?: boolean;
  readonly resultIsError?: boolean;
  readonly sdk?: PublicClientMcpSdkObservation;
  readonly response?: PublicClientResponseSurface;
  readonly request?: PublicClientRequestInput;
}

export interface PublicClientGrantObservation {
  readonly listRequestObserved?: boolean;
  readonly grantListObserved?: boolean;
  readonly listResponse?: PublicClientResponseSurface;
  readonly listResponseStatus?: number;
  readonly listedClientIds?: readonly string[];
  readonly listedGrantIds?: readonly string[];
  readonly grantId?: string;
  readonly grantClientId?: string;
  readonly clientId?: string;
  readonly grantPresent?: boolean;
  readonly revokeRequestObserved?: boolean;
  readonly revokeObserved?: boolean;
  readonly revokeResponse?: PublicClientResponseSurface;
  readonly revokeResponseStatus?: number;
  readonly request?: PublicClientRequestInput;
}

export type PublicClientNegativeRegistrationCase =
  | "unsupported-client-auth-method"
  | "unsupported-grant-type"
  | "unsupported-response-type"
  | "malformed-metadata"
  | "unsafe-redirect-metadata";

export type PublicClientJourneyFact =
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
      readonly kind: "delegated-token";
      readonly role: "validation";
      readonly family: PublicClientFamily;
      readonly token?: string;
      readonly jwks?: string | PublicClientJsonValue;
      readonly observation?: PublicClientDelegatedTokenObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "mcp-operation";
      readonly role: "authenticated";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientMcpOperationObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "grant";
      readonly role: "cleanup";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientGrantObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "cleanup";
      readonly role: "family";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientCleanupObservation;
    };

export type PublicClientJourneyKind = PublicClientJourneyFact["kind"];
export type PublicClientCredentialPresence = "present" | "absent" | "unknown";

export interface PublicClientNormalizedSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body: Record<string, unknown>;
  readonly location?: string;
  readonly browserUrl?: string;
  readonly callbackUrl?: string;
  readonly credentialPresence: PublicClientCredentialPresence;
}

export interface PublicClientNormalizedRequest {
  readonly request: MinimizedRequestObservation;
  readonly response?: PublicClientNormalizedSurface;
  readonly responseCredentialPresence: PublicClientCredentialPresence;
  readonly requestStateHash?: string;
  readonly requestCodeChallenge?: string;
}

export interface PublicClientNormalizedFact {
  readonly identity: string;
  readonly kind: PublicClientJourneyKind;
  readonly role: string;
  readonly family?: PublicClientFamily;
  readonly caseId?: PublicClientNegativeRegistrationCase;
  readonly data: Record<string, unknown>;
  readonly request?: PublicClientNormalizedRequest;
}

export type PublicClientAdmissionDisposition = "accepted" | "duplicate" | "bounded";

export interface PublicClientAdmission {
  readonly disposition: PublicClientAdmissionDisposition;
  readonly fact: PublicClientNormalizedFact;
  readonly fingerprint: string;
}

export const PUBLIC_CLIENT_EVIDENCE_BOUNDS = Object.freeze({
  maxDepth: 4,
  maxArrayItems: 32,
  maxObjectKeys: 64,
  maxStringLength: 500,
  maxTokenLength: 16_384,
  maxJwksLength: 65_536,
  maxJwksKeys: 32,
  maxUniquePayloadsPerIdentity: 2,
} as const);

const MAX_FACT_DEPTH = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxDepth;
const MAX_FACT_ARRAY_ITEMS = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxArrayItems;
const MAX_FACT_OBJECT_KEYS = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxObjectKeys;
const MAX_FACT_STRING_LENGTH = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxStringLength;
const MAX_TOKEN_LENGTH = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxTokenLength;
const MAX_JWKS_LENGTH = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxJwksLength;
const MAX_JWKS_KEYS = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxJwksKeys;
const MAX_UNIQUE_PAYLOADS_PER_IDENTITY = PUBLIC_CLIENT_EVIDENCE_BOUNDS.maxUniquePayloadsPerIdentity;

const SENSITIVE_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|verifier|state|code)$/i;
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|code)$/i;
const CREDENTIAL_QUERY_KEY = /^(?:code|code[_-]?verifier|access_token|refresh_token|id_token|client_secret|token)$/i;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
  "authorized", "rejected", "passed", "failed", "valid", "success", "signatureValid", "algorithmAllowed",
  "identity", "factIdentity", "catalogIdentity", "authority", "semanticRole",
  "accessTokenChanged", "refreshTokenChanged", "providerReturnedAccessToken", "providerReturnedRefreshToken",
  "rootReplayDetected", "everyIssuedDescendantRejected", "replacementCredentialsStored", "grantIdentified",
  "grantRevoked", "withinDocumentedLifetime", "operationStatus", "succeeded",
]);
const PUBLIC_FAMILY_KINDS = new Set<PublicClientJourneyKind>([
  "registration", "consent", "authorization", "loopback", "pkce", "delegated-token", "mcp-operation", "grant", "cleanup",
]);
const PUBLIC_NEGATIVE_REGISTRATION_CASES: readonly PublicClientNegativeRegistrationCase[] = [
  "unsupported-client-auth-method",
  "unsupported-grant-type",
  "unsupported-response-type",
  "malformed-metadata",
  "unsafe-redirect-metadata",
];
const MAX_SEMANTIC_BATCH_FACTS = 1_024;
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

export class PublicClientEvidenceBoundaryError extends Error {
  constructor() {
    super("Public-client evidence observation rejected.");
    this.name = "PublicClientEvidenceBoundaryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function copyFactInput(value: unknown, depth: number, parents: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === undefined) return value;
  if (depth > MAX_FACT_DEPTH) return "[REDACTED: depth limit]";
  if (typeof value !== "object") return "[REDACTED: unsupported value]";
  if (parents.has(value)) return "[REDACTED: cyclic value]";
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_FACT_ARRAY_ITEMS) return "[REDACTED: array limit]";
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes("length")) throw new PublicClientEvidenceBoundaryError();
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new PublicClientEvidenceBoundaryError();
        result.push(copyFactInput(descriptor.value, depth + 1, parents));
      }
      if (keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
        throw new PublicClientEvidenceBoundaryError();
      }
      return result;
    }
    if (!isRecord(value)) return "[REDACTED: unsupported value]";
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_FACT_OBJECT_KEYS) return "[REDACTED: object limit]";
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") throw new PublicClientEvidenceBoundaryError();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new PublicClientEvidenceBoundaryError();
      result[key] = copyFactInput(descriptor.value, depth + 1, parents);
    }
    return result;
  } finally {
    parents.delete(value);
  }
}

export function capturePublicClientJourneyFact(value: unknown): PublicClientJourneyFact {
  const snapshot = copyFactInput(value, 0, new WeakSet<object>());
  if (!isRecord(snapshot)) throw new PublicClientEvidenceBoundaryError();
  return snapshot as PublicClientJourneyFact;
}

function assertNoConclusionFields(value: Record<string, unknown>): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || CONCLUSION_KEYS.has(key)) throw new PublicClientEvidenceBoundaryError();
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

function isDenseArray(value: unknown, maximumLength: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return false;
  }
  return keys.every((key) => key === "length" || (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length));
}

function combineCredentialPresence(values: readonly PublicClientCredentialPresence[]): PublicClientCredentialPresence {
  if (values.includes("present")) return "present";
  if (values.includes("unknown")) return "unknown";
  return "absent";
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
    if (/(?:^|[?&#\s])(?:code|access_token|refresh_token|id_token|client_secret|token)=/i.test(value)) return "present";
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

function inspectJson(value: unknown, depth = 0, key?: string): { value: unknown; credentialPresence: PublicClientCredentialPresence; complete: boolean } {
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
  if (typeof value === "number" || typeof value === "boolean" || value === null) return { value, credentialPresence: "absent", complete: true };
  if (Array.isArray(value)) {
    if (value.length > MAX_FACT_ARRAY_ITEMS) return { value: "[REDACTED: array limit]", credentialPresence: "unknown", complete: false };
    const children = value.map((child) => inspectJson(child, depth + 1, key));
    return { value: children.map((child) => child.value), credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)), complete: children.every((child) => child.complete) };
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
      return { ...result, credentialPresence: credential ? "present" as const : result.credentialPresence };
    });
    return { value: output, credentialPresence: combineCredentialPresence(children.map((child) => child.credentialPresence)), complete: children.every((child) => child.complete) };
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

function normalizeSurface(value: unknown): PublicClientNormalizedSurface {
  if (!isRecord(value)) return { complete: false, body: {}, credentialPresence: "unknown" };
  const inspectedBody = "body" in value ? inspectJson(value.body) : { value: {}, credentialPresence: "absent" as const, complete: true };
  const inspectedHeaders = "headers" in value ? inspectJson(value.headers) : { value: {}, credentialPresence: "absent" as const, complete: true };
  const textKeys = ["location", "browserUrl", "callbackUrl"] as const;
  const textValues = textKeys.map((key) => boundedString(value[key]));
  const textCredential = combineCredentialPresence(textValues.map(credentialFromText));
  const credentialPresence = combineCredentialPresence([inspectedBody.credentialPresence, inspectedHeaders.credentialPresence, textCredential]);
  const body = isRecord(inspectedBody.value) ? inspectedBody.value : {};
  const textComplete = textKeys.every((key) => !(key in value) || boundedString(value[key]) !== undefined);
  return {
    complete: value.complete === true && inspectedBody.complete && inspectedHeaders.complete && textComplete,
    status: boundedNumber(value.status),
    body,
    ...(textValues[0] ? { location: sanitizeUrl(textValues[0]) } : {}),
    ...(textValues[1] ? { browserUrl: sanitizeUrl(textValues[1]) } : {}),
    ...(textValues[2] ? { callbackUrl: sanitizeUrl(textValues[2]) } : {}),
    credentialPresence: value.complete === true && inspectedBody.complete && inspectedHeaders.complete && textComplete
      ? credentialPresence
      : credentialPresence === "present" ? "present" : "unknown",
  };
}

function normalizeRequest(value: unknown): PublicClientNormalizedRequest | undefined {
  if (!isRecord(value)) return undefined;
  const method = boundedString(value.method);
  const url = boundedString(value.url);
  if (!method || !url) throw new PublicClientEvidenceBoundaryError();
  const response = normalizeSurface(value.response);
  const requestClientId = boundedString(value.requestClientId ?? value.clientId);
  const requestGrantType = boundedString(value.requestGrantType ?? value.grantType);
  const requestRedirectUri = boundedString(value.requestRedirectUri ?? value.redirectUri);
  const requestResource = boundedString(value.requestResource ?? value.resource);
  const requestCodeChallengeMethod = boundedString(value.requestCodeChallengeMethod ?? value.codeChallengeMethod);
  let requestStateHash: string | undefined;
  let requestCodeChallenge: string | undefined;
  try {
    const parsedUrl = new URL(url);
    const state = parsedUrl.searchParams.get("state");
    requestCodeChallenge = parsedUrl.searchParams.get("code_challenge") ?? undefined;
    requestStateHash = state ? crypto.createHash("sha256").update(state).digest("base64url") : undefined;
  } catch {
    requestStateHash = undefined;
    requestCodeChallenge = undefined;
  }
  const bodyFields = isDenseArray(value.bodyFields, MAX_FACT_ARRAY_ITEMS)
    ? value.bodyFields.filter((field): field is string => typeof field === "string" && field.length <= MAX_FACT_STRING_LENGTH).map((field) => field.replace(/(?:code|state|token|secret|verifier)/gi, "[REDACTED]"))
    : [];
  const request: MinimizedRequestObservation = {
    method: method.toUpperCase(),
    url: sanitizeUrl(url),
    requestBodyFields: bodyFields,
    authorizationHeaderPresent: value.authorizationHeaderPresent === true,
    ...(requestClientId !== undefined ? { requestClientId } : {}),
    ...(requestGrantType !== undefined ? { requestGrantType } : {}),
    ...(requestRedirectUri !== undefined ? { requestRedirectUri: sanitizeUrl(requestRedirectUri) } : {}),
    ...(requestResource !== undefined ? { requestResource: sanitizeUrl(requestResource) } : {}),
    ...(requestCodeChallengeMethod !== undefined ? { requestCodeChallengeMethod } : {}),
    ...(typeof value.requestCodeChallengePresent === "boolean" ? { requestCodeChallengePresent: value.requestCodeChallengePresent } : {}),
    ...(typeof value.requestCodePresent === "boolean" ? { requestCodePresent: value.requestCodePresent } : {}),
    ...(typeof value.requestCodeVerifierPresent === "boolean" ? { requestCodeVerifierPresent: value.requestCodeVerifierPresent } : {}),
    ...(boundedString(value.requestCodeVerifierHash) ? { requestCodeVerifierHash: value.requestCodeVerifierHash as string } : {}),
    ...(boundedNumber(value.status) !== undefined ? { status: boundedNumber(value.status) } : {}),
    ...(response.credentialPresence === "present" ? { responseContainsCredentials: true } : response.complete && response.credentialPresence === "absent" ? { responseContainsCredentials: false } : {}),
  };
  return { request, response, responseCredentialPresence: response.credentialPresence, requestStateHash, requestCodeChallenge };
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!isDenseArray(value, MAX_FACT_ARRAY_ITEMS)) return undefined;
  const result = value.map((item) => boundedString(item));
  return result.every((item): item is string => item !== undefined) ? result : undefined;
}

function assertPrimitiveObservation(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new PublicClientEvidenceBoundaryError();
  assertNoConclusionFields(value);
}

interface ParsedDelegatedToken {
  readonly observed: boolean;
  readonly malformed: boolean;
  readonly header: DelegatedJwtHeader;
  readonly claims: DelegatedJwtClaims;
}

interface ParsedJwks {
  readonly observed: boolean;
  readonly malformed: boolean;
  readonly keys: readonly DelegatedJwk[];
}

interface DelegatedTokenData {
  readonly tokenObserved: boolean;
  readonly tokenMalformed: boolean;
  readonly jwksObserved: boolean;
  readonly jwksMalformed: boolean;
  readonly header: DelegatedJwtHeader;
  readonly claims: DelegatedJwtClaims;
  readonly keySelected: boolean;
  readonly signatureValid: boolean;
  readonly sampledAtSeconds: number;
}

function boundedJwtClaim(value: unknown, depth = 0): unknown {
  if (depth > 2) return "[REDACTED: depth limit]";
  if (typeof value === "string") return value.length <= MAX_FACT_STRING_LENGTH ? value : "[REDACTED: length limit]";
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.length > MAX_FACT_ARRAY_ITEMS ? "[REDACTED: array limit]" : value.map((item) => boundedJwtClaim(item, depth + 1));
  return "[REDACTED: unsupported claim]";
}

function parseDelegatedToken(value: unknown): ParsedDelegatedToken {
  if (value === undefined) return { observed: false, malformed: false, header: {}, claims: {} };
  if (typeof value !== "string") throw new PublicClientEvidenceBoundaryError();
  if (value.length === 0 || value.length > MAX_TOKEN_LENGTH) return { observed: true, malformed: true, header: {}, claims: {} };
  try {
    const decodedHeader = decodeProtectedHeader(value);
    const decodedClaims = decodeJwt(value);
    const header: DelegatedJwtHeader = {
      ...(typeof decodedHeader.alg === "string" && decodedHeader.alg.length <= MAX_FACT_STRING_LENGTH ? { alg: decodedHeader.alg } : {}),
      ...(typeof decodedHeader.kid === "string" && decodedHeader.kid.length <= MAX_FACT_STRING_LENGTH ? { kid: decodedHeader.kid } : {}),
      ...(typeof decodedHeader.typ === "string" && decodedHeader.typ.length <= MAX_FACT_STRING_LENGTH ? { typ: decodedHeader.typ } : {}),
    };
    const claims: DelegatedJwtClaims = {};
    for (const key of ["iss", "sub", "aud", "exp", "iat", "nbf", "client_id", "azp", "resource", "grant_id"]) {
      if (Object.prototype.hasOwnProperty.call(decodedClaims, key)) claims[key] = boundedJwtClaim(decodedClaims[key]);
    }
    return { observed: true, malformed: false, header, claims };
  } catch {
    return { observed: true, malformed: true, header: {}, claims: {} };
  }
}

function minimizeJwk(value: unknown): DelegatedJwk | undefined {
  if (!isRecord(value)) return undefined;
  const objectKeys = Object.keys(value);
  if (objectKeys.length > MAX_FACT_OBJECT_KEYS || objectKeys.some((key) => key.length > MAX_FACT_STRING_LENGTH)) return undefined;
  const result: DelegatedJwk = {};
  for (const key of ["alg", "kid", "kty", "use", "crv", "n", "e", "x", "y"] as const) {
    const item = value[key];
    if (typeof item === "string" && item.length <= MAX_FACT_STRING_LENGTH) result[key] = item;
  }
  if (isDenseArray(value.key_ops, MAX_FACT_ARRAY_ITEMS)) {
    const keyOps = value.key_ops.filter((item): item is string => typeof item === "string" && item.length <= MAX_FACT_STRING_LENGTH);
    if (keyOps.length === value.key_ops.length) result.key_ops = keyOps;
  }
  return result;
}

function parseJwks(value: unknown): ParsedJwks {
  if (value === undefined) return { observed: false, malformed: false, keys: [] };
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length === 0 || value.length > MAX_JWKS_LENGTH) return { observed: true, malformed: true, keys: [] };
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return { observed: true, malformed: true, keys: [] };
    }
  } else if (!isRecord(value)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  if (!isRecord(parsed) || Object.keys(parsed).length > MAX_FACT_OBJECT_KEYS || Object.keys(parsed).some((key) => key.length > MAX_FACT_STRING_LENGTH) || !isDenseArray(parsed.keys, MAX_JWKS_KEYS)) {
    return { observed: true, malformed: true, keys: [] };
  }
  const keys = parsed.keys.map(minimizeJwk);
  if (keys.some((key) => key === undefined)) return { observed: true, malformed: true, keys: [] };
  return { observed: true, malformed: false, keys: keys as DelegatedJwk[] };
}

async function normalizeDelegatedToken(raw: Record<string, unknown>, sampledAtMillis: number): Promise<DelegatedTokenData> {
  const observation = raw.observation === undefined ? {} : raw.observation;
  assertPrimitiveObservation(observation);
  const token = parseDelegatedToken(raw.token ?? observation.token);
  const jwks = parseJwks(raw.jwks ?? observation.jwks);
  const sampledAtSeconds = Math.floor(sampledAtMillis / 1000);
  if (!token.observed || token.malformed || !jwks.observed || jwks.malformed) {
    return { tokenObserved: token.observed, tokenMalformed: token.malformed, jwksObserved: jwks.observed, jwksMalformed: jwks.malformed, header: token.header, claims: token.claims, keySelected: false, signatureValid: false, sampledAtSeconds };
  }
  const selected = selectDelegatedSigningJwk(token.header, jwks.keys);
  if (!selected.ok) return { tokenObserved: true, tokenMalformed: false, jwksObserved: true, jwksMalformed: false, header: token.header, claims: token.claims, keySelected: false, signatureValid: false, sampledAtSeconds };
  let signatureValid = false;
  try {
    const key = await importJWK(selected.key as JWK, token.header.alg as string);
    await compactVerify(raw.token as string, key, { algorithms: [token.header.alg as string] });
    signatureValid = true;
  } catch {
    signatureValid = false;
  }
  return { tokenObserved: true, tokenMalformed: false, jwksObserved: true, jwksMalformed: false, header: token.header, claims: token.claims, keySelected: true, signatureValid, sampledAtSeconds };
}

function discoveryData(raw: Record<string, unknown>): Record<string, unknown> {
  const observation = isRecord(raw.observation) ? raw.observation : {};
  const response = raw.response ?? observation.response;
  const normalized = normalizeSurface(response);
  return {
    response: normalized,
    advertisedResource: boundedString(raw.advertisedResource ?? observation.advertisedResource) ?? bodyString(normalized.body, "resource", "resource_uri"),
    advertisedAuthorizationServer: boundedString(raw.advertisedAuthorizationServer ?? observation.advertisedAuthorizationServer) ?? bodyString(normalized.body, "authorization_server", "authorizationServer"),
    issuer: boundedString(raw.issuer ?? observation.issuer) ?? bodyString(normalized.body, "issuer"),
    authorizationEndpoint: boundedString(raw.authorizationEndpoint ?? observation.authorizationEndpoint) ?? bodyString(normalized.body, "authorization_endpoint", "authorizationEndpoint"),
    registrationEndpoint: boundedString(raw.registrationEndpoint ?? observation.registrationEndpoint) ?? bodyString(normalized.body, "registration_endpoint", "registrationEndpoint"),
    tokenEndpoint: boundedString(raw.tokenEndpoint ?? observation.tokenEndpoint) ?? bodyString(normalized.body, "token_endpoint", "tokenEndpoint"),
    jwksUri: boundedString(raw.jwksUri ?? observation.jwksUri) ?? bodyString(normalized.body, "jwks_uri", "jwksUri"),
    grantTypesSupported: normalizeStringList(raw.grantTypesSupported ?? observation.grantTypesSupported) ?? bodyStringArray(normalized.body, "grant_types_supported", "grantTypesSupported"),
    responseTypesSupported: normalizeStringList(raw.responseTypesSupported ?? observation.responseTypesSupported) ?? bodyStringArray(normalized.body, "response_types_supported", "responseTypesSupported"),
    tokenEndpointAuthMethodsSupported: normalizeStringList(raw.tokenEndpointAuthMethodsSupported ?? observation.tokenEndpointAuthMethodsSupported) ?? bodyStringArray(normalized.body, "token_endpoint_auth_methods_supported", "tokenEndpointAuthMethodsSupported"),
    codeChallengeMethodsSupported: normalizeStringList(raw.codeChallengeMethodsSupported ?? observation.codeChallengeMethodsSupported) ?? bodyStringArray(normalized.body, "code_challenge_methods_supported", "codeChallengeMethodsSupported"),
  };
}

interface PublicLoopbackUrl {
  readonly url: string;
  readonly protocol?: string;
  readonly host?: string;
  readonly path?: string;
  readonly port?: number;
  readonly hasQuery?: boolean;
  readonly hasFragment?: boolean;
  readonly hasCredential: boolean;
}

function publicLoopbackHost(family: PublicClientFamily): "127.0.0.1" | "::1" {
  return family === "ipv4" ? "127.0.0.1" : "::1";
}

function normalizePublicLoopbackUrl(value: unknown): PublicLoopbackUrl | undefined {
  const raw = boundedString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return { url: sanitizeUrl(raw), protocol: url.protocol, host: url.hostname.replace(/^\[|\]$/g, ""), path: url.pathname, port: url.port ? Number(url.port) : undefined, hasQuery: url.search.length > 0, hasFragment: url.hash.length > 0, hasCredential: credentialFromText(raw) === "present" };
  } catch {
    return { url: "[REDACTED: malformed URL]", hasCredential: credentialFromText(raw) === "present" };
  }
}

function normalizeTopLevelFact(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new PublicClientEvidenceBoundaryError();
  assertNoConclusionFields(value);
  if (typeof value.kind !== "string" || typeof value.role !== "string") throw new PublicClientEvidenceBoundaryError();
  if (!(PUBLIC_FAMILY_KINDS.has(value.kind as PublicClientJourneyKind) || value.kind === "resource-discovery" || value.kind === "provider-discovery")) throw new PublicClientEvidenceBoundaryError();
  if (PUBLIC_FAMILY_KINDS.has(value.kind as PublicClientJourneyKind)) {
    if (value.family !== "ipv4" && value.family !== "ipv6") throw new PublicClientEvidenceBoundaryError();
  } else if ("family" in value) {
    throw new PublicClientEvidenceBoundaryError();
  }
}

async function normalizeCapturedPublicClientFact(value: PublicClientJourneyFact, sampledAtMillis: number): Promise<PublicClientNormalizedFact> {
  if (!Number.isFinite(sampledAtMillis)) throw new PublicClientEvidenceBoundaryError();
  normalizeTopLevelFact(value);
  const raw = value as unknown as Record<string, unknown>;
  const kind = raw.kind as PublicClientJourneyKind;
  const role = raw.role as string;
  const family = raw.family as PublicClientFamily | undefined;
  if (kind === "resource-discovery" || kind === "provider-discovery") {
    if (role !== "primary") throw new PublicClientEvidenceBoundaryError();
    return deepFreeze({ identity: `${kind}|primary`, kind, role, data: discoveryData(raw), request: normalizeRequest(raw.request) });
  }
  if (!family) throw new PublicClientEvidenceBoundaryError();
  if (kind === "registration") {
    if (role !== "primary" && role !== "negative") throw new PublicClientEvidenceBoundaryError();
    const response = normalizeSurface(raw.response);
    const request = normalizeRequest(raw.request);
    const caseId = raw.caseId;
    if (role === "negative" && !PUBLIC_NEGATIVE_REGISTRATION_CASES.includes(caseId as PublicClientNegativeRegistrationCase)) throw new PublicClientEvidenceBoundaryError();
    if (role === "primary" && caseId !== undefined) throw new PublicClientEvidenceBoundaryError();
    return deepFreeze({ identity: `registration|${role}|${family}|${caseId ?? "primary"}`, kind, role, family, caseId: caseId as PublicClientNegativeRegistrationCase | undefined, data: { response, ...(role === "primary" ? { clientId: bodyString(response.body, "client_id", "clientId") } : {}) }, request });
  }
  if (kind === "consent") {
    if (role !== "metadata") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const endorsementText = boundedString(observation.endorsementText);
    const endorsementLanguageVisible = endorsementText !== undefined ? hasUnnegatedEndorsementLanguage(endorsementText) : boundedBoolean(observation.endorsementLanguageVisible);
    return deepFreeze({ identity: `consent|metadata|${family}`, kind, role, family, data: {
      clientNameVisible: boundedBoolean(observation.clientNameVisible), clientUriVisible: boundedBoolean(observation.clientUriVisible), logoVisible: boundedBoolean(observation.logoVisible), softwareIdVisible: boundedBoolean(observation.softwareIdVisible), softwareVersionVisible: boundedBoolean(observation.softwareVersionVisible), untrustedDisclaimerVisible: boundedBoolean(observation.untrustedDisclaimerVisible), endorsementLanguageVisible,
    } });
  }
  if (kind === "authorization") {
    if (role !== "approval" && role !== "denial" && role !== "abandonment") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    if (role === "approval") return deepFreeze({ identity: `authorization|approval|${family}`, kind, role, family, data: {
      affirmativeControlVisible: boundedBoolean(observation.affirmativeControlVisible), denialControlVisible: boundedBoolean(observation.denialControlVisible), callbackBeforeDecision: boundedBoolean(observation.callbackBeforeDecision), decision: observation.decision === "affirmative" || observation.decision === "denial" || observation.decision === "abandonment" ? observation.decision : undefined,
    }, request: normalizeRequest(raw.request) });
    const callbackUrl = boundedString(observation.callbackUrl);
    const browserUrl = boundedString(observation.browserUrl);
    const callbackEvidence = urlCredentialEvidence(callbackUrl);
    const browserEvidence = browserUrl ? browserUrlCredentialEvidence(browserUrl) : undefined;
    const request = normalizeRequest(raw.request);
    const expectedState = boundedString(observation.expectedState);
    const callbackState = boundedString(observation.callbackState);
    const tokenResponse = normalizeSurface(observation.tokenResponse);
    const tokenResponsePresence: PublicClientCredentialPresence = "tokenResponse" in observation ? tokenResponse.credentialPresence : "absent";
    const tokenBodyEvidence = bodyCredentialEvidence(tokenResponse.body);
    const credentialPresence = combineCredentialPresence([callbackEvidence.credentialPresence, browserEvidence?.credentialObserved ? "present" : "absent", tokenResponsePresence, observation.callbackComplete === true ? "absent" : "unknown"]);
    const authorizationCodePresent = callbackEvidence.authorizationCodePresent || Boolean(browserEvidence?.authorizationCodePresent) || tokenBodyEvidence.authorizationCodePresent;
    const accessTokenObserved = callbackEvidence.accessTokenPresent || Boolean(browserEvidence?.accessTokenPresent) || tokenBodyEvidence.accessTokenPresent;
    const refreshTokenObserved = callbackEvidence.refreshTokenPresent || Boolean(browserEvidence?.refreshTokenPresent) || tokenBodyEvidence.refreshTokenPresent;
    const idTokenObserved = callbackEvidence.idTokenPresent || Boolean(browserEvidence?.idTokenPresent) || tokenBodyEvidence.idTokenPresent;
    return deepFreeze({ identity: `authorization|${role}|${family}`, kind, role, family, data: {
      callbackReceived: boundedBoolean(observation.callbackReceived) ?? Boolean(observation.callbackComplete && callbackUrl), callbackComplete: observation.callbackComplete === true, authorizationError: boundedBoolean(observation.authorizationError), stateMatches: request?.requestStateHash !== undefined && callbackState !== undefined ? request.requestStateHash === crypto.createHash("sha256").update(callbackState).digest("base64url") : expectedState !== undefined && callbackState !== undefined ? expectedState === callbackState : undefined, tokenRequestObserved: boundedBoolean(observation.tokenRequestObserved), credentialPresence, authorizationCodePresent, accessTokenObserved, refreshTokenObserved, idTokenObserved, unexpectedCredentialObserved: credentialPresence === "present" && !authorizationCodePresent && !accessTokenObserved && !refreshTokenObserved && !idTokenObserved, callbackUrl: callbackUrl ? sanitizeUrl(callbackUrl) : undefined,
    }, request });
  }
  if (kind === "loopback") {
    if (role !== "callback" && role !== "request") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const registeredRedirectUriRaw = boundedString(observation.registeredRedirectUri);
    const registeredRedirectUri = normalizePublicLoopbackUrl(observation.registeredRedirectUri);
    return deepFreeze({ identity: `loopback|${role}|${family}`, kind, role, family, data: {
      registeredRedirectUri, registeredRedirectSupported: registeredRedirectUriRaw ? isSupportedLoopbackRegistrationRedirect(registeredRedirectUriRaw, publicLoopbackHost(family)) : undefined, callbackUrl: normalizePublicLoopbackUrl(observation.callbackUrl), requestCallbackUrl: normalizePublicLoopbackUrl(observation.requestCallbackUrl), callbackReceived: boundedBoolean(observation.callbackReceived), requestResource: boundedString(observation.requestResource), portSelectedAtRequest: boundedBoolean(observation.portSelectedAtRequest),
    }, request: normalizeRequest(raw.request) });
  }
  if (kind === "pkce") {
    if (role !== "exchange") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const verifier = boundedString(observation.verifier);
    const challenge = boundedString(observation.challenge);
    const request = normalizeRequest(raw.request);
    const authorizationRequest = normalizeRequest(observation.authorizationRequest);
    const effectiveChallenge = challenge ?? authorizationRequest?.requestCodeChallenge;
    const verifierHash = request?.request.requestCodeVerifierHash;
    return deepFreeze({ identity: `pkce|exchange|${family}`, kind, role, family, data: {
      verifierPresent: Boolean(verifier) || request?.request.requestCodeVerifierPresent === true, challengePresent: effectiveChallenge !== undefined, verifierMatchesChallenge: verifier && effectiveChallenge ? matchesS256CodeChallenge(verifier, effectiveChallenge, boundedString(observation.method)) : verifierHash !== undefined && effectiveChallenge !== undefined ? verifierHash === effectiveChallenge : undefined, method: boundedString(observation.method), requestResource: boundedString(observation.requestResource),
    }, request });
  }
  if (kind === "delegated-token") {
    if (role !== "validation") throw new PublicClientEvidenceBoundaryError();
    return deepFreeze({ identity: `delegated-token|validation|${family}`, kind, role, family, data: await normalizeDelegatedToken(raw, sampledAtMillis) as unknown as Record<string, unknown>, request: normalizeRequest(raw.request) });
  }
  if (kind === "mcp-operation") {
    if (role !== "authenticated") throw new PublicClientEvidenceBoundaryError();
    const observation = raw.observation === undefined ? {} : raw.observation;
    assertPrimitiveObservation(observation);
    const sdk = observation.sdk === undefined ? {} : observation.sdk;
    assertPrimitiveObservation(sdk);
    const response = normalizeSurface(observation.response);
    const operationUrl = boundedString(observation.operationUrl);
    const operationResource = boundedString(observation.operationResource);
    return deepFreeze({ identity: `mcp-operation|authenticated|${family}`, kind, role, family, data: {
      operationUrl: operationUrl ? sanitizeUrl(operationUrl) : undefined, operationResource: operationResource ? sanitizeUrl(operationResource) : undefined, connected: boundedBoolean(observation.connected ?? sdk.connected), listToolsCompleted: boundedBoolean(observation.listToolsCompleted ?? sdk.listToolsCompleted ?? sdk.listToolsObserved), callToolCompleted: boundedBoolean(observation.callToolCompleted ?? sdk.callToolCompleted ?? sdk.callToolObserved), resultIsError: boundedBoolean(observation.resultIsError ?? sdk.resultIsError), toolName: boundedString(sdk.toolName), response,
    }, request: normalizeRequest(raw.request ?? observation.request) });
  }
  if (kind === "grant") {
    if (role !== "cleanup") throw new PublicClientEvidenceBoundaryError();
    const observation = raw.observation === undefined ? {} : raw.observation;
    assertPrimitiveObservation(observation);
    const listResponse = normalizeSurface(observation.listResponse);
    const revokeResponse = normalizeSurface(observation.revokeResponse);
    const listResponseStatus = boundedNumber(observation.listResponseStatus);
    const revokeResponseStatus = boundedNumber(observation.revokeResponseStatus);
    return deepFreeze({ identity: `grant|cleanup|${family}`, kind, role, family, data: {
      listRequestObserved: boundedBoolean(observation.listRequestObserved ?? observation.grantListObserved), listResponse: listResponseStatus !== undefined ? { ...listResponse, complete: true, status: listResponseStatus } : listResponse, listedClientIds: normalizeStringList(observation.listedClientIds), listedGrantIds: normalizeStringList(observation.listedGrantIds), grantId: boundedString(observation.grantId), grantClientId: boundedString(observation.grantClientId ?? observation.clientId), grantPresent: boundedBoolean(observation.grantPresent), revokeRequestObserved: boundedBoolean(observation.revokeRequestObserved ?? observation.revokeObserved), revokeResponse: revokeResponseStatus !== undefined ? { ...revokeResponse, complete: true, status: revokeResponseStatus } : revokeResponse,
    }, request: normalizeRequest(raw.request ?? observation.request) });
  }
  if (kind === "cleanup") {
    if (role !== "family") throw new PublicClientEvidenceBoundaryError();
    const observation = isRecord(raw.observation) ? raw.observation : {};
    const response = normalizeSurface(observation.response);
    return deepFreeze({ identity: `cleanup|family|${family}`, kind, role, family, data: {
      listRequestObserved: boundedBoolean(observation.listRequestObserved), remainingClientIds: normalizeStringList(observation.remainingClientIds), remainingGrantIds: normalizeStringList(observation.remainingGrantIds), grantPresent: boundedBoolean(observation.grantPresent), requestStatus: boundedNumber(observation.requestStatus) ?? response.status,
    }, request: normalizeRequest(raw.request ?? observation.request) });
  }
  throw new PublicClientEvidenceBoundaryError();
}

export async function normalizePublicClientFact(value: unknown, sampledAtMillis: number): Promise<PublicClientNormalizedFact> {
  return normalizeCapturedPublicClientFact(capturePublicClientJourneyFact(value), sampledAtMillis);
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableSerialize(value[key])).join(",") + "}";
  return JSON.stringify(String(value));
}

export function publicClientFactFingerprint(fact: PublicClientNormalizedFact): string {
  return stableSerialize({ data: fact.data, request: fact.request?.request });
}

export class PublicClientEvidenceBoundary {
  private readonly acceptedFacts: PublicClientNormalizedFact[] = [];
  private readonly identityPayloads = new Map<string, Set<string>>();
  private readonly conflicts = new Set<string>();

  get facts(): readonly PublicClientNormalizedFact[] {
    return [...this.acceptedFacts];
  }

  get conflictingIdentities(): readonly string[] {
    return [...this.conflicts].sort();
  }

  async accept(value: unknown, sampledAtMillis: number): Promise<PublicClientAdmission> {
    return this.acceptSnapshot(capturePublicClientJourneyFact(value), sampledAtMillis);
  }

  async acceptSnapshot(value: PublicClientJourneyFact, sampledAtMillis: number): Promise<PublicClientAdmission> {
    const fact = await normalizeCapturedPublicClientFact(value, sampledAtMillis);
    const fingerprint = publicClientFactFingerprint(fact);
    const payloads = this.identityPayloads.get(fact.identity) ?? new Set<string>();
    const requestLike = fact.request !== undefined;
    if (!requestLike && payloads.has(fingerprint)) return { disposition: "duplicate", fact, fingerprint };
    if (!requestLike && payloads.size >= MAX_UNIQUE_PAYLOADS_PER_IDENTITY) return { disposition: "bounded", fact, fingerprint };
    if (payloads.size > 0 && !payloads.has(fingerprint)) this.conflicts.add(fact.identity);
    if (!payloads.has(fingerprint) && payloads.size < MAX_UNIQUE_PAYLOADS_PER_IDENTITY) payloads.add(fingerprint);
    this.identityPayloads.set(fact.identity, payloads);
    this.acceptedFacts.push(fact);
    return { disposition: "accepted", fact, fingerprint };
  }
}

export interface PublicClientSemanticConclusion {
  readonly key: string;
  readonly family?: PublicClientFamily;
  readonly status?: GateStatus;
  readonly evidence?: Record<string, unknown>;
  readonly error?: EvidenceError;
}

export interface PublicClientSemanticDependencies {
  readonly resourceDiscovery?: GateStatus;
  readonly providerDiscovery?: GateStatus;
  readonly [key: string]: GateStatus | undefined;
}

export interface PublicClientSemanticEvaluation {
  readonly conclusions: readonly PublicClientSemanticConclusion[];
  readonly requests: readonly MinimizedRequestObservation[];
}

export interface PublicClientSemanticBatchInput {
  readonly facts: readonly PublicClientNormalizedFact[];
  readonly target: Readonly<CompatibilityReportTarget>;
  readonly sampledAtMillis: number;
  readonly dependencies: Readonly<PublicClientSemanticDependencies>;
  readonly conflictingIdentities?: readonly string[];
  readonly includeRequests?: boolean;
}

export interface PublicClientSemanticEvaluationOptions {
  readonly dependencies?: PublicClientSemanticDependencies;
  readonly conflictingIdentities?: readonly string[];
  readonly includeRequests?: boolean;
}

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

const FAMILY_PREREQUISITES: Readonly<Partial<Record<typeof FAMILY_GATE_BASES[number], readonly string[]>>> = {
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

function semanticGate(
  key: string,
  status: GateStatus | undefined,
  evidence?: Record<string, unknown>,
  error?: EvidenceError,
  family?: PublicClientFamily,
): PublicClientSemanticConclusion {
  return { key, ...(family === undefined ? {} : { family }), status, evidence, error };
}

function statusFromValues(values: readonly (GateStatus | undefined)[]): GateStatus {
  if (values.some((value) => value === "fail")) return "fail";
  if (values.some((value) => value === "not-proven" || value === undefined)) return "not-proven";
  return "pass";
}

function statusFromObservationFields(values: readonly (boolean | undefined)[]): GateStatus {
  if (values.every((value) => value !== undefined)) return values.every(Boolean) ? "pass" : "fail";
  return "not-proven";
}

function publicRegistrationStatus(fact: PublicClientNormalizedFact): PublicClientSemanticConclusion {
  const family = fact.family as PublicClientFamily;
  const response = fact.data.response as PublicClientNormalizedSurface;
  const key = `${fact.role === "negative" ? "registration-negative-validation" : "public-client-registration"}-${family}`;
  if (!response.complete || response.status === undefined || response.status < 200 || response.status >= 600) return semanticGate(key, "not-proven", { registrationStatus: "not-proven" }, undefined, family);
  if (fact.role === "negative") {
    const observedErrorCode = bodyString(response.body, "error_code", "error");
    const errorCode = observedErrorCode && /^[A-Za-z0-9_.:-]{1,100}$/.test(observedErrorCode) ? observedErrorCode : undefined;
    const recognizedMetadataError = errorCode !== undefined && RECOGNIZED_NEGATIVE_REGISTRATION_ERRORS.has(errorCode);
    const status = response.credentialPresence === "present"
      ? "fail"
      : response.status >= 200 && response.status < 300
        ? "fail"
        : (response.status === 400 || response.status === 422) && recognizedMetadataError && response.credentialPresence === "absent"
          ? "pass"
          : "not-proven";
    return semanticGate(key, status, { case: fact.caseId, status: response.status, errorCode: errorCode ?? "unavailable", credentialPresence: response.credentialPresence }, undefined, family);
  }
  if (response.status < 200 || response.status >= 300) return semanticGate(key, "not-proven", { registrationStatus: "not-proven", status: response.status }, undefined, family);
  const redirectUris = bodyStringArray(response.body, "redirect_uris", "redirectUris");
  const grantTypes = bodyStringArray(response.body, "grant_types", "grantTypes");
  const responseTypes = bodyStringArray(response.body, "response_types", "responseTypes");
  const clientId = bodyString(response.body, "client_id", "clientId");
  const authMethod = bodyString(response.body, "token_endpoint_auth_method", "tokenEndpointAuthMethod");
  const supportedRedirects = redirectUris.length === 1 && isSupportedLoopbackRegistrationRedirect(redirectUris[0], publicLoopbackHost(family));
  const supportedGrantTypes = grantTypes.length === 1 && grantTypes[0] === "authorization_code";
  const supportedResponseTypes = responseTypes.length === 1 && responseTypes[0] === "code";
  const publicTokenAuthentication = authMethod === "none";
  const clientSecretReturned = response.credentialPresence === "present" || "client_secret" in response.body;
  const accepted = Boolean(clientId && supportedRedirects && supportedGrantTypes && supportedResponseTypes && publicTokenAuthentication && !clientSecretReturned);
  return semanticGate(key, accepted ? "pass" : "fail", { registrationStatus: accepted ? "accepted" : "rejected", registrationRedirectUri: redirectUris[0] ? sanitizeUrl(redirectUris[0]) : "unavailable", clientIdPresent: Boolean(clientId), clientSecretReturned, registeredGrantTypes: grantTypes }, undefined, family);
}

interface PublicFamilyHistory {
  acceptedClientId?: string;
  acceptedGrantId?: string;
}

type PublicSessionHistory = Map<PublicClientFamily, PublicFamilyHistory>;

function familyHistory(history: PublicSessionHistory, family: PublicClientFamily): PublicFamilyHistory {
  const current = history.get(family);
  if (current) return current;
  const created: PublicFamilyHistory = {};
  history.set(family, created);
  return created;
}

function registrationClientId(fact: PublicClientNormalizedFact): string | undefined {
  if (fact.kind !== "registration" || fact.role !== "primary" || fact.family === undefined) return undefined;
  const registration = publicRegistrationStatus(fact);
  if (registration.status !== "pass") return undefined;
  const clientId = fact.data.clientId;
  return typeof clientId === "string" && clientId.length > 0 ? clientId : undefined;
}

function updateAcceptedHistory(history: PublicSessionHistory, fact: PublicClientNormalizedFact): void {
  if (fact.family === undefined) return;
  const current = familyHistory(history, fact.family);
  const clientId = registrationClientId(fact);
  if (clientId && current.acceptedClientId === undefined) current.acceptedClientId = clientId;
  if (fact.kind === "grant") {
    const listedClientIds = fact.data.listedClientIds as string[] | undefined;
    const grantId = fact.data.grantId as string | undefined;
    const grantClientId = fact.data.grantClientId as string | undefined;
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    if (current.acceptedClientId && (listedClientIds?.includes(current.acceptedClientId) || grantClientId === current.acceptedClientId) && grantId && grantPresent !== false) current.acceptedGrantId = grantId;
  }
}

function delegatedTokenConclusion(fact: PublicClientNormalizedFact, target: CompatibilityReportTarget, history: PublicSessionHistory): PublicClientSemanticConclusion {
  const family = fact.family as PublicClientFamily;
  const data = fact.data as unknown as DelegatedTokenData;
  const key = `delegated-token-validation-${family}`;
  if (!data.tokenObserved) return semanticGate(key, "not-proven", undefined, undefined, family);
  if (data.tokenMalformed || data.jwksMalformed) return semanticGate(key, "fail", { signatureValid: false, algorithmAllowed: false, issuerMatches: false, audienceMatches: false, clientContextMatches: false, grantContextMatches: false, timeBoundsValid: false }, { kind: "malformed-observation" }, family);
  if (!data.jwksObserved) return semanticGate(key, "not-proven", { signatureValid: false, algorithmAllowed: typeof data.header.alg === "string" && (ALLOWED_DELEGATED_JWT_ALGORITHMS as readonly string[]).includes(data.header.alg), issuerMatches: data.claims.iss === target.expectedAuthorizationServer, audienceMatches: data.claims.aud === target.canonicalResource, clientContextMatches: false, grantContextMatches: false, timeBoundsValid: false }, undefined, family);
  const current = familyHistory(history, family);
  const request = fact.request?.request;
  const policyResult = evaluateDelegatedJwtPolicy(data.header, data.claims, {
    canonicalResource: target.canonicalResource,
    expectedClientId: current.acceptedClientId ?? "",
    expectedIssuer: target.expectedAuthorizationServer,
    nowSeconds: data.sampledAtSeconds,
    tokenRequest: { clientId: request?.requestClientId, grantType: request?.requestGrantType, resource: request?.requestResource },
  });
  const grantClaim = data.claims.grant_id;
  const grantIdentityMatches = typeof grantClaim !== "string" ? true : current.acceptedGrantId !== undefined && grantClaim === current.acceptedGrantId;
  const checks = {
    algorithmAllowed: policyResult.checks.algorithmAllowed,
    issuerMatches: policyResult.checks.issuerMatches,
    audienceMatches: policyResult.checks.audienceMatches,
    clientContextMatches: policyResult.checks.clientContextMatches,
    grantContextMatches: policyResult.checks.grantContextMatches && grantIdentityMatches,
    timeBoundsValid: policyResult.checks.timeBoundsValid,
  };
  const missingHistory = current.acceptedClientId === undefined || request === undefined || (typeof grantClaim === "string" && current.acceptedGrantId === undefined);
  const valid = data.keySelected && data.signatureValid && Object.values(checks).every(Boolean);
  const knownSecurityFailure = !data.keySelected || !data.signatureValid || !policyResult.checks.algorithmAllowed || !policyResult.checks.issuerMatches || !policyResult.checks.subjectPresent || !policyResult.checks.audienceMatches || !policyResult.checks.timeBoundsValid || (current.acceptedClientId !== undefined && !policyResult.checks.clientContextMatches) || (request !== undefined && (!policyResult.checks.grantContextMatches || !policyResult.checks.resourceContextMatches)) || (typeof data.claims.resource === "string" && data.claims.resource !== target.canonicalResource) || (typeof grantClaim === "string" && current.acceptedGrantId !== undefined && !grantIdentityMatches);
  return semanticGate(key, knownSecurityFailure ? "fail" : missingHistory ? "not-proven" : valid ? "pass" : "fail", { signatureValid: data.signatureValid, ...checks }, undefined, family);
}

function mcpOperationConclusion(fact: PublicClientNormalizedFact, target: CompatibilityReportTarget): PublicClientSemanticConclusion {
  const family = fact.family as PublicClientFamily;
  const data = fact.data;
  const request = fact.request;
  const response = data.response as PublicClientNormalizedSurface;
  const operationUrl = data.operationUrl as string | undefined ?? request?.request.url;
  const operationResource = data.operationResource as string | undefined ?? request?.request.requestResource;
  const operationResourceMatches = operationResource === undefined ? operationUrl === target.canonicalResource : operationResource === target.canonicalResource && operationUrl === target.canonicalResource;
  const requestStatus = request?.request.status ?? response.status;
  const resultIsError = data.resultIsError as boolean | undefined;
  const sdkFields = [data.connected, data.listToolsCompleted, data.callToolCompleted, resultIsError] as (boolean | undefined)[];
  const sdkComplete = sdkFields.every((value) => value !== undefined);
  const requestComplete = request !== undefined && operationUrl !== undefined && requestStatus !== undefined;
  const authorized = requestComplete && operationResourceMatches && request.request.authorizationHeaderPresent && requestStatus >= 200 && requestStatus < 300 && sdkComplete && data.connected === true && data.listToolsCompleted === true && data.callToolCompleted === true && resultIsError === false;
  const responseCredentialPresence = request?.responseCredentialPresence ?? response.credentialPresence;
  const rejectedByBoundary = requestComplete && operationResourceMatches && (requestStatus === 401 || requestStatus === 403 || bodyString(response.body, "error", "error_code") === "invalid_token") && responseCredentialPresence === "absent";
  const attemptedFailure = requestComplete && operationResourceMatches && (resultIsError === true || rejectedByBoundary);
  const status = authorized ? "pass" : attemptedFailure || (requestComplete && !operationResourceMatches) ? "fail" : "not-proven";
  return semanticGate(`authenticated-mcp-operation-${family}`, status, { operationUrl: operationUrl ?? "unavailable", operationResourceMatches, resultIsError: resultIsError ?? "unavailable", requestStatus: requestStatus ?? "unavailable" }, undefined, family);
}

function cleanupConclusion(family: PublicClientFamily, facts: readonly PublicClientNormalizedFact[], history: PublicSessionHistory): PublicClientSemanticConclusion | undefined {
  const grantFacts = facts.filter((fact) => fact.family === family && fact.kind === "grant");
  const cleanupFacts = facts.filter((fact) => fact.family === family && fact.kind === "cleanup");
  if (grantFacts.length === 0 && cleanupFacts.length === 0) return undefined;
  const current = familyHistory(history, family);
  let identified = false;
  let beforePresent: boolean | undefined;
  let revokeSucceeded: boolean | undefined;
  let requestStatus: number | undefined;
  for (const fact of grantFacts) {
    const listedClientIds = fact.data.listedClientIds as string[] | undefined;
    const listedGrantIds = fact.data.listedGrantIds as string[] | undefined;
    const grantClientId = fact.data.grantClientId as string | undefined;
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    if (listedClientIds && current.acceptedClientId) {
      identified = listedClientIds.includes(current.acceptedClientId);
      beforePresent = identified;
    }
    if (listedGrantIds && current.acceptedGrantId) {
      identified = listedGrantIds.includes(current.acceptedGrantId);
      beforePresent = identified;
    }
    if (grantClientId !== undefined && current.acceptedClientId !== undefined) {
      identified = grantClientId === current.acceptedClientId;
      beforePresent = grantPresent ?? identified;
    } else if (grantPresent !== undefined) beforePresent = grantPresent;
    const listResponse = fact.data.listResponse as PublicClientNormalizedSurface;
    const revokeResponse = fact.data.revokeResponse as PublicClientNormalizedSurface;
    const revokeRequested = fact.data.revokeRequestObserved as boolean | undefined;
    requestStatus = listResponse.status ?? revokeResponse.status ?? requestStatus;
    if (revokeRequested !== undefined) revokeSucceeded = revokeRequested && revokeResponse.complete && revokeResponse.status !== undefined && revokeResponse.status >= 200 && revokeResponse.status < 300;
  }
  let afterPresent: boolean | undefined;
  for (const fact of cleanupFacts) {
    const remainingClientIds = fact.data.remainingClientIds as string[] | undefined;
    const remainingGrantIds = fact.data.remainingGrantIds as string[] | undefined;
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    requestStatus = (fact.data.requestStatus as number | undefined) ?? requestStatus;
    if (grantPresent !== undefined) afterPresent = grantPresent;
    else if (remainingClientIds && current.acceptedClientId) afterPresent = remainingClientIds.includes(current.acceptedClientId);
    else if (remainingGrantIds && current.acceptedGrantId) afterPresent = remainingGrantIds.includes(current.acceptedGrantId);
  }
  const status = afterPresent === true ? "fail" : afterPresent === false && beforePresent === true ? revokeSucceeded === true ? "pass" : revokeSucceeded === false ? "fail" : "not-proven" : afterPresent === false ? "pass" : "not-proven";
  return semanticGate(`consent-cleanup-${family}`, status, { grantStatus: afterPresent === undefined ? "unknown" : afterPresent ? "present" : "absent", grantIdentified: identified, grantRevoked: afterPresent === false && (revokeSucceeded === true || beforePresent === false), requestStatus: requestStatus ?? "unavailable" }, undefined, family);
}

function derivePublicConclusion(fact: PublicClientNormalizedFact, target: CompatibilityReportTarget, history: PublicSessionHistory): PublicClientSemanticConclusion | undefined {
  if (fact.kind === "resource-discovery") {
    const response = fact.data.response as PublicClientNormalizedSurface;
    const resource = fact.data.advertisedResource as string | undefined;
    const authorizationServer = fact.data.advertisedAuthorizationServer as string | undefined;
    if (!response.complete || response.status === undefined) return semanticGate("resource-discovery", "not-proven");
    return semanticGate("resource-discovery", resource === target.canonicalResource && authorizationServer === target.expectedAuthorizationServer ? "pass" : "fail", { resourceMatches: resource === target.canonicalResource, advertisedResource: resource ?? "unavailable", advertisedAuthorizationServer: authorizationServer ?? "unavailable", expectedAuthorizationServer: target.expectedAuthorizationServer });
  }
  if (fact.kind === "provider-discovery") {
    const response = fact.data.response as PublicClientNormalizedSurface;
    const issuer = fact.data.issuer as string | undefined;
    if (!response.complete || response.status === undefined) return semanticGate("provider-discovery", "not-proven");
    const responseTypesSupported = (fact.data.responseTypesSupported as string[] | undefined) ?? [];
    const grantTypesSupported = (fact.data.grantTypesSupported as string[] | undefined) ?? [];
    const tokenEndpointAuthMethodsSupported = (fact.data.tokenEndpointAuthMethodsSupported as string[] | undefined) ?? [];
    const codeChallengeMethodsSupported = (fact.data.codeChallengeMethodsSupported as string[] | undefined) ?? [];
    const supportsGoldenPath = Boolean(fact.data.registrationEndpoint) && responseTypesSupported.includes("code") && grantTypesSupported.includes("authorization_code") && tokenEndpointAuthMethodsSupported.includes("none") && codeChallengeMethodsSupported.includes("S256");
    return semanticGate("provider-discovery", issuer === target.expectedAuthorizationServer && supportsGoldenPath ? "pass" : "fail", { issuerMatches: issuer === target.expectedAuthorizationServer, authorizationEndpoint: fact.data.authorizationEndpoint ?? "unavailable", registrationEndpoint: fact.data.registrationEndpoint ?? "unavailable", tokenEndpoint: fact.data.tokenEndpoint ?? "unavailable", jwksUri: fact.data.jwksUri ?? "unavailable" });
  }
  if (fact.kind === "registration") return publicRegistrationStatus(fact);
  if (fact.kind === "consent") {
    const data = fact.data;
    const noEndorsementLanguage = data.endorsementLanguageVisible === undefined ? undefined : !(data.endorsementLanguageVisible as boolean);
    const fields = [data.clientNameVisible, data.clientUriVisible, data.logoVisible, data.softwareIdVisible, data.softwareVersionVisible, data.untrustedDisclaimerVisible, noEndorsementLanguage] as (boolean | undefined)[];
    const status = fields.some((value) => value === undefined) ? "not-proven" : classifyConsentPresentation({ clientNameVisible: data.clientNameVisible as boolean, clientUriVisible: data.clientUriVisible as boolean, logoVisible: data.logoVisible as boolean, softwareIdVisible: data.softwareIdVisible as boolean, softwareVersionVisible: data.softwareVersionVisible as boolean, untrustedDisclaimerVisible: data.untrustedDisclaimerVisible as boolean, endorsementLanguageVisible: data.endorsementLanguageVisible as boolean, affirmativeControlVisible: true, denialControlVisible: true, callbackBeforeDecision: false });
    return semanticGate(`untrusted-client-metadata-${fact.family}`, status, { clientNameVisible: data.clientNameVisible, clientUriVisible: data.clientUriVisible, logoVisible: data.logoVisible, softwareIdVisible: data.softwareIdVisible, softwareVersionVisible: data.softwareVersionVisible, untrustedDisclaimerVisible: data.untrustedDisclaimerVisible }, undefined, fact.family);
  }
  if (fact.kind === "authorization") {
    if (fact.role === "approval") {
      const data = fact.data;
      const status = data.decision === undefined ? "not-proven" : statusFromObservationFields([data.affirmativeControlVisible as boolean | undefined, data.denialControlVisible as boolean | undefined, data.callbackBeforeDecision === undefined ? undefined : !(data.callbackBeforeDecision as boolean), data.decision === "affirmative"]);
      return semanticGate(`authorization-consent-${fact.family}`, status, { affirmativeControlVisible: data.affirmativeControlVisible, denialControlVisible: data.denialControlVisible, callbackBeforeDecision: data.callbackBeforeDecision, decision: data.decision ?? "unavailable" }, undefined, fact.family);
    }
    const data = fact.data;
    const unknownCredential = data.credentialPresence === "unknown";
    const outcome: AuthorizationOutcomeObservation = { kind: fact.role as AuthorizationOutcomeObservation["kind"], callbackReceived: data.callbackReceived === true, authorizationError: data.authorizationError === true, stateMatches: data.stateMatches as boolean | undefined, authorizationCodePresent: data.authorizationCodePresent === true || unknownCredential, tokenRequestObserved: data.tokenRequestObserved === true || data.tokenRequestObserved === undefined, accessTokenObserved: data.accessTokenObserved === true, refreshTokenObserved: data.refreshTokenObserved === true, idTokenObserved: data.idTokenObserved === true, browserFragmentCredentialObserved: unknownCredential || data.unexpectedCredentialObserved === true };
    const status = data.callbackComplete === true ? classifyAuthorizationOutcome(outcome) : "not-proven";
    return semanticGate(`${fact.role === "denial" ? "consent-denial" : "consent-abandonment"}-${fact.family}`, status, { callbackReceived: data.callbackReceived, stateMatches: data.stateMatches, authorizationError: data.authorizationError, authorizationCodePresent: data.authorizationCodePresent, accessTokenObserved: data.accessTokenObserved, refreshTokenObserved: data.refreshTokenObserved }, undefined, fact.family);
  }
  if (fact.kind === "loopback") {
    const data = fact.data;
    const registered = data.registeredRedirectUri as PublicLoopbackUrl | undefined;
    const callback = data.callbackUrl as PublicLoopbackUrl | undefined;
    const expectedHost = publicLoopbackHost(fact.family as PublicClientFamily);
    if (fact.role === "callback") {
      const status = data.callbackReceived === undefined ? "not-proven" : data.callbackReceived === true && data.registeredRedirectSupported === true && Boolean(registered && callback && callback.protocol === "http:" && !callback.hasFragment && registered.host === expectedHost && registered.path === "/oauth/callback" && callback.host === expectedHost && callback.path === "/oauth/callback" && Boolean(callback.port)) ? "pass" : "fail";
      return semanticGate(`loopback-${fact.family}`, status, { family: fact.family, callbackHost: callback?.host ?? "unavailable", callbackPath: callback?.path ?? "unavailable", callbackReceived: data.callbackReceived }, undefined, fact.family);
    }
    const request = data.requestCallbackUrl as PublicLoopbackUrl | undefined;
    const requestResource = data.requestResource as string | undefined;
    const registeredMatches = data.registeredRedirectSupported === true && registered?.host === expectedHost && registered.path === "/oauth/callback";
    const status = registeredMatches && request && request.protocol === "http:" && !request.hasQuery && !request.hasFragment && request.host === expectedHost && request.path === "/oauth/callback" && Boolean(request.port) && requestResource === target.canonicalResource && data.portSelectedAtRequest === true ? "pass" : data.requestCallbackUrl ? "fail" : "not-proven";
    return semanticGate(`loopback-request-${fact.family}`, status, { family: fact.family, registrationRedirectUri: registered?.url ?? "unavailable", requestTimeCallbackUrl: request?.url ?? "unavailable", portSelectedAtRequest: data.portSelectedAtRequest, resource: requestResource ?? "unavailable" }, undefined, fact.family);
  }
  if (fact.kind === "pkce") {
    const data = fact.data;
    if (data.verifierMatchesChallenge === undefined) return semanticGate(`loopback-pkce-${fact.family}`, "not-proven", { method: data.method ?? "unavailable", codeChallengePresent: data.challengePresent, codeVerifierMatchesChallenge: "unknown", resourceMatchesCanonical: data.requestResource === target.canonicalResource }, undefined, fact.family);
    return semanticGate(`loopback-pkce-${fact.family}`, data.verifierMatchesChallenge === true && data.method === "S256" && data.requestResource === target.canonicalResource ? "pass" : "fail", { method: data.method ?? "unavailable", codeChallengePresent: data.challengePresent, codeVerifierMatchesChallenge: data.verifierMatchesChallenge, resourceMatchesCanonical: data.requestResource === target.canonicalResource }, undefined, fact.family);
  }
  if (fact.kind === "delegated-token") return delegatedTokenConclusion(fact, target, history);
  if (fact.kind === "mcp-operation") return mcpOperationConclusion(fact, target);
  return undefined;
}

function applySemanticDependency(derived: PublicClientSemanticConclusion, dependency: PublicClientSemanticConclusion | undefined): PublicClientSemanticConclusion {
  return derived.status === "pass" && dependency?.status !== "pass" ? semanticGate(derived.key, "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }, derived.family) : derived;
}

function aggregateSemanticConclusion(base: typeof FAMILY_GATE_BASES[number], statuses: ReadonlyMap<PublicClientFamily, GateStatus | undefined>): PublicClientSemanticConclusion {
  const children = (["ipv4", "ipv6"] as const).map((family) => statuses.get(family));
  return semanticGate(`${base}-both`, statusFromValues(children), { families: (["ipv4", "ipv6"] as const).map((family, index) => ({ family, status: children[index] ?? "not-proven" })) }, children.every((child) => child === undefined) ? { kind: "missing-observation" } : undefined);
}

function hasOnlyOwnDataProperties(value: Record<string, unknown>): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function isNormalizedSemanticFact(value: unknown): value is PublicClientNormalizedFact {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value)) return false;
  return typeof value.identity === "string" && value.identity.length > 0 &&
    typeof value.kind === "string" && typeof value.role === "string" && isRecord(value.data) &&
    (value.family === undefined || value.family === "ipv4" || value.family === "ipv6");
}

function isSemanticDependencyStatus(value: unknown): value is GateStatus | undefined {
  return value === undefined || value === "pass" || value === "fail" || value === "not-proven";
}

function isSemanticDependencies(value: unknown): value is Readonly<PublicClientSemanticDependencies> {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value)) return false;
  return Object.values(value).every(isSemanticDependencyStatus);
}

function isSemanticTarget(value: unknown): value is CompatibilityReportTarget {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value)) return false;
  const isTargetUrl = (candidate: unknown): candidate is string => {
    if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > MAX_FACT_STRING_LENGTH) return false;
    try {
      const url = new URL(candidate);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0 && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const loopbackHosts = value.loopbackHosts;
  return typeof value.name === "string" && value.name.length > 0 && value.name.length <= MAX_FACT_STRING_LENGTH &&
    isTargetUrl(value.canonicalResource) && isTargetUrl(value.supabaseUrl) && isTargetUrl(value.expectedAuthorizationServer) &&
    (loopbackHosts === undefined || isDenseArray(loopbackHosts, 2) && loopbackHosts.length === 2 &&
      loopbackHosts[0] === "127.0.0.1" && loopbackHosts[1] === "::1");
}

function isSemanticBatchInput(value: unknown): value is PublicClientSemanticBatchInput {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value) || !isDenseArray(value.facts, MAX_SEMANTIC_BATCH_FACTS)) return false;
  return value.facts.every(isNormalizedSemanticFact) && isSemanticTarget(value.target) &&
    typeof value.sampledAtMillis === "number" && Number.isFinite(value.sampledAtMillis) &&
    isSemanticDependencies(value.dependencies) &&
    (value.conflictingIdentities === undefined || isDenseArray(value.conflictingIdentities, MAX_SEMANTIC_BATCH_FACTS) && value.conflictingIdentities.every((identity) => typeof identity === "string" && identity.length > 0)) &&
    (value.includeRequests === undefined || typeof value.includeRequests === "boolean");
}

function snapshotSemanticTarget(target: Readonly<CompatibilityReportTarget>): CompatibilityReportTarget {
  if (!isSemanticTarget(target)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const loopbackHosts = target.loopbackHosts === undefined ? undefined : [...target.loopbackHosts];
  return deepFreeze({
    name: target.name,
    canonicalResource: target.canonicalResource,
    supabaseUrl: target.supabaseUrl,
    expectedAuthorizationServer: target.expectedAuthorizationServer,
    ...(loopbackHosts === undefined ? {} : { loopbackHosts }),
  });
}

function sampledSemanticFacts(
  facts: readonly PublicClientNormalizedFact[],
  sampledAtMillis: number | undefined,
): readonly PublicClientNormalizedFact[] {
  if (sampledAtMillis === undefined) return facts;
  const sampledAtSeconds = Math.floor(sampledAtMillis / 1000);
  return Object.freeze(facts.map((fact) => fact.kind === "delegated-token"
    ? deepFreeze({ ...fact, data: { ...fact.data, sampledAtSeconds } })
    : fact));
}

function canonicalDependencyKey(key: string): string {
  if (key === "resourceDiscovery") return "resource-discovery";
  if (key === "providerDiscovery") return "provider-discovery";
  return key;
}

export function evaluatePublicClientFacts(
  input: PublicClientSemanticBatchInput,
): PublicClientSemanticEvaluation;
export function evaluatePublicClientFacts(
  facts: readonly PublicClientNormalizedFact[],
  target: CompatibilityReportTarget,
  options?: PublicClientSemanticEvaluationOptions,
): PublicClientSemanticEvaluation;
export function evaluatePublicClientFacts(
  inputOrFacts: PublicClientSemanticBatchInput | readonly PublicClientNormalizedFact[],
  targetArgument?: CompatibilityReportTarget,
  optionsArgument: PublicClientSemanticEvaluationOptions = {},
): PublicClientSemanticEvaluation {
  const batchInput = isSemanticBatchInput(inputOrFacts) ? inputOrFacts : undefined;
  const orderedFacts: readonly PublicClientNormalizedFact[] = batchInput === undefined
    ? inputOrFacts as readonly PublicClientNormalizedFact[]
    : batchInput.facts;
  const facts = batchInput
    ? sampledSemanticFacts(Object.freeze([...orderedFacts]), batchInput.sampledAtMillis)
    : orderedFacts;
  const target = batchInput ? snapshotSemanticTarget(batchInput.target) : targetArgument;
  if (target === undefined || !isSemanticTarget(target)) throw new PublicClientEvidenceBoundaryError();
  const options = batchInput
    ? {
      dependencies: batchInput.dependencies,
      conflictingIdentities: batchInput.conflictingIdentities,
      includeRequests: batchInput.includeRequests,
    }
    : optionsArgument;
  if (!isRecord(options) || !hasOnlyOwnDataProperties(options) ||
    (options.dependencies !== undefined && !isSemanticDependencies(options.dependencies)) ||
    (options.conflictingIdentities !== undefined && (!isDenseArray(options.conflictingIdentities, MAX_SEMANTIC_BATCH_FACTS) || options.conflictingIdentities.some((identity) => typeof identity !== "string" || identity.length === 0))) ||
    (options.includeRequests !== undefined && typeof options.includeRequests !== "boolean")) {
    throw new PublicClientEvidenceBoundaryError();
  }
  if (!isDenseArray(orderedFacts, MAX_SEMANTIC_BATCH_FACTS) || !orderedFacts.every(isNormalizedSemanticFact)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const externalDependencies = options.dependencies;
  const hasExplicitDependencies = batchInput !== undefined || externalDependencies !== undefined;
  const shared = new Map<string, PublicClientSemanticConclusion>();
  const family = new Map<string, Map<PublicClientFamily, PublicClientSemanticConclusion>>();
  const negative = new Map<PublicClientFamily, Map<PublicClientNegativeRegistrationCase, PublicClientSemanticConclusion>>();
  const history: PublicSessionHistory = new Map();
  const conflicts = new Set(options.conflictingIdentities ?? []);
  const seen = new Map<string, string>();
  const canonicalFacts = facts.filter((fact) => fact.kind !== "resource-discovery" && fact.kind !== "provider-discovery" || !hasExplicitDependencies);

  for (const fact of canonicalFacts) {
    const fingerprint = publicClientFactFingerprint(fact);
    const prior = seen.get(fact.identity);
    if (prior !== undefined && prior !== fingerprint) conflicts.add(fact.identity);
    else if (prior === undefined) seen.set(fact.identity, fingerprint);
    const derived = derivePublicConclusion(fact, target, history);
    if (derived && fact.kind === "registration" && fact.role === "negative" && fact.family !== undefined && fact.caseId !== undefined) {
      const byCase = negative.get(fact.family) ?? new Map<PublicClientNegativeRegistrationCase, PublicClientSemanticConclusion>();
      byCase.set(fact.caseId, conflicts.has(fact.identity) ? semanticGate(derived.key, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }, fact.family) : derived);
      negative.set(fact.family, byCase);
    } else if (derived && fact.family !== undefined) {
      const byFamily = family.get(derived.key.replace(/-(?:ipv4|ipv6)$/, "")) ?? new Map<PublicClientFamily, PublicClientSemanticConclusion>();
      byFamily.set(fact.family, conflicts.has(fact.identity) ? semanticGate(derived.key, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }, fact.family) : derived);
      family.set(derived.key.replace(/-(?:ipv4|ipv6)$/, ""), byFamily);
    } else if (derived) {
      shared.set(derived.key, conflicts.has(fact.identity) ? semanticGate(derived.key, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }) : derived);
    }
    updateAcceptedHistory(history, fact);
  }

  if (!hasExplicitDependencies) {
    for (const fact of facts.filter((candidate) => candidate.kind === "resource-discovery" || candidate.kind === "provider-discovery")) {
      const derived = derivePublicConclusion(fact, target, history);
      if (derived) shared.set(derived.key, conflicts.has(fact.identity) ? semanticGate(derived.key, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }) : derived);
    }
  }

  for (const currentFamily of ["ipv4", "ipv6"] as const) {
    const cleanup = cleanupConclusion(currentFamily, facts, history);
    if (cleanup) {
      const cleanupByFamily = family.get("consent-cleanup") ?? new Map<PublicClientFamily, PublicClientSemanticConclusion>();
      cleanupByFamily.set(currentFamily, cleanup);
      family.set("consent-cleanup", cleanupByFamily);
    }
    const cases = negative.get(currentFamily);
    const negativeKey = `registration-negative-validation-${currentFamily}`;
    const statuses = PUBLIC_NEGATIVE_REGISTRATION_CASES.map((caseId) => cases?.get(caseId)?.status);
    const negativeStatus = cases && cases.size > 0 ? statusFromValues(statuses) : undefined;
    const negativeEvidence = cases ? { cases: PUBLIC_NEGATIVE_REGISTRATION_CASES.map((caseId) => ({ case: caseId, status: cases.get(caseId)?.status ?? "not-proven" })) } : undefined;
    const negativeConclusion = semanticGate(negativeKey, negativeStatus, negativeEvidence, negativeStatus === undefined ? { kind: "missing-observation" } : undefined, currentFamily);
    const byFamily = family.get("registration-negative-validation") ?? new Map<PublicClientFamily, PublicClientSemanticConclusion>();
    byFamily.set(currentFamily, negativeConclusion);
    family.set("registration-negative-validation", byFamily);
  }

  const raw = new Map<string, PublicClientSemanticConclusion>();
  for (const [key, conclusion] of shared) raw.set(key, conclusion);
  for (const [key, status] of Object.entries(externalDependencies ?? {})) {
    raw.set(canonicalDependencyKey(key), semanticGate(canonicalDependencyKey(key), status));
  }
  for (const base of FAMILY_GATE_BASES) {
    const byFamily = family.get(base) ?? new Map<PublicClientFamily, PublicClientSemanticConclusion>();
    for (const currentFamily of ["ipv4", "ipv6"] as const) {
      const key = `${base}-${currentFamily}`;
      raw.set(key, byFamily.get(currentFamily) ?? semanticGate(key, undefined, undefined, { kind: "missing-observation" }, currentFamily));
    }
  }
  const resolved = new Map<string, PublicClientSemanticConclusion>();
  const resolving = new Set<string>();
  const resolve = (key: string): PublicClientSemanticConclusion => {
    const existing = resolved.get(key);
    if (existing) return existing;
    if (resolving.has(key)) throw new PublicClientEvidenceBoundaryError();
    resolving.add(key);
    let current = raw.get(key) ?? semanticGate(key, undefined, undefined, { kind: "missing-observation" });
    const familyMatch = /^(.*)-(ipv4|ipv6)$/.exec(key);
    const base = familyMatch?.[1];
    const prerequisites = base ? FAMILY_PREREQUISITES[base as typeof FAMILY_GATE_BASES[number]] ?? [] : [];
    for (const prerequisite of prerequisites) {
      const dependencyKey = prerequisite === "provider-discovery" ? prerequisite : `${prerequisite}-${familyMatch?.[2]}`;
      current = applySemanticDependency(current, resolve(dependencyKey));
    }
    if (key === "provider-discovery") current = applySemanticDependency(current, resolve("resource-discovery"));
    resolving.delete(key);
    resolved.set(key, current);
    return current;
  };

  const conclusions: PublicClientSemanticConclusion[] = [];
  for (const key of ["resource-discovery", "provider-discovery"]) {
    if (raw.has(key)) conclusions.push(resolve(key));
  }
  for (const base of FAMILY_GATE_BASES) {
    const statuses = new Map<PublicClientFamily, GateStatus | undefined>();
    for (const currentFamily of ["ipv4", "ipv6"] as const) {
      const conclusion = resolve(`${base}-${currentFamily}`);
      conclusions.push(conclusion);
      statuses.set(currentFamily, conclusion.status);
    }
    conclusions.push(aggregateSemanticConclusion(base, statuses));
  }
  const requests = options.includeRequests === false ? [] : facts.flatMap((fact) => fact.request ? [fact.request.request] : []);
  return { conclusions, requests };
}
