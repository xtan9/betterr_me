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
  ALLOWED_DELEGATED_JWT_ALGORITHMS,
  evaluateDelegatedJwtPolicy,
  isSupportedLoopbackRegistrationRedirect,
  matchesS256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
} from "./mcp-access-grant-policy";
import type { LoopbackHost } from "./mcp-access-grant-journey";
import { compactVerify, decodeJwt, decodeProtectedHeader, importJWK, type JWK } from "jose";

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
  readonly requestClientId?: string;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
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
const MAX_TOKEN_LENGTH = 16_384;
const MAX_JWKS_LENGTH = 65_536;
const MAX_JWKS_KEYS = 32;
const MAX_CONFIGURED_SECRETS = 32;
const MAX_CONFIGURED_SECRET_LENGTH = 500;
const MAX_RETAINED_FACTS = 1_024;
const MAX_UNIQUE_PAYLOADS_PER_IDENTITY = 2;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
  "authorized", "rejected", "passed", "failed", "valid", "success", "signatureValid", "algorithmAllowed",
  "identity", "factIdentity", "catalogIdentity", "authority", "semanticRole",
]);
const SENSITIVE_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|verifier|state|code)$/i;
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|cookie|authorization|secret|token|code)$/i;
const CREDENTIAL_QUERY_KEY = /^(?:code|access_token|refresh_token|id_token|client_secret|token)$/i;
const PUBLIC_FAMILY_KINDS = new Set([
  "registration", "consent", "authorization", "loopback", "pkce", "delegated-token", "mcp-operation", "grant", "cleanup",
]);
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

function snapshotFactInput(value: unknown): PublicClientFact {
  const snapshot = copyFactInput(value, 0, new WeakSet<object>());
  if (!isRecord(snapshot)) throw new PublicClientEvidenceBoundaryError();
  return snapshot as PublicClientFact;
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
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
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

function assertNoConclusionFields(value: Record<string, unknown>): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || CONCLUSION_KEYS.has(key)) throw new PublicClientEvidenceBoundaryError();
  }
}

function hasOnlyOwnDataKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || !allowed.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function hasOnlyOwnDataProperties(value: Record<string, unknown>): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
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

function nonEmptyBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FACT_STRING_LENGTH;
}

function nonEmptyConfiguredSecret(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CONFIGURED_SECRET_LENGTH;
}

function validHttpUrl(value: unknown): value is string {
  if (!nonEmptyBoundedString(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
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
  const requestClientId = boundedString(value.requestClientId ?? value.clientId);
  const requestGrantType = boundedString(value.requestGrantType ?? value.grantType);
  const requestRedirectUri = boundedString(value.requestRedirectUri ?? value.redirectUri);
  const requestResource = boundedString(value.requestResource ?? value.resource);
  const requestCodeChallengeMethod = boundedString(value.requestCodeChallengeMethod ?? value.codeChallengeMethod);
  const request: MinimizedRequestObservation = {
    method: method.toUpperCase(),
    url: sanitizeUrl(url),
    requestBodyFields: Array.isArray(value.bodyFields)
      ? value.bodyFields.slice(0, MAX_FACT_ARRAY_ITEMS).filter((field): field is string => typeof field === "string" && field.length <= MAX_FACT_STRING_LENGTH).map((field) => field.replace(/(?:code|state|token|secret|verifier)/gi, "[REDACTED]"))
      : [],
    authorizationHeaderPresent: value.authorizationHeaderPresent === true,
    ...(requestClientId !== undefined ? { requestClientId } : {}),
    ...(requestGrantType !== undefined ? { requestGrantType } : {}),
    ...(requestRedirectUri !== undefined ? { requestRedirectUri: sanitizeUrl(requestRedirectUri) } : {}),
    ...(requestResource !== undefined ? { requestResource: sanitizeUrl(requestResource) } : {}),
    ...(requestCodeChallengeMethod !== undefined ? { requestCodeChallengeMethod } : {}),
    ...(typeof value.requestCodeChallengePresent === "boolean" ? { requestCodeChallengePresent: value.requestCodeChallengePresent } : {}),
    ...(typeof value.requestCodePresent === "boolean" ? { requestCodePresent: value.requestCodePresent } : {}),
    ...(typeof value.requestCodeVerifierPresent === "boolean" ? { requestCodeVerifierPresent: value.requestCodeVerifierPresent } : {}),
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
  if (Array.isArray(value)) {
    if (value.length > MAX_FACT_ARRAY_ITEMS) return "[REDACTED: array limit]";
    return value.map((item) => boundedJwtClaim(item, depth + 1));
  }
  return "[REDACTED: unsupported claim]";
}

function parseDelegatedToken(value: unknown): ParsedDelegatedToken {
  if (value === undefined) {
    return { observed: false, malformed: false, header: {}, claims: {} };
  }
  if (typeof value !== "string") throw new PublicClientEvidenceBoundaryError();
  if (value.length === 0 || value.length > MAX_TOKEN_LENGTH) {
    return { observed: true, malformed: true, header: {}, claims: {} };
  }
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
      if (Object.prototype.hasOwnProperty.call(decodedClaims, key)) {
        claims[key] = boundedJwtClaim(decodedClaims[key]);
      }
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
  if (Array.isArray(value.key_ops) && value.key_ops.length <= MAX_FACT_ARRAY_ITEMS) {
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
  if (!isRecord(parsed) || Object.keys(parsed).length > MAX_FACT_OBJECT_KEYS ||
    Object.keys(parsed).some((key) => key.length > MAX_FACT_STRING_LENGTH) ||
    !Array.isArray(parsed.keys) || parsed.keys.length > MAX_JWKS_KEYS) {
    return { observed: true, malformed: true, keys: [] };
  }
  const keys = parsed.keys.map(minimizeJwk);
  if (keys.some((key) => key === undefined)) return { observed: true, malformed: true, keys: [] };
  return { observed: true, malformed: false, keys: keys as DelegatedJwk[] };
}

async function normalizeDelegatedToken(
  raw: Record<string, unknown>,
  sampledAtMillis: number,
): Promise<DelegatedTokenData> {
  const observation = raw.observation === undefined ? {} : raw.observation;
  assertPrimitiveObservation(observation);
  const tokenValue = raw.token ?? observation.token;
  const jwksValue = raw.jwks ?? observation.jwks;
  const token = parseDelegatedToken(tokenValue);
  const jwks = parseJwks(jwksValue);
  const sampledAtSeconds = Math.floor(sampledAtMillis / 1000);
  if (!token.observed || token.malformed || !jwks.observed || jwks.malformed) {
    return {
      tokenObserved: token.observed,
      tokenMalformed: token.malformed,
      jwksObserved: jwks.observed,
      jwksMalformed: jwks.malformed,
      header: token.header,
      claims: token.claims,
      keySelected: false,
      signatureValid: false,
      sampledAtSeconds,
    };
  }

  const selected = selectDelegatedSigningJwk(token.header, jwks.keys);
  if (!selected.ok) {
    return {
      tokenObserved: true,
      tokenMalformed: false,
      jwksObserved: true,
      jwksMalformed: false,
      header: token.header,
      claims: token.claims,
      keySelected: false,
      signatureValid: false,
      sampledAtSeconds,
    };
  }

  let signatureValid = false;
  try {
    const key = await importJWK(selected.key as JWK, token.header.alg as string);
    await compactVerify(tokenValue as string, key, {
      algorithms: [token.header.alg as string],
    });
    signatureValid = true;
  } catch {
    signatureValid = false;
  }
  return {
    tokenObserved: true,
    tokenMalformed: false,
    jwksObserved: true,
    jwksMalformed: false,
    header: token.header,
    claims: token.claims,
    keySelected: true,
    signatureValid,
    sampledAtSeconds,
  };
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

async function normalizeFact(
  value: PublicClientFact,
  sampledAtMillis: number,
): Promise<NormalizedFact> {
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

  if (kind === "delegated-token") {
    if (role !== "validation") throw new PublicClientEvidenceBoundaryError();
    return {
      identity: `delegated-token|validation|${family}`,
      kind,
      role,
      family,
      data: await normalizeDelegatedToken(raw, sampledAtMillis) as unknown as Record<string, unknown>,
      request: normalizeRequest(raw.request),
    };
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
    const toolName = boundedString(sdk.toolName);
    return {
      identity: `mcp-operation|authenticated|${family}`,
      kind,
      role,
      family,
      data: {
        operationUrl: operationUrl ? sanitizeUrl(operationUrl) : undefined,
        operationResource: operationResource ? sanitizeUrl(operationResource) : undefined,
        connected: boundedBoolean(observation.connected ?? sdk.connected),
        listToolsCompleted: boundedBoolean(observation.listToolsCompleted ?? sdk.listToolsCompleted ?? sdk.listToolsObserved),
        callToolCompleted: boundedBoolean(observation.callToolCompleted ?? sdk.callToolCompleted ?? sdk.callToolObserved),
        resultIsError: boundedBoolean(observation.resultIsError ?? sdk.resultIsError),
        toolName,
        response,
      },
      request: normalizeRequest(raw.request ?? observation.request),
    };
  }

  if (kind === "grant") {
    if (role !== "cleanup") throw new PublicClientEvidenceBoundaryError();
    const observation = raw.observation === undefined ? {} : raw.observation;
    assertPrimitiveObservation(observation);
    const listResponse = normalizeSurface(observation.listResponse);
    const listResponseStatus = boundedNumber(observation.listResponseStatus);
    const revokeResponseStatus = boundedNumber(observation.revokeResponseStatus);
    const revokeResponse = normalizeSurface(observation.revokeResponse);
    return {
      identity: `grant|cleanup|${family}`,
      kind,
      role,
      family,
      data: {
        listRequestObserved: boundedBoolean(observation.listRequestObserved ?? observation.grantListObserved),
        listResponse: listResponseStatus !== undefined
          ? { ...listResponse, complete: true, status: listResponseStatus }
          : listResponse,
        listedClientIds: normalizeStringList(observation.listedClientIds),
        listedGrantIds: normalizeStringList(observation.listedGrantIds),
        grantId: boundedString(observation.grantId),
        grantClientId: boundedString(observation.grantClientId ?? observation.clientId),
        grantPresent: boundedBoolean(observation.grantPresent),
        revokeRequestObserved: boundedBoolean(observation.revokeRequestObserved ?? observation.revokeObserved),
        revokeResponse: revokeResponseStatus !== undefined
          ? { ...revokeResponse, complete: true, status: revokeResponseStatus }
          : revokeResponse,
      },
      request: normalizeRequest(raw.request ?? observation.request),
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
        listRequestObserved: boundedBoolean(observation.listRequestObserved),
        remainingClientIds: normalizeStringList(observation.remainingClientIds),
        remainingGrantIds: normalizeStringList(observation.remainingGrantIds),
        grantPresent: boundedBoolean(observation.grantPresent),
        requestStatus: boundedNumber(observation.requestStatus) ?? boundedNumber((normalizeSurface(observation.response).status)),
      },
      request: normalizeRequest(raw.request ?? observation.request),
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

function registrationClientId(fact: NormalizedFact): string | undefined {
  if (fact.kind !== "registration" || fact.role !== "primary" || !fact.family) return undefined;
  const registration = publicRegistrationStatus(fact);
  if (registration.status !== "pass") return undefined;
  const clientId = fact.data.clientId;
  return typeof clientId === "string" && clientId.length > 0 ? clientId : undefined;
}

function updateAcceptedHistory(
  history: PublicSessionHistory,
  fact: NormalizedFact,
): void {
  if (!fact.family) return;
  const current = familyHistory(history, fact.family);
  const clientId = registrationClientId(fact);
  if (clientId && current.acceptedClientId === undefined) current.acceptedClientId = clientId;
  if (fact.kind === "grant") {
    const listedClientIds = fact.data.listedClientIds as string[] | undefined;
    const grantId = fact.data.grantId as string | undefined;
    const grantClientId = fact.data.grantClientId as string | undefined;
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    if (current.acceptedClientId && (listedClientIds?.includes(current.acceptedClientId) || grantClientId === current.acceptedClientId) && grantId && grantPresent !== false) {
      current.acceptedGrantId = grantId;
    }
  }
}

function delegatedTokenGate(
  fact: NormalizedFact,
  target: CompatibilityReportTarget,
  history: PublicSessionHistory,
): DerivedGate {
  const family = fact.family!;
  const data = fact.data as unknown as DelegatedTokenData;
  if (!data.tokenObserved) return gate(`delegated-token-validation-${family}`, "not-proven");
  if (data.tokenMalformed || data.jwksMalformed) {
    return gate(`delegated-token-validation-${family}`, "fail", {
      signatureValid: false,
      algorithmAllowed: false,
      issuerMatches: false,
      audienceMatches: false,
      clientContextMatches: false,
      grantContextMatches: false,
      timeBoundsValid: false,
    }, { kind: "malformed-observation" });
  }
  if (!data.jwksObserved) return gate(`delegated-token-validation-${family}`, "not-proven", {
    signatureValid: false,
    algorithmAllowed: typeof data.header.alg === "string" && (ALLOWED_DELEGATED_JWT_ALGORITHMS as readonly string[]).includes(data.header.alg),
    issuerMatches: data.claims.iss === target.expectedAuthorizationServer,
    audienceMatches: data.claims.aud === target.canonicalResource,
    clientContextMatches: false,
    grantContextMatches: false,
    timeBoundsValid: false,
  });

  const current = familyHistory(history, family);
  const request = fact.request?.request;
  const policy = {
    canonicalResource: target.canonicalResource,
    expectedClientId: current.acceptedClientId ?? "",
    expectedIssuer: target.expectedAuthorizationServer,
    nowSeconds: data.sampledAtSeconds,
    tokenRequest: {
      clientId: request?.requestClientId,
      grantType: request?.requestGrantType,
      resource: request?.requestResource,
    },
  };
  const policyResult = evaluateDelegatedJwtPolicy(data.header, data.claims, policy);
  const grantClaim = data.claims.grant_id;
  const grantIdentityMatches = typeof grantClaim !== "string"
    ? true
    : current.acceptedGrantId !== undefined && grantClaim === current.acceptedGrantId;
  const checks = {
    algorithmAllowed: policyResult.checks.algorithmAllowed,
    issuerMatches: policyResult.checks.issuerMatches,
    audienceMatches: policyResult.checks.audienceMatches,
    clientContextMatches: policyResult.checks.clientContextMatches,
    grantContextMatches: policyResult.checks.grantContextMatches && grantIdentityMatches,
    timeBoundsValid: policyResult.checks.timeBoundsValid,
  };
  const missingHistory = current.acceptedClientId === undefined || request === undefined ||
    (typeof grantClaim === "string" && current.acceptedGrantId === undefined);
  const valid = data.keySelected && data.signatureValid && Object.values(checks).every(Boolean);
  const knownSecurityFailure = !data.keySelected ||
    !data.signatureValid ||
    !policyResult.checks.algorithmAllowed ||
    !policyResult.checks.issuerMatches ||
    !policyResult.checks.subjectPresent ||
    !policyResult.checks.audienceMatches ||
    !policyResult.checks.timeBoundsValid ||
    (current.acceptedClientId !== undefined && !policyResult.checks.clientContextMatches) ||
    (request !== undefined && (!policyResult.checks.grantContextMatches || !policyResult.checks.resourceContextMatches)) ||
    (typeof data.claims.resource === "string" && data.claims.resource !== target.canonicalResource) ||
    (typeof grantClaim === "string" && current.acceptedGrantId !== undefined && !grantIdentityMatches);
  return gate(`delegated-token-validation-${family}`, knownSecurityFailure ? "fail" : missingHistory ? "not-proven" : valid ? "pass" : "fail", {
    signatureValid: data.signatureValid,
    ...checks,
  });
}

function mcpOperationGate(
  fact: NormalizedFact,
  target: CompatibilityReportTarget,
): DerivedGate {
  const family = fact.family!;
  const data = fact.data;
  const request = fact.request;
  const response = data.response as NormalizedSurface;
  const operationUrl = data.operationUrl as string | undefined ?? request?.request.url;
  const operationResource = data.operationResource as string | undefined ?? request?.request.requestResource;
  const operationResourceMatches = operationResource === undefined
    ? operationUrl === target.canonicalResource
    : operationResource === target.canonicalResource && operationUrl === target.canonicalResource;
  const requestStatus = request?.request.status ?? response.status;
  const resultIsError = data.resultIsError as boolean | undefined;
  const sdkFields = [data.connected, data.listToolsCompleted, data.callToolCompleted, resultIsError] as (boolean | undefined)[];
  const sdkComplete = sdkFields.every((value) => value !== undefined);
  const requestComplete = request !== undefined && operationUrl !== undefined && requestStatus !== undefined;
  const authorized = requestComplete && operationResourceMatches && request.request.authorizationHeaderPresent &&
    requestStatus >= 200 && requestStatus < 300 && sdkComplete &&
    data.connected === true && data.listToolsCompleted === true && data.callToolCompleted === true && resultIsError === false;
  const responseCredentialPresence = request?.responseCredentialPresence ?? response.credentialPresence;
  const rejectedByBoundary = requestComplete && operationResourceMatches &&
    (requestStatus === 401 || requestStatus === 403 || bodyString(response.body, "error", "error_code") === "invalid_token") &&
    responseCredentialPresence === "absent";
  const attemptedFailure = requestComplete && operationResourceMatches &&
    (resultIsError === true || rejectedByBoundary);
  const status = authorized ? "pass" : attemptedFailure || (requestComplete && !operationResourceMatches) ? "fail" : "not-proven";
  return gate(`authenticated-mcp-operation-${family}`, status, {
    operationUrl: operationUrl ?? "unavailable",
    operationResourceMatches,
    resultIsError: resultIsError ?? "unavailable",
    requestStatus: requestStatus ?? "unavailable",
  });
}

function cleanupGate(
  family: PublicClientFamily,
  facts: readonly NormalizedFact[],
  history: PublicSessionHistory,
): DerivedGate | undefined {
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
    } else if (grantPresent !== undefined) {
      beforePresent = grantPresent;
    }
    const listResponse = fact.data.listResponse as NormalizedSurface;
    const revokeResponse = fact.data.revokeResponse as NormalizedSurface;
    const revokeRequested = fact.data.revokeRequestObserved as boolean | undefined;
    requestStatus = listResponse.status ?? revokeResponse.status ?? requestStatus;
    if (revokeRequested !== undefined) {
      revokeSucceeded = revokeRequested && revokeResponse.complete && revokeResponse.status !== undefined && revokeResponse.status >= 200 && revokeResponse.status < 300;
    }
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
  const status = afterPresent === true
    ? "fail"
    : afterPresent === false && beforePresent === true
      ? revokeSucceeded === true ? "pass" : revokeSucceeded === false ? "fail" : "not-proven"
      : afterPresent === false
        ? "pass"
        : "not-proven";
  return gate(`consent-cleanup-${family}`, status, {
    grantStatus: afterPresent === undefined ? "unknown" : afterPresent ? "present" : "absent",
    grantIdentified: identified,
    grantRevoked: afterPresent === false && (revokeSucceeded === true || beforePresent === false),
    requestStatus: requestStatus ?? "unavailable",
  });
}

function deriveFactGate(
  fact: NormalizedFact,
  target: CompatibilityReportTarget,
  history: PublicSessionHistory,
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
  if (fact.kind === "delegated-token") return delegatedTokenGate(fact, target, history);
  if (fact.kind === "mcp-operation") return mcpOperationGate(fact, target);
  if (fact.kind === "grant" || fact.kind === "cleanup") return undefined;
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

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  if (isRecord(value)) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableSerialize(value[key])).join(",") + "}";
  }
  return JSON.stringify(String(value));
}

function factFingerprint(fact: NormalizedFact): string {
  return stableSerialize({ data: fact.data, request: fact.request?.request });
}

function snapshotOptions(options: PublicClientEvidenceOptions): PublicClientEvidenceOptions {
  if (!isRecord(options) || !hasOnlyOwnDataKeys(options, ["target", "versions", "configuredSecrets", "clock", "writer"])) throw new PublicClientEvidenceBoundaryError();
  if (!isRecord(options.target) || !hasOnlyOwnDataKeys(options.target, ["name", "canonicalResource", "supabaseUrl", "expectedAuthorizationServer", "loopbackHosts"])) throw new PublicClientEvidenceBoundaryError();
  if (!nonEmptyBoundedString(options.target.name) || !validHttpUrl(options.target.canonicalResource) || !validHttpUrl(options.target.supabaseUrl) || !validHttpUrl(options.target.expectedAuthorizationServer)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  if (typeof options.clock !== "function") throw new PublicClientEvidenceBoundaryError();
  if (!options.writer || (typeof options.writer !== "function" && (!isRecord(options.writer) || !hasOnlyOwnDataKeys(options.writer, ["write"]) || typeof options.writer.write !== "function"))) {
    throw new PublicClientEvidenceBoundaryError();
  }
  if (!isRecord(options.versions) || Object.keys(options.versions).length > MAX_FACT_OBJECT_KEYS || !hasOnlyOwnDataProperties(options.versions)) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const configuredSecrets = options.configuredSecrets === undefined ? [] : options.configuredSecrets;
  if (!isDenseArray(configuredSecrets, MAX_CONFIGURED_SECRETS) || configuredSecrets.some((secret) => !nonEmptyConfiguredSecret(secret)) || new Set(configuredSecrets).size !== configuredSecrets.length) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const versions = Object.fromEntries(Object.entries(options.versions).map(([key, value]) => {
    if (!nonEmptyBoundedString(key) || !nonEmptyBoundedString(value)) throw new PublicClientEvidenceBoundaryError();
    return [key, value];
  }));
  const targetLoopbackHosts = options.target.loopbackHosts === undefined
    ? [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6]
    : isDenseArray(options.target.loopbackHosts, 2)
      ? [...options.target.loopbackHosts]
      : [];
  if (targetLoopbackHosts.length !== 2 || targetLoopbackHosts.some((host) => typeof host !== "string" || host.length > MAX_FACT_STRING_LENGTH) ||
    targetLoopbackHosts.join("|") !== [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6].join("|")) {
    throw new PublicClientEvidenceBoundaryError();
  }
  const target = {
    name: options.target.name,
    canonicalResource: options.target.canonicalResource,
    supabaseUrl: options.target.supabaseUrl,
    expectedAuthorizationServer: options.target.expectedAuthorizationServer,
    loopbackHosts: targetLoopbackHosts,
  } satisfies CompatibilityReportTarget;
  let writer: (artifact: PublicClientArtifact) => void | Promise<void>;
  try {
    writer = writerFunction(options.writer);
  } catch {
    throw new PublicClientEvidenceBoundaryError();
  }
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
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 64) throw new Error("invalid clock");
    const millis = Date.parse(value);
    if (!Number.isFinite(millis) || (previous !== undefined && millis < previous)) throw new Error("invalid clock");
    const normalized = new Date(millis).toISOString();
    return { value: normalized, millis };
  } catch {
    throw new PublicClientEvidenceBoundaryError();
  }
}

function writerFunction(writer: PublicClientArtifactWriter): (artifact: PublicClientArtifact) => void | Promise<void> {
  return typeof writer === "function" ? writer : writer.write.bind(writer);
}

function factNeedsClockSample(fact: unknown): boolean {
  return isRecord(fact) && fact.kind === "delegated-token" && fact.role === "validation";
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
  const history: PublicSessionHistory = new Map();

  for (const fact of facts) {
    const derived = deriveFactGate(fact, target, history);
    const cleanupFact = fact.kind === "grant" || fact.kind === "cleanup";
    const semanticGateId = cleanupFact && fact.family ? `consent-cleanup-${fact.family}` : derived?.gateId;
    const serialized = factFingerprint(fact);
    const previous = seen.get(fact.identity);
    if (previous !== undefined && semanticGateId !== undefined) {
      if (previous.payload !== serialized) {
        conflictingGateIds.add(previous.gateId);
        conflictingGateIds.add(semanticGateId);
      }
    } else if (semanticGateId !== undefined) {
      seen.set(fact.identity, { payload: serialized, gateId: semanticGateId });
    }
    if (derived && fact.kind === "registration" && fact.role === "negative" && fact.family && fact.caseId) {
      const byFamily = negative.get("registration-negative-validation") ?? new Map();
      const byCase = byFamily.get(fact.family) ?? new Map();
      byCase.set(fact.caseId, derived);
      byFamily.set(fact.family, byCase);
      negative.set("registration-negative-validation", byFamily);
    } else if (derived && fact.family) {
      const byFamily = family.get(derived.gateId.replace(/-(?:ipv4|ipv6)$/, "")) ?? new Map();
      byFamily.set(fact.family, derived);
      family.set(derived.gateId.replace(/-(?:ipv4|ipv6)$/, ""), byFamily);
    } else if (derived) {
      shared.set(derived.gateId, derived);
    }
    updateAcceptedHistory(history, fact);
  }

  const cleanupByFamily = new Map<PublicClientFamily, DerivedGate | undefined>();
  for (const currentFamily of MCP_ACCESS_GRANT_FAMILIES) {
    cleanupByFamily.set(currentFamily, cleanupGate(currentFamily, facts, history));
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
        const derived = base === "consent-cleanup"
          ? cleanupByFamily.get(currentFamily)
          : byFamily.get(currentFamily);
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
        const derived = base === "consent-cleanup"
          ? cleanupByFamily.get(currentFamily)
          : byFamily.get(currentFamily);
        statuses.set(currentFamily, conflictingGateIds.has(identity) ? "fail" : derived?.status);
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
  if (facts.length > MAX_RETAINED_FACTS) throw new PublicClientEvidenceBoundaryError();
  for (const fact of facts) {
    if (!fact.identity || !fact.kind || !fact.role) throw new PublicClientEvidenceBoundaryError();
    const catalogIdentity = classifyFactIdentity({
      profile: "public-client",
      source: "public-client",
      kind: fact.kind as CatalogFactKind,
      role: fact.role,
      family: (fact.family ?? "none") as CatalogFamily,
    });
    if (!catalogIdentity.accepted || catalogIdentity.authority !== "authoritative") throw new PublicClientEvidenceBoundaryError();
    void factFingerprint(fact);
  }
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
  if (typeof journey !== "function") throw stableFailure();
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
  const identityPayloads = new Map<string, Set<string>>();
  const pending = new Set<Promise<void>>();
  let closed = false;
  let poisoned = false;
  let lastClock = start.millis;
  let recordChain = Promise.resolve();

  const discard = (): void => {
    facts.length = 0;
    identityPayloads.clear();
  };

  const drain = async (): Promise<void> => {
    while (pending.size > 0) await Promise.allSettled([...pending]);
  };

  const record = (fact: PublicClientFact): Promise<void> => {
    if (closed) {
      const failure = Promise.reject(stableFailure());
      void failure.catch(() => undefined);
      return failure;
    }
    let capturedFact: PublicClientFact;
    try {
      capturedFact = snapshotFactInput(fact);
    } catch (error) {
      poisoned = true;
      const failure = Promise.reject(stableFailure(error));
      void failure.catch(() => undefined);
      return failure;
    }
    const accepted = recordChain.then(async () => {
      try {
        const currentFact = capturedFact;
        capturedFact = undefined as never;
        const clock = factNeedsClockSample(currentFact)
          ? sampleIso(options.clock, lastClock)
          : { value: "", millis: lastClock };
        lastClock = clock.millis;
        const normalized = await normalizeFact(currentFact, clock.millis);
        const payload = factFingerprint(normalized);
        const payloads = identityPayloads.get(normalized.identity) ?? new Set<string>();
        const requestLike = normalized.request !== undefined;
        if (!requestLike && payloads.has(payload)) return;
        if (!requestLike && payloads.size >= MAX_UNIQUE_PAYLOADS_PER_IDENTITY) return;
        if (facts.length >= MAX_RETAINED_FACTS) throw new PublicClientEvidenceBoundaryError();
        if (!payloads.has(payload) && payloads.size < MAX_UNIQUE_PAYLOADS_PER_IDENTITY) payloads.add(payload);
        identityPayloads.set(normalized.identity, payloads);
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

  const recorder = Object.freeze({ record });
  try {
    await journey(recorder);
  } catch (error) {
    closed = true;
    await drain();
    discard();
    throw stableFailure(error);
  }
  closed = true;
  await drain();
  if (poisoned) {
    discard();
    throw stableFailure();
  }

  let finish: { value: string; millis: number };
  try {
    finish = sampleIso(options.clock, lastClock);
  } catch (error) {
    discard();
    throw stableFailure(error);
  }

  let finalized: ReturnType<typeof finalizeRun>;
  let failure: ReturnType<typeof finalizeRun>;
  try {
    finalized = finalizeRun(facts, options, start.value, finish.value, true);
    failure = finalizeRun(facts, options, start.value, finish.value, false);
  } catch (error) {
    discard();
    throw stableFailure(error);
  }

  const writer = writerFunction(options.writer);
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
