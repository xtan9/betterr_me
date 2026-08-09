import { decodeJwt } from "jose";

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
  isSupportedLoopbackRegistrationRedirect,
  matchesS256CodeChallenge,
} from "./mcp-access-grant-policy";
import { s256CodeChallenge } from "./mcp-access-grant-journey";
import {
  PublicClientEvidenceBoundary,
  capturePublicClientJourneyFact,
  evaluatePublicClientDelegatedTokenEvidence,
  evaluatePublicClientFacts,
  normalizePublicClientDelegatedTokenEvidence,
  type PublicClientDelegatedTokenEvidence,
  type PublicClientJourneyFact,
  type PublicClientNormalizedFact,
  type PublicClientSemanticConclusion,
} from "./mcp-access-grant-public-client-semantics";

/**
 * The deterministic aggregate compatibility profile for Candidate 2.
 *
 * This is the only new value entry point in this slice. It owns one private
 * session and exposes two source-bound recorder ports: compatibility facts
 * are authoritative for the aggregate profile, while public-client discovery
 * is shadow context and the nested family facts are authoritative for their
 * closed family leaves.
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
  readonly requestCodeVerifierHash?: string;
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
  readonly authorizationRequest?: AggregateCompatibilityRequest;
}

export interface AggregateCompatibilityMcpObservation {
  readonly operationUrl?: string;
  readonly operationResource?: string;
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly callToolCompleted?: boolean;
  readonly resultIsError?: boolean;
  readonly response?: AggregateCompatibilityResponseSurface;
}

export interface AggregateCompatibilityCredentialSnapshot {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly access_token?: string;
  readonly refresh_token?: string;
}

export interface AggregateCompatibilityRefreshReplacementObservation {
  readonly previous?: AggregateCompatibilityCredentialSnapshot;
  readonly replacement?: AggregateCompatibilityCredentialSnapshot;
  readonly previousAccessToken?: string;
  readonly previousRefreshToken?: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly response?: AggregateCompatibilityResponseSurface;
  readonly request?: AggregateCompatibilityRequest;
}

export interface AggregateCompatibilityRefreshAttemptObservation {
  readonly label?: string;
  readonly refreshToken?: string;
  readonly refresh_token?: string;
  readonly response?: AggregateCompatibilityResponseSurface;
  readonly request?: AggregateCompatibilityRequest;
}

export interface AggregateCompatibilityRefreshObservation {
  readonly initial?: AggregateCompatibilityCredentialSnapshot;
  readonly initialTokens?: AggregateCompatibilityCredentialSnapshot;
  readonly tokens?: AggregateCompatibilityCredentialSnapshot;
  readonly firstReplacement?: AggregateCompatibilityRefreshReplacementObservation;
  readonly secondReplacement?: AggregateCompatibilityRefreshReplacementObservation;
  readonly replacement?: AggregateCompatibilityRefreshReplacementObservation;
  readonly attempts?: readonly AggregateCompatibilityRefreshAttemptObservation[];
  readonly replacementOperation?: AggregateCompatibilityMcpObservation;
}

export interface AggregateCompatibilityGrantObservation {
  readonly listRequestObserved?: boolean;
  readonly grantListObserved?: boolean;
  readonly listResponse?: AggregateCompatibilityResponseSurface;
  readonly listResponseStatus?: number;
  readonly listedClientIds?: readonly string[];
  readonly listedGrantIds?: readonly string[];
  readonly grantId?: string;
  readonly grantClientId?: string;
  readonly clientId?: string;
  readonly grantPresent?: boolean;
  readonly revokeRequestObserved?: boolean;
  readonly revokeObserved?: boolean;
  readonly revokeResponse?: AggregateCompatibilityResponseSurface;
  readonly revokeResponseStatus?: number;
}

export interface AggregateCompatibilityPostRevocationObservation {
  readonly response?: AggregateCompatibilityResponseSurface;
  readonly request?: AggregateCompatibilityRequest;
  readonly accessToken?: string;
  readonly access_token?: string;
}

export interface AggregateCompatibilityCleanupObservation {
  readonly listRequestObserved?: boolean;
  readonly remainingClientIds?: readonly string[];
  readonly remainingGrantIds?: readonly string[];
  readonly grantPresent?: boolean;
  readonly requestStatus?: number;
  readonly response?: AggregateCompatibilityResponseSurface;
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
    }
  | {
      readonly kind: "refresh";
      readonly role: "root" | "replacement" | "replay";
      readonly observation?: AggregateCompatibilityRefreshObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "grant";
      readonly role: "identify" | "revoke";
      readonly observation?: AggregateCompatibilityGrantObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "post-revocation";
      readonly role: "refresh" | "access";
      readonly observation?: AggregateCompatibilityPostRevocationObservation;
      readonly request?: AggregateCompatibilityRequest;
    }
  | {
      readonly kind: "cleanup";
      readonly role: "final";
      readonly observation?: AggregateCompatibilityCleanupObservation;
      readonly request?: AggregateCompatibilityRequest;
    };

export interface AggregateCompatibilityRecorders {
  readonly compatibility: {
    readonly record: (fact: AggregateCompatibilityFact) => Promise<void>;
  };
  readonly publicClient: {
    readonly record: (fact: PublicClientJourneyFact) => Promise<void>;
  };
}

export interface AggregateCompatibilityArtifact {
  readonly filename: typeof MCP_ACCESS_GRANT_ARTIFACT_NAME;
  readonly contents: string;
}

export type AggregateCompatibilityArtifactWriter =
  | ((artifact: AggregateCompatibilityArtifact) => void | Promise<void>)
  | { readonly write: (artifact: AggregateCompatibilityArtifact) => void | Promise<void> };

export interface AggregateCompatibilityEvidenceRequestSource {
  readonly snapshot: () => readonly MinimizedRequestObservation[];
}

export interface AggregateCompatibilityEvidenceOptions {
  readonly target: CompatibilityReportTarget;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets?: readonly string[];
  readonly clock: () => string;
  readonly writer: AggregateCompatibilityArtifactWriter;
  readonly requestSource?: AggregateCompatibilityEvidenceRequestSource;
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
  readonly requestStateHash?: string;
  readonly requestCodeChallenge?: string;
}

interface CompatibilityNormalizedFactBase<TData extends Readonly<Record<string, unknown>>> {
  readonly source: "compatibility";
  readonly identity: string;
  readonly family?: CatalogFamily;
  readonly caseId?: string;
  readonly data: TData;
  readonly request?: NormalizedRequest;
}

interface CompatibilityDelegatedValidationNormalizedFact extends CompatibilityNormalizedFactBase<PublicClientDelegatedTokenEvidence> {
  readonly kind: "delegated-token";
  readonly role: "validation";
}

interface CompatibilityDelegatedNegativeNormalizedFact extends CompatibilityNormalizedFactBase<Record<string, unknown>> {
  readonly kind: "delegated-token";
  readonly role: "negative";
}

interface CompatibilityOtherNormalizedFact extends CompatibilityNormalizedFactBase<Record<string, unknown>> {
  readonly kind: Exclude<CatalogFactKind, "delegated-token">;
  readonly role: string;
}

type CompatibilityNormalizedFact =
  | CompatibilityDelegatedValidationNormalizedFact
  | CompatibilityDelegatedNegativeNormalizedFact
  | CompatibilityOtherNormalizedFact;

type NormalizedFact =
  | (PublicClientNormalizedFact & { readonly source: "public-client" })
  | CompatibilityNormalizedFact;

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
const MAX_CONFIGURED_SECRETS = 32;
const MAX_CONFIGURED_SECRET_LENGTH = 500;
const MAX_RETAINED_FACTS = 1_024;
const MAX_UNIQUE_PAYLOADS_PER_IDENTITY = 2;

const SENSITIVE_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|verifier|state|code)$/i;
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|code[_-]?verifier|password|cookie|authorization|secret|token|code)$/i;
const CREDENTIAL_QUERY_KEY = /^(?:code|code[_-]?verifier|access_token|refresh_token|id_token|client_secret|token)$/i;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
  "authorized", "rejected", "passed", "failed", "valid", "success", "signatureValid", "algorithmAllowed",
  "accessTokenChanged", "refreshTokenChanged", "providerReturnedAccessToken", "providerReturnedRefreshToken",
  "rootReplayDetected", "everyIssuedDescendantRejected", "replacementCredentialsStored", "grantIdentified",
  "grantRevoked", "withinDocumentedLifetime", "operationStatus", "succeeded",
  "identity", "factIdentity", "catalogIdentity", "authority", "semanticRole",
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

function snapshotFactInput(value: unknown): AggregateCompatibilityFact | PublicClientJourneyFact {
  const snapshot = copyFactInput(value, 0, new WeakSet<object>());
  if (!isRecord(snapshot)) throw new AggregateCompatibilityEvidenceBoundaryError();
  return snapshot as AggregateCompatibilityFact | PublicClientJourneyFact;
}

function tagPublicClientSource(value: PublicClientNormalizedFact): NormalizedFact {
  if (value.kind === "delegated-token") {
    return {
      ...value,
      source: "public-client",
      identity: `public-client|${value.kind}|${value.role}${value.identity.slice(value.kind.length)}`,
    };
  }
  const role = value.kind === "resource-discovery" || value.kind === "provider-discovery" ? "shadow" : value.role;
  return {
    ...value,
    source: "public-client",
    identity: `public-client|${value.kind}|${role}${value.kind === "resource-discovery" || value.kind === "provider-discovery" ? "" : value.identity.slice(value.kind.length)}`,
    role,
  };
}

function fromSharedAggregateConclusion(conclusion: PublicClientSemanticConclusion): DerivedGate {
  return {
    gateId: conclusion.key,
    status: conclusion.status,
    evidence: conclusion.evidence,
    error: conclusion.error,
  };
}

function sharedAggregateSemanticFacts(facts: readonly NormalizedFact[]): readonly PublicClientNormalizedFact[] {
  return facts
    .filter((fact): fact is PublicClientNormalizedFact & { readonly source: "public-client" } => fact.source === "public-client" && fact.family !== undefined);
}

function copyFactInput(value: unknown, depth: number, parents: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[REDACTED: depth limit]";
  if (typeof value !== "object") return "[REDACTED: unsupported value]";
  if (parents.has(value)) return "[REDACTED: cyclic value]";
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) return "[REDACTED: array limit]";
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes("length")) throw new AggregateCompatibilityEvidenceBoundaryError();
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new AggregateCompatibilityEvidenceBoundaryError();
        result.push(copyFactInput(descriptor.value, depth + 1, parents));
      }
      if (keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
        throw new AggregateCompatibilityEvidenceBoundaryError();
      }
      return result;
    }
    if (!isRecord(value)) return "[REDACTED: unsupported value]";
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_OBJECT_KEYS) return "[REDACTED: object limit]";
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") throw new AggregateCompatibilityEvidenceBoundaryError();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new AggregateCompatibilityEvidenceBoundaryError();
      result[key] = copyFactInput(descriptor.value, depth + 1, parents);
    }
    return result;
  } finally {
    parents.delete(value);
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
  return typeof value === "string" && value.length > 0 && value.length <= MAX_STRING_LENGTH;
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
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH ? value : undefined;
}

function boundedCredential(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH ? value : undefined;
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
    if (value.length > MAX_STRING_LENGTH) return { value: "[REDACTED: length limit]", credentialPresence: keyPresence === "present" ? "present" : "unknown", complete: false };
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
  let requestStateHash: string | undefined;
  let requestCodeChallenge: string | undefined;
  try {
    const parsedUrl = new URL(url);
    const state = parsedUrl.searchParams.get("state");
    requestCodeChallenge = parsedUrl.searchParams.get("code_challenge") ?? undefined;
    requestStateHash = state ? s256CodeChallenge(state) : undefined;
  } catch {
    requestStateHash = undefined;
    requestCodeChallenge = undefined;
  }
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
    ...(boundedString(value.requestCodeVerifierHash) ? { requestCodeVerifierHash: value.requestCodeVerifierHash as string } : {}),
    ...(boundedNumber(value.status) !== undefined ? { status: value.status as number } : response?.status !== undefined ? { status: response.status } : {}),
    ...(response?.location ? { responseLocation: response.location } : {}),
    ...(response ? { responseBody: response.body, responseCredentialFields: Object.keys(response.body).filter((key) => CREDENTIAL_KEY.test(key)).sort(), responseContainsCredentials: response.credentialPresence === "present" } : {}),
  };
  return { request, response, responseCredentialPresence, requestStateHash, requestCodeChallenge };
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
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || CONCLUSION_KEYS.has(key))) throw new AggregateCompatibilityEvidenceBoundaryError();
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
  family: CatalogFamily = "none",
): void {
  const result = classifyFactIdentity({
    profile: "compatibility",
    source,
    kind,
    role,
    family,
  });
  const expectedAuthority = source === "compatibility"
    ? "authoritative"
    : kind === "resource-discovery" || kind === "provider-discovery"
      ? "shadow"
      : "authoritative";
  if (!result.accepted || result.authority !== expectedAuthority) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
}

interface RawCredentialSnapshot {
  readonly accessToken?: string;
  readonly refreshToken?: string;
}

function rawCredentialSnapshot(value: unknown): RawCredentialSnapshot {
  if (!isRecord(value)) return {};
  const response = isRecord(value.response) ? value.response : undefined;
  const responseBody = response && isRecord(response.body) ? response.body : undefined;
  const body = isRecord(value.body) ? value.body : undefined;
  const tokens = isRecord(value.tokens) ? value.tokens : undefined;
  const tokenResponse = isRecord(value.tokenResponse) ? value.tokenResponse : undefined;
  const tokenResponseBody = tokenResponse && isRecord(tokenResponse.body) ? tokenResponse.body : undefined;
  const providerResponse = isRecord(value.providerResponse) ? value.providerResponse : undefined;
  const providerResponseBody = providerResponse && isRecord(providerResponse.body) ? providerResponse.body : undefined;
  const sources = [value, tokens, body, responseBody, tokenResponseBody, providerResponseBody].filter((source): source is Record<string, unknown> => source !== undefined);
  const read = (keys: readonly string[]): string | undefined => {
    for (const source of sources) {
      for (const key of keys) {
        const token = boundedCredential(source[key]);
        if (token !== undefined) return token;
      }
    }
    return undefined;
  };
  return {
    accessToken: read(["accessToken", "access_token"]),
    refreshToken: read(["refreshToken", "refresh_token"]),
  };
}

function credentialSummary(snapshot: RawCredentialSnapshot): Record<string, unknown> {
  return {
    accessTokenPresent: snapshot.accessToken !== undefined,
    refreshTokenPresent: snapshot.refreshToken !== undefined,
  };
}

function responseCredentialPresenceFromRaw(value: unknown): AggregateCompatibilityCredentialPresence {
  if (!isRecord(value)) return "unknown";
  const request = isRecord(value.request) ? value.request : undefined;
  const response = value.response ?? value.tokenResponse ?? value.providerResponse ?? request?.response;
  if (response === undefined) return "absent";
  return normalizeSurface(response).credentialPresence;
}

function replacementEvidence(value: unknown): Record<string, unknown> {
  const raw = isRecord(value) ? value : {};
  const previousValue = raw.previous ?? raw.prior ?? raw.before;
  const replacementValue = raw.replacement ?? raw.next ?? raw.after ?? raw.response ?? raw.tokenResponse ?? raw.providerResponse;
  const previous = rawCredentialSnapshot(previousValue ?? {
    accessToken: raw.previousAccessToken,
    refreshToken: raw.previousRefreshToken,
  });
  const replacement = rawCredentialSnapshot(replacementValue ?? {
    tokens: raw.tokens,
    accessToken: raw.accessToken ?? raw.access_token,
    refreshToken: raw.refreshToken ?? raw.refresh_token,
  });
  const responseValue = isRecord(raw.response)
    ? raw.response
    : isRecord(raw.tokenResponse)
      ? raw.tokenResponse
      : isRecord(raw.providerResponse)
        ? raw.providerResponse
        : isRecord(raw.request) && isRecord(raw.request.response) ? raw.request.response : undefined;
  const responsePresence = responseCredentialPresenceFromRaw(raw);
  const responseBody = responseValue && isRecord(responseValue.body) ? responseValue.body : undefined;
  const providerReturnedAccessToken = responsePresence === "present" && responseBody !== undefined && Object.keys(responseBody).some((key) => /^(?:access[_-]?token)$/i.test(key));
  const providerReturnedRefreshToken = responsePresence === "present" && responseBody !== undefined && Object.keys(responseBody).some((key) => /^(?:refresh[_-]?token)$/i.test(key));
  const responseStatus = responseValue ? boundedNumber(responseValue.status) : undefined;
  const requestStatus = isRecord(raw.request) ? boundedNumber(raw.request.status) : undefined;
  return {
    previous: credentialSummary(previous),
    replacement: credentialSummary(replacement),
    providerReturnedAccessToken,
    providerReturnedRefreshToken,
    accessTokenChanged: previous.accessToken !== undefined && replacement.accessToken !== undefined && previous.accessToken !== replacement.accessToken,
    refreshTokenChanged: previous.refreshToken !== undefined && replacement.refreshToken !== undefined && previous.refreshToken !== replacement.refreshToken,
    tokenEndpointStatus: responseStatus ?? requestStatus ?? "not-observed",
    request: normalizeRequest(raw.request)?.request,
  };
}

function refreshAttemptEvidence(value: unknown): Record<string, unknown> {
  const raw = isRecord(value) ? value : {};
  const request = normalizeRequest(raw.request);
  const response = normalizeSurface(raw.response ?? raw.tokenResponse ?? raw.providerResponse ?? request?.response);
  const tokens = rawCredentialSnapshot(raw.tokens ?? raw.tokenResponse ?? raw.providerResponse ?? raw.response);
  const responseStatus = response.status ?? request?.request.status;
  const credentialPresence = combineCredentialPresence([
    response.credentialPresence,
    tokens.accessToken !== undefined || tokens.refreshToken !== undefined ? "present" : "absent",
  ]);
  const errorObserved = bodyString(response.body, "error", "error_code") !== undefined;
  const rejected = response.complete && responseStatus !== undefined && credentialPresence !== "present" && ((responseStatus >= 400 && responseStatus < 500) || errorObserved);
  const succeeded = response.complete && responseStatus !== undefined && responseStatus >= 200 && responseStatus < 300 && credentialPresence === "present";
  return {
    label: boundedString(raw.label) ?? "unlabeled",
    status: succeeded ? "succeeded" : rejected ? "rejected" : "not-proven",
    succeeded,
    responseStatus: responseStatus ?? "not-observed",
    responseCredentialPresence: credentialPresence,
    providerReturnedAccessToken: tokens.accessToken !== undefined || Object.keys(response.body).some((key) => /^(?:access[_-]?token)$/i.test(key)),
    providerReturnedRefreshToken: tokens.refreshToken !== undefined || Object.keys(response.body).some((key) => /^(?:refresh[_-]?token)$/i.test(key)),
    request: request?.request,
  };
}

function accessTokenLifetime(rawToken: string | undefined, sampledAtMillis: number): Record<string, unknown> {
  if (!rawToken) {
    return {
      accessTokenHasIssuedAt: false,
      accessTokenHasExpiry: false,
      documentedLifetimeSeconds: "unavailable",
      secondsRemaining: "unavailable",
      withinDocumentedLifetime: false,
    };
  }
  try {
    const claims = decodeJwt(rawToken);
    const issuedAt = typeof claims.iat === "number" ? claims.iat : undefined;
    const expiresAt = typeof claims.exp === "number" ? claims.exp : undefined;
    const now = Math.floor(sampledAtMillis / 1000);
    return {
      accessTokenHasIssuedAt: issuedAt !== undefined,
      accessTokenHasExpiry: expiresAt !== undefined,
      documentedLifetimeSeconds: issuedAt !== undefined && expiresAt !== undefined ? expiresAt - issuedAt : "unavailable",
      secondsRemaining: expiresAt !== undefined ? expiresAt - now : "unavailable",
      withinDocumentedLifetime: expiresAt !== undefined && expiresAt > now,
    };
  } catch {
    return {
      accessTokenHasIssuedAt: false,
      accessTokenHasExpiry: false,
      documentedLifetimeSeconds: "unavailable",
      secondsRemaining: "unavailable",
      withinDocumentedLifetime: false,
    };
  }
}

function normalizeMcpObservation(value: Record<string, unknown>): Record<string, unknown> {
  const observationValue = value.observation ?? value;
  const observation = observationValue === undefined ? {} : observationValue;
  assertPrimitiveObservation(observation);
  const sdkValue = observation.sdk === undefined ? {} : observation.sdk;
  assertPrimitiveObservation(sdkValue);
  const sdk = sdkValue as Record<string, unknown>;
  const raw = observation as Record<string, unknown>;
  const response = normalizeSurface(raw.response);
  const operationUrl = boundedString(raw.operationUrl);
  const operationResource = boundedString(raw.operationResource);
  return {
    operationUrl: operationUrl ? sanitizeUrl(operationUrl) : undefined,
    operationResource: operationResource ? sanitizeUrl(operationResource) : undefined,
    connected: boundedBoolean(raw.connected ?? sdk.connected),
    listToolsCompleted: boundedBoolean(raw.listToolsCompleted ?? sdk.listToolsCompleted ?? sdk.listToolsObserved),
    callToolCompleted: boundedBoolean(raw.callToolCompleted ?? sdk.callToolCompleted ?? sdk.callToolObserved),
    resultIsError: boundedBoolean(raw.resultIsError ?? sdk.resultIsError),
    toolName: boundedString(sdk.toolName),
    response,
  };
}

async function normalizeDelegatedToken(raw: Record<string, unknown>, sampledAtMillis: number): Promise<PublicClientDelegatedTokenEvidence> {
  const observationValue = raw.observation;
  const observation = observationValue === undefined ? {} : observationValue;
  assertPrimitiveObservation(observation);
  try {
    return await normalizePublicClientDelegatedTokenEvidence({
      token: raw.token ?? observation.token,
      jwks: raw.jwks ?? observation.jwks,
      sampledAtMillis,
    });
  } catch {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
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
  value: AggregateCompatibilityFact | PublicClientJourneyFact,
  source: "compatibility" | "public-client",
  sampledAtMillis: number,
): Promise<NormalizedFact> | NormalizedFact {
  if (!isRecord(value)) throw new AggregateCompatibilityEvidenceBoundaryError();
  assertNoConclusionFields(value);
  if (source === "compatibility" || !("family" in value)) assertNoFamily(value);
  const kind = value.kind;
  const role = value.role;
  if (typeof kind !== "string" || typeof role !== "string") throw new AggregateCompatibilityEvidenceBoundaryError();
  const family = source === "public-client" && "family" in value
    ? value.family
    : "none";
  const catalogRole = source === "public-client" && (kind === "resource-discovery" || kind === "provider-discovery")
    ? "shadow"
    : role;
  classifyIdentity(source, kind as CatalogFactKind, catalogRole, family as CatalogFamily);

  if (kind === "resource-discovery" || kind === "provider-discovery") {
    if (role !== "primary") throw new AggregateCompatibilityEvidenceBoundaryError();
    const data = discoveryData(value);
    return {
      source,
      identity: `${source}|${kind}|${catalogRole}`,
      kind,
      role: catalogRole,
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
    return {
      source,
      identity: "compatibility|registration|primary",
      kind,
      role,
      data: { response, clientId: bodyString(response.body, "client_id", "clientId") },
      request: normalizeRequest(value.request),
    };
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
      return normalizeDelegatedToken(value, sampledAtMillis).then((data): CompatibilityDelegatedValidationNormalizedFact => ({
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
      data: normalizeMcpObservation(observation),
      request: normalizeRequest(value.request),
    };
  }
  if (kind === "refresh") {
    if (role !== "root" && role !== "replacement" && role !== "replay") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    const rawObservation = observation as unknown as Record<string, unknown>;
    if (role === "root") {
      const initial = rawCredentialSnapshot(rawObservation.initial ?? rawObservation.initialTokens ?? rawObservation.tokens ?? rawObservation);
      const requestResponse = isRecord(rawObservation.request) ? rawObservation.request.response : undefined;
      const responseValue = rawObservation.response ?? rawObservation.tokenResponse ?? rawObservation.providerResponse ?? requestResponse;
      return {
        source,
        identity: "compatibility|refresh|root",
        kind,
        role,
        data: {
          initial: credentialSummary(initial),
          initialAccessTokenPresent: initial.accessToken !== undefined,
          initialRefreshTokenPresent: initial.refreshToken !== undefined,
          responseCredentialPresence: responseCredentialPresenceFromRaw(rawObservation),
          response: normalizeSurface(responseValue),
        },
        request: normalizeRequest(value.request ?? rawObservation.request),
      };
    }
    if (role === "replacement") {
      const first = rawObservation.firstReplacement ?? rawObservation.replacement;
      const second = rawObservation.secondReplacement;
      const firstEvidence = first === undefined ? undefined : replacementEvidence(first);
      const secondEvidence = second === undefined ? undefined : replacementEvidence(second);
      const replacementOperation = isRecord(rawObservation.replacementOperation)
        ? normalizeMcpObservation(rawObservation.replacementOperation)
        : undefined;
      return {
        source,
        identity: "compatibility|refresh|replacement",
        kind,
        role,
        data: {
          firstReplacement: firstEvidence,
          secondReplacement: secondEvidence,
          replacementOperation,
        },
        request: normalizeRequest(value.request ?? rawObservation.request),
      };
    }
    const attempts = Array.isArray(rawObservation.attempts) && rawObservation.attempts.length <= MAX_ARRAY_ITEMS
      ? rawObservation.attempts.map((attempt) => refreshAttemptEvidence(attempt))
      : [];
    return {
      source,
      identity: "compatibility|refresh|replay",
      kind,
      role,
      data: {
        attempts,
        attemptCount: attempts.length,
      },
      request: normalizeRequest(value.request ?? rawObservation.request),
    };
  }
  if (kind === "grant") {
    if (role !== "identify" && role !== "revoke") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    const rawObservation = observation as unknown as Record<string, unknown>;
    const request = normalizeRequest(value.request ?? rawObservation.request);
    const listResponse = normalizeSurface(rawObservation.listResponse ?? (role === "identify" ? request?.response : undefined));
    const revokeResponse = normalizeSurface(rawObservation.revokeResponse ?? (role === "revoke" ? request?.response : undefined));
    const listResponseStatus = boundedNumber(rawObservation.listResponseStatus) ?? (role === "identify" ? request?.request.status : undefined);
    const revokeResponseStatus = boundedNumber(rawObservation.revokeResponseStatus) ?? (role === "revoke" ? request?.request.status : undefined);
    return {
      source,
      identity: `compatibility|grant|${role}`,
      kind,
      role,
      data: {
        listRequestObserved: boundedBoolean(rawObservation.listRequestObserved ?? rawObservation.grantListObserved) ?? (role === "identify" && request !== undefined),
        listResponse: listResponseStatus !== undefined ? { ...listResponse, complete: true, status: listResponseStatus } : listResponse,
        listedClientIds: boundedStringList(rawObservation.listedClientIds),
        listedGrantIds: boundedStringList(rawObservation.listedGrantIds),
        grantId: boundedString(rawObservation.grantId),
        grantClientId: boundedString(rawObservation.grantClientId ?? rawObservation.clientId),
        grantPresent: boundedBoolean(rawObservation.grantPresent),
        revokeRequestObserved: boundedBoolean(rawObservation.revokeRequestObserved ?? rawObservation.revokeObserved) ?? (role === "revoke" && request !== undefined),
        revokeResponse: revokeResponseStatus !== undefined ? { ...revokeResponse, complete: true, status: revokeResponseStatus } : revokeResponse,
      },
      request,
    };
  }
  if (kind === "post-revocation") {
    if (role !== "refresh" && role !== "access") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    const rawObservation = observation as unknown as Record<string, unknown>;
    const request = normalizeRequest(value.request ?? rawObservation.request);
    const responseValue = rawObservation.response ?? rawObservation.tokenResponse ?? rawObservation.providerResponse ?? request?.response;
    const response = normalizeSurface(responseValue);
    const accessToken = rawCredentialSnapshot(rawObservation).accessToken;
    const responseAccessToken = rawCredentialSnapshot(responseValue).accessToken;
    return {
      source,
      identity: `compatibility|post-revocation|${role}`,
      kind,
      role,
      data: {
        response,
        accessTokenObserved: accessToken !== undefined || responseAccessToken !== undefined,
        ...accessTokenLifetime(accessToken ?? responseAccessToken, sampledAtMillis),
      },
      request,
    };
  }
  if (kind === "cleanup") {
    if (role !== "final") throw new AggregateCompatibilityEvidenceBoundaryError();
    const observation = value.observation === undefined ? {} : value.observation;
    assertPrimitiveObservation(observation);
    const rawObservation = observation as unknown as Record<string, unknown>;
    const request = normalizeRequest(value.request ?? rawObservation.request);
    const requestResponse = isRecord(rawObservation.request) ? rawObservation.request.response : undefined;
    const responseValue = rawObservation.response ?? requestResponse;
    const response = normalizeSurface(responseValue);
    return {
      source,
      identity: "compatibility|cleanup|final",
      kind,
      role,
      data: {
        listRequestObserved: boundedBoolean(rawObservation.listRequestObserved),
        remainingClientIds: boundedStringList(rawObservation.remainingClientIds),
        remainingGrantIds: boundedStringList(rawObservation.remainingGrantIds),
        grantPresent: boundedBoolean(rawObservation.grantPresent),
        requestStatus: boundedNumber(rawObservation.requestStatus) ?? response.status ?? request?.request.status,
      },
      request,
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

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, omitUndefined(child)]),
  );
}

function normalizedGate(derived: DerivedGate): EvidenceObservation {
  const evidence = derived.evidence === undefined ? undefined : omitUndefined(derived.evidence) as Record<string, unknown>;
  return {
    kind: "gate",
    gateId: derived.gateId,
    ...(derived.status !== undefined ? { status: derived.status, detail: catalogTemplateText(derived.gateId, derived.status) } : {}),
    ...(evidence !== undefined ? { evidence } : {}),
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

function isCompatibilityDelegatedValidationFact(fact: CompatibilityNormalizedFact): fact is CompatibilityDelegatedValidationNormalizedFact {
  return fact.kind === "delegated-token" && fact.role === "validation";
}

function delegatedValidationGate(fact: CompatibilityDelegatedValidationNormalizedFact, target: CompatibilityReportTarget, history: AggregateHistory): DerivedGate {
  const data = fact.data;
  const request = fact.request?.request;
  const judgment = evaluatePublicClientDelegatedTokenEvidence(data, {
    canonicalResource: target.canonicalResource,
    expectedIssuer: target.expectedAuthorizationServer,
    expectedClientId: history.clientId,
    expectedGrantId: history.grantId,
    ...(request === undefined ? {} : { tokenRequest: { clientId: request.requestClientId, grantType: request.requestGrantType, resource: request.requestResource } }),
  });
  if (!data.tokenObserved) return gate("delegated-token-validation", judgment.status);
  if (data.tokenMalformed || data.jwksMalformed) return gate("delegated-token-validation", judgment.status, {
    jwksFetched: data.jwksObserved,
    jwksKeyMatched: false,
    signatureValid: false,
    failures: ["malformed-observation"],
    checks: {},
  }, judgment.error);
  if (!data.jwksObserved) return gate("delegated-token-validation", judgment.status, {
    jwksFetched: false,
    jwksKeyMatched: false,
    signatureValid: false,
    failures: [],
    checks: {},
  }, judgment.error);
  return gate("delegated-token-validation", judgment.status, {
    jwksFetched: true,
    jwksKeyMatched: data.keySelected,
    signatureValid: judgment.signatureValid,
    failures: [],
    checks: judgment.checks,
  }, judgment.error);
}

function compatibilityTokenHistory(
  facts: readonly CompatibilityNormalizedFact[],
  tokenFact: CompatibilityDelegatedValidationNormalizedFact,
  acceptedClientId: string | undefined,
): AggregateHistory {
  const history: AggregateHistory = {};
  for (const fact of facts) {
    if (fact === tokenFact) break;
    if (fact.kind === "registration" && fact.role === "primary") history.clientId = acceptedClientId;
    if (fact.kind !== "grant" || history.clientId === undefined) continue;
    const listedClientIds = fact.data.listedClientIds as string[] | undefined;
    const grantId = fact.data.grantId as string | undefined;
    const grantClientId = fact.data.grantClientId as string | undefined;
    const grantPresent = fact.data.grantPresent as boolean | undefined;
    if ((listedClientIds?.includes(history.clientId) || grantClientId === history.clientId) && grantId && grantPresent !== false) history.grantId = grantId;
  }
  return history;
}

function mcpOperationGate(fact: NormalizedFact, target: CompatibilityReportTarget): DerivedGate {
  const data = fact.data;
  const normalizedRequest = fact.request;
  const request = normalizedRequest?.request;
  const response = data.response as NormalizedSurface;
  const operationUrl = data.operationUrl as string | undefined ?? request?.url;
  const operationResource = data.operationResource as string | undefined ?? request?.requestResource;
  const requestStatus = request?.status ?? response.status;
  const resourceMatches = operationResource === undefined
    ? operationUrl === target.canonicalResource
    : operationUrl === target.canonicalResource && operationResource === target.canonicalResource;
  const requestComplete = Boolean(request && operationUrl && requestStatus !== undefined);
  const sdkComplete = [data.connected, data.listToolsCompleted, data.callToolCompleted, data.resultIsError].every((value) => value !== undefined);
  const responseCredentialPresence = normalizedRequest?.responseCredentialPresence ?? response.credentialPresence;
  const rejectedByBoundary = requestComplete && resourceMatches &&
    (requestStatus === 401 || requestStatus === 403 || bodyString(response.body, "error", "error_code") === "invalid_token") &&
    responseCredentialPresence === "absent";
  const attemptedFailure = requestComplete && resourceMatches && (data.resultIsError === true || rejectedByBoundary);
  const authorized = requestComplete && resourceMatches && request?.authorizationHeaderPresent === true && requestStatus !== undefined && requestStatus >= 200 && requestStatus < 300 && sdkComplete && data.connected === true && data.listToolsCompleted === true && data.callToolCompleted === true && data.resultIsError === false;
  const status = authorized ? "pass" : attemptedFailure || (requestComplete && !resourceMatches) ? "fail" : "not-proven";
  return gate("authenticated-mcp-operation", status, {
    operationUrl: operationUrl ?? "unavailable",
    operationResourceMatches: resourceMatches,
    resultIsError: data.resultIsError ?? "unavailable",
    requestStatus: requestStatus ?? "unavailable",
  });
}

function replacementComplete(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.providerReturnedAccessToken === true &&
    value.providerReturnedRefreshToken === true &&
    value.accessTokenChanged === true &&
    value.refreshTokenChanged === true;
}

function compatibilityRefreshRotationGate(facts: readonly NormalizedFact[]): DerivedGate {
  const refreshFacts = facts.filter((fact) => fact.kind === "refresh");
  const roles = refreshFacts.map((fact) => fact.role);
  const expectedRoles = ["root", "replacement", "replay"] as const;
  const orderedPrefix = roles.length <= expectedRoles.length && roles.every((role, index) => role === expectedRoles[index]);
  const root = refreshFacts.find((fact) => fact.role === "root");
  const replacement = refreshFacts.find((fact) => fact.role === "replacement");
  if (!orderedPrefix) return gate("refresh-rotation", "fail", undefined, { kind: "conflicting-observation" });
  if (!root || !replacement) return gate("refresh-rotation", "not-proven", undefined, { kind: "missing-observation" });
  const initialComplete = root.data.initialAccessTokenPresent === true && root.data.initialRefreshTokenPresent === true;
  const first = replacement.data.firstReplacement;
  const second = replacement.data.secondReplacement;
  const firstComplete = replacementComplete(first);
  const secondComplete = replacementComplete(second);
  const evidence = {
    initial: root.data.initial,
    firstReplacement: first ?? { status: "unavailable" },
    secondReplacement: second ?? { status: "unavailable" },
    replacementOperation: replacement.data.replacementOperation ?? "unavailable",
  };
  if (!initialComplete || first === undefined || second === undefined) return gate("refresh-rotation", "not-proven", evidence, { kind: "missing-observation" });
  const attempted = [first, second].some((value) => isRecord(value) && (value.tokenEndpointStatus !== "not-observed" || value.providerReturnedAccessToken === true || value.providerReturnedRefreshToken === true));
  return gate("refresh-rotation", firstComplete && secondComplete ? "pass" : attempted ? "fail" : "not-proven", evidence, firstComplete && secondComplete ? undefined : attempted ? { kind: "unsupported-observation" } : { kind: "missing-observation" });
}

function compatibilityRefreshReplayGate(facts: readonly NormalizedFact[]): DerivedGate {
  const refreshFacts = facts.filter((fact) => fact.kind === "refresh");
  const expectedRoles = ["root", "replacement", "replay"] as const;
  const roles = refreshFacts.map((fact) => fact.role);
  const orderedPrefix = roles.length <= expectedRoles.length && roles.every((role, index) => role === expectedRoles[index]);
  if (!orderedPrefix) return gate("refresh-replay-containment", "fail", undefined, { kind: "conflicting-observation" });
  const replay = facts.find((fact) => fact.kind === "refresh" && fact.role === "replay");
  if (!replay) return gate("refresh-replay-containment", "not-proven", undefined, { kind: "missing-observation" });
  const attempts = Array.isArray(replay.data.attempts) ? replay.data.attempts as Record<string, unknown>[] : [];
  if (attempts.length === 0) return gate("refresh-replay-containment", "not-proven", { familyResults: [], familyMemberCountExercised: 0 }, { kind: "missing-observation" });
  const expectedLabels = ["consumed-root", "consumed-descendant-1", "active-descendant-2"];
  const labels = attempts.map((attempt) => attempt.label);
  const ordered = attempts.length === expectedLabels.length && labels.every((label, index) => label === expectedLabels[index]);
  const statuses = attempts.map((attempt) => attempt.status);
  const everyRejected = statuses.every((status) => status === "rejected");
  const anySucceeded = statuses.some((status) => status === "succeeded");
  const status = !ordered || anySucceeded ? "fail" : everyRejected ? "pass" : "not-proven";
  return gate("refresh-replay-containment", status, {
    rootReplayDetected: attempts[0]?.status === "rejected",
    everyIssuedDescendantRejected: everyRejected,
    familyMemberCountExercised: attempts.length,
    familyResults: Object.fromEntries(attempts.map((attempt, index) => [expectedLabels[index] ?? `attempt-${index + 1}`, {
      status: attempt.status,
      responseStatus: attempt.responseStatus,
      responseCredentialPresence: attempt.responseCredentialPresence,
    }])),
  }, status === "not-proven" ? { kind: "missing-observation" } : status === "fail" ? { kind: "conflicting-observation" } : undefined);
}

interface CompatibilityGrantState {
  readonly identified: boolean;
  readonly revoked: boolean;
  readonly grantId?: string;
  readonly clientId?: string;
  readonly requestStatus?: number;
}

function compatibilityGrantState(facts: readonly NormalizedFact[], history: AggregateHistory): CompatibilityGrantState {
  const grantFacts = facts.filter((fact) => fact.kind === "grant");
  const identify = grantFacts.find((fact) => fact.role === "identify");
  const revoke = grantFacts.find((fact) => fact.role === "revoke");
  const identityData = identify?.data;
  const listResponse = identityData?.listResponse as NormalizedSurface | undefined;
  const listedClientIds = identityData?.listedClientIds as string[] | undefined;
  const listedGrantIds = identityData?.listedGrantIds as string[] | undefined;
  const grantClientId = identityData?.grantClientId as string | undefined;
  const grantId = identityData?.grantId as string | undefined ?? history.grantId;
  const clientMatches = history.clientId !== undefined && (
    grantClientId === history.clientId || grantClientId === undefined && listedClientIds?.includes(history.clientId) === true
  );
  const identified = Boolean(
    identify &&
    identityData?.listRequestObserved === true &&
    listResponse?.complete &&
    listResponse.status !== undefined &&
    listResponse.status >= 200 &&
    listResponse.status < 300 &&
    history.clientId &&
    clientMatches &&
    grantId &&
    identityData?.grantPresent !== false &&
    (listedClientIds?.includes(history.clientId) || listedGrantIds?.includes(grantId) || grantClientId === history.clientId),
  );
  if (identified && grantId) history.grantId = grantId;
  const revokeData = revoke?.data;
  const revokeResponse = revokeData?.revokeResponse as NormalizedSurface | undefined;
  const revoked = Boolean(
    identified &&
    revokeData?.revokeRequestObserved === true &&
    revokeResponse?.complete &&
    revokeResponse.status !== undefined &&
    revokeResponse.status >= 200 &&
    revokeResponse.status < 300 &&
    (revokeData.grantId === undefined || revokeData.grantId === grantId) &&
    (revokeData.grantClientId === undefined || revokeData.grantClientId === history.clientId),
  );
  return { identified, revoked, grantId, clientId: history.clientId, requestStatus: revokeResponse?.status ?? listResponse?.status };
}

function compatibilityGrantGate(facts: readonly NormalizedFact[], history: AggregateHistory): { readonly gate: DerivedGate; readonly state: CompatibilityGrantState } {
  const grantFacts = facts.filter((fact) => fact.kind === "grant");
  const roles = grantFacts.map((fact) => fact.role);
  const expectedRoles = ["identify", "revoke"] as const;
  const orderedPrefix = roles.length <= expectedRoles.length && roles.every((role, index) => role === expectedRoles[index]);
  const complete = orderedPrefix && roles.length === expectedRoles.length;
  const state = compatibilityGrantState(facts, history);
  if (grantFacts.length === 0) return { state, gate: gate("grant-identification-revocation", "not-proven", undefined, { kind: "missing-observation" }) };
  const identityData = grantFacts.find((fact) => fact.role === "identify")?.data;
  const revokeData = grantFacts.find((fact) => fact.role === "revoke")?.data;
  const observed = identityData?.listRequestObserved === true ||
    revokeData?.revokeRequestObserved === true ||
    (identityData?.listResponse as NormalizedSurface | undefined)?.status !== undefined ||
    (revokeData?.revokeResponse as NormalizedSurface | undefined)?.status !== undefined;
  const status = !orderedPrefix ? "fail" : state.revoked ? "pass" : complete && observed ? "fail" : "not-proven";
  return {
    state,
    gate: gate("grant-identification-revocation", status, {
      grant: { present: state.grantId !== undefined, clientId: state.clientId ?? "missing" },
      grantIdentified: state.identified,
      grantRevoked: state.revoked,
      grantCount: state.grantId ? 1 : 0,
      requestStatus: state.requestStatus ?? "not-observed",
      revokeEndpointObserved: revokeData?.revokeRequestObserved === true,
    }, status === "not-proven" ? { kind: "missing-observation" } : status === "fail" ? { kind: "unsupported-observation" } : undefined),
  };
}

function compatibilityPostRevocationRefreshGate(facts: readonly NormalizedFact[], grantState: CompatibilityGrantState): DerivedGate {
  const fact = facts.find((candidate) => candidate.kind === "post-revocation" && candidate.role === "refresh");
  if (!fact || !grantState.revoked) return gate("post-revocation-refresh", "not-proven", undefined, { kind: "missing-observation" });
  const response = fact.data.response as NormalizedSurface;
  const request = fact.request?.request;
  const status = response.status ?? request?.status;
  const credentials = response.credentialPresence;
  const replacementIssued = credentials === "present";
  const rejected = response.complete && status !== undefined && credentials === "absent" && ((status >= 400 && status < 500) || bodyString(response.body, "error", "error_code") !== undefined);
  const gateStatus = replacementIssued ? "fail" : rejected ? "pass" : "not-proven";
  return gate("post-revocation-refresh", gateStatus, {
    requestStatus: status ?? "not-observed",
    replacementCredentialsStored: replacementIssued,
    succeeded: replacementIssued,
    errorCode: bodyString(response.body, "error_code", "error") ?? "none",
  }, gateStatus === "not-proven" ? { kind: "missing-observation" } : gateStatus === "fail" ? { kind: "unsupported-observation" } : undefined);
}

function compatibilityPostRevocationAccessGate(facts: readonly NormalizedFact[], grantState: CompatibilityGrantState): DerivedGate {
  const fact = facts.find((candidate) => candidate.kind === "post-revocation" && candidate.role === "access");
  if (!fact || !grantState.revoked) return gate("post-revocation-access", "not-proven", undefined, { kind: "missing-observation" });
  const response = fact.data.response as NormalizedSurface;
  const request = fact.request?.request;
  const status = response.status ?? request?.status;
  const responseCredentials = response.credentialPresence;
  const rejected = response.complete && status !== undefined && responseCredentials === "absent" && (status === 401 || status === 403 || bodyString(response.body, "error", "error_code") === "invalid_token");
  const authorized = response.complete && status !== undefined && status >= 200 && status < 300 && responseCredentials !== "present";
  const withinLifetime = fact.data.accessTokenHasExpiry === true && fact.data.withinDocumentedLifetime === true;
  const expired = fact.data.accessTokenHasExpiry === true && fact.data.withinDocumentedLifetime === false;
  const gateStatus = rejected ? "pass" : authorized && withinLifetime ? "pass" : authorized && expired ? "fail" : "not-proven";
  return gate("post-revocation-access", gateStatus, {
    operationStatus: rejected ? "rejected" : authorized ? "authorized" : "not-proven",
    accessTokenHasExpiry: fact.data.accessTokenHasExpiry ?? false,
    withinDocumentedLifetime: fact.data.withinDocumentedLifetime ?? false,
    secondsRemaining: fact.data.secondsRemaining ?? "unavailable",
  }, gateStatus === "not-proven" ? { kind: "missing-observation" } : gateStatus === "fail" ? { kind: "unsupported-observation" } : undefined);
}

function compatibilityCleanupGate(facts: readonly NormalizedFact[], grantState: CompatibilityGrantState): DerivedGate {
  const fact = facts.find((candidate) => candidate.kind === "cleanup" && candidate.role === "final");
  if (!fact) return gate("cleanup", "not-proven", undefined, { kind: "missing-observation" });
  const grantPresent = fact.data.grantPresent as boolean | undefined;
  const status = fact.data.requestStatus as number | undefined;
  const observed = fact.data.listRequestObserved === true && (grantPresent !== undefined || fact.data.remainingClientIds !== undefined || fact.data.remainingGrantIds !== undefined);
  const remainingClientIds = fact.data.remainingClientIds as string[] | undefined;
  const remainingGrantIds = fact.data.remainingGrantIds as string[] | undefined;
  const clientPresent = remainingClientIds !== undefined && grantState.clientId !== undefined ? remainingClientIds.includes(grantState.clientId) : undefined;
  const grantStillPresent = remainingGrantIds !== undefined && grantState.grantId !== undefined ? remainingGrantIds.includes(grantState.grantId) : undefined;
  const stillPresent = grantPresent === true || clientPresent === true || grantStillPresent === true
    ? true
    : grantPresent === false || clientPresent === false || grantStillPresent === false
      ? false
      : undefined;
  const requestSucceeded = status !== undefined && status >= 200 && status < 300;
  const gateStatus = !observed || !requestSucceeded ? "not-proven" : stillPresent === true ? "fail" : stillPresent === false && grantState.revoked ? "pass" : "not-proven";
  return gate("cleanup", gateStatus, {
    grantStatus: stillPresent === undefined ? "unknown" : stillPresent ? "present" : "absent",
    grantIdentified: grantState.identified,
    grantRevoked: grantState.revoked,
    requestStatus: status ?? "not-observed",
  }, gateStatus === "not-proven" ? { kind: "missing-observation" } : gateStatus === "fail" ? { kind: "unsupported-observation" } : undefined);
}

function applyDependency(
  derived: DerivedGate,
  dependency: DerivedGate | undefined,
): DerivedGate {
  return derived.status === "pass" && dependency?.status !== "pass"
    ? gate(derived.gateId, "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" })
    : derived;
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
  if (fact.kind === "refresh") return fact.role === "replay" ? "refresh-replay-containment" : "refresh-rotation";
  if (fact.kind === "grant") return "grant-identification-revocation";
  if (fact.kind === "post-revocation") return fact.role === "refresh" ? "post-revocation-refresh" : "post-revocation-access";
  if (fact.kind === "cleanup") return fact.role === "final" ? "cleanup" : undefined;
  return undefined;
}

function internalObservations(
  facts: readonly NormalizedFact[],
  target: CompatibilityReportTarget,
  includeFactRequests: boolean,
): EvidenceObservation[] {
  const compatibilityFacts = facts.filter((fact) => fact.source === "compatibility");
  const publicFamilyFacts = facts.filter((fact) => fact.source === "public-client" && fact.family !== undefined);
  const observations = new Map<string, DerivedGate>();
  const conflicts = new Set<string>();
  const sharedConflicts = new Set<string>();
  const seen = new Map<string, string>();
  for (const fact of facts) {
    const payload = factFingerprint(fact);
    const prior = seen.get(fact.identity);
    if (prior !== undefined && prior !== payload) {
      const gateId = fact.source === "compatibility" ? gateForFact(fact) : undefined;
      if (gateId) conflicts.add(gateId);
      if (fact.source === "public-client" && fact.family !== undefined) sharedConflicts.add(fact.identity);
    } else if (prior === undefined) {
      seen.set(fact.identity, payload);
    }
  }

  const history: AggregateHistory = {};
  const conflictAwareDependency = (gateId: string, derived: DerivedGate | undefined): DerivedGate | undefined =>
    conflicts.has(gateId)
      ? gate(gateId, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" })
      : derived;
  const resourceFact = compatibilityFacts.find((fact) => fact.kind === "resource-discovery");
  const resource = resourceFact
    ? conflicts.has("resource-discovery")
      ? gate("resource-discovery", "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" })
      : resourceDiscoveryGate(resourceFact, target)
    : undefined;
  if (resource) observations.set(resource.gateId, resource);
  const providerFact = compatibilityFacts.find((fact) => fact.kind === "provider-discovery");
  const provider = providerFact && conflictAwareDependency("resource-discovery", resource)?.status === "pass"
    ? providerDiscoveryGate(providerFact, target, history)
    : providerFact ? gate("provider-discovery", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (provider) observations.set(provider.gateId, provider);
  const configurationFact = compatibilityFacts.find((fact) => fact.kind === "configuration");
  if (configurationFact) observations.set("reproducible-configuration", configurationGate(configurationFact, target));
  const versionsFact = compatibilityFacts.find((fact) => fact.kind === "versions");
  if (versionsFact) observations.set("versions", versionsGate(versionsFact));

  const registrationFact = compatibilityFacts.find((fact) => fact.kind === "registration");
  const registration = registrationFact && conflictAwareDependency("provider-discovery", provider)?.status === "pass"
    ? registrationGate(registrationFact, target, history)
    : registrationFact ? gate("public-client-registration", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (registration) observations.set(registration.gateId, registration);
  const authorizationFact = compatibilityFacts.find((fact) => fact.kind === "authorization");
  const authorization = authorizationFact && conflictAwareDependency("public-client-registration", registration)?.status === "pass"
    ? authorizationGate(authorizationFact, history, target)
    : authorizationFact ? gate("authorization-consent", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (authorization) observations.set(authorization.gateId, authorization);
  const loopbackFacts = compatibilityFacts.filter((fact) => fact.kind === "loopback" || (fact.kind === "pkce" && fact.role === "positive"));
  const loopback = loopbackFacts.length && conflictAwareDependency("authorization-consent", authorization)?.status === "pass"
    ? loopbackPkceGate(compatibilityFacts, target, history)
    : loopbackFacts.length ? gate("loopback-pkce", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (loopback) observations.set(loopback.gateId, loopback);

  const pkceNegativeFacts = compatibilityFacts.filter((fact) => fact.kind === "pkce" && fact.role === "negative");
  const resourceNegativeFacts = compatibilityFacts.filter((fact) => fact.kind === "resource-binding");
  const pkceNegative = pkceNegativeFacts.length && conflictAwareDependency("loopback-pkce", loopback)?.status === "pass"
    ? negativeGate("pkce-negative-proof", pkceNegativeFacts, PKCE_NEGATIVE_CASES, false)
    : pkceNegativeFacts.length ? gate("pkce-negative-proof", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (pkceNegative) observations.set(pkceNegative.gateId, pkceNegative);
  const resourceNegative = resourceNegativeFacts.length && conflictAwareDependency("loopback-pkce", loopback)?.status === "pass"
    ? negativeGate("resource-binding-negative", resourceNegativeFacts, RESOURCE_NEGATIVE_CASES, false)
    : resourceNegativeFacts.length ? gate("resource-binding-negative", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (resourceNegative) observations.set(resourceNegative.gateId, resourceNegative);

  const tokenFact = compatibilityFacts.find(isCompatibilityDelegatedValidationFact);
  const token = tokenFact && conflictAwareDependency("loopback-pkce", loopback)?.status === "pass"
    ? delegatedValidationGate(tokenFact, target, compatibilityTokenHistory(compatibilityFacts, tokenFact, history.clientId))
    : tokenFact ? gate("delegated-token-validation", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (token) observations.set(token.gateId, token);
  const negativeTokenFacts = compatibilityFacts.filter((fact) => fact.kind === "delegated-token" && fact.role === "negative");
  const negativeToken = negativeTokenFacts.length && conflictAwareDependency("delegated-token-validation", token)?.status === "pass"
    ? negativeGate("delegated-token-negative-boundary", negativeTokenFacts, DELEGATED_NEGATIVE_CASES, true)
    : negativeTokenFacts.length ? gate("delegated-token-negative-boundary", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (negativeToken) observations.set(negativeToken.gateId, negativeToken);
  const operationFact = compatibilityFacts.find((fact) => fact.kind === "mcp-operation");
  const operation = operationFact && conflictAwareDependency("delegated-token-validation", token)?.status === "pass"
    ? mcpOperationGate(operationFact, target)
    : operationFact ? gate("authenticated-mcp-operation", "not-proven", undefined, { kind: "missing-observation", code: "dependency-not-proven" }) : undefined;
  if (operation) observations.set(operation.gateId, operation);

  const refreshFacts = compatibilityFacts.filter((fact) => fact.kind === "refresh");
  if (refreshFacts.length > 0) {
    const rotation = applyDependency(compatibilityRefreshRotationGate(refreshFacts), conflictAwareDependency("authenticated-mcp-operation", operation));
    observations.set("refresh-rotation", rotation);
    observations.set("refresh-replay-containment", applyDependency(compatibilityRefreshReplayGate(refreshFacts), conflictAwareDependency("refresh-rotation", rotation)));
  }

  const rotation = observations.get("refresh-rotation");
  const grantFacts = compatibilityFacts.filter((fact) => fact.kind === "grant");
  const rawGrant = compatibilityGrantGate(compatibilityFacts, history);
  const grant = grantFacts.length > 0 ? applyDependency(rawGrant.gate, conflictAwareDependency("refresh-rotation", rotation)) : undefined;
  if (grant) observations.set(grant.gateId, grant);
  const resolvedGrantState = grant?.evidence === undefined
    ? { identified: false, revoked: false }
    : rawGrant.state;
  if (compatibilityFacts.some((fact) => fact.kind === "post-revocation" && fact.role === "refresh")) {
    observations.set("post-revocation-refresh", applyDependency(compatibilityPostRevocationRefreshGate(compatibilityFacts, resolvedGrantState), conflictAwareDependency("grant-identification-revocation", grant)));
  }
  if (compatibilityFacts.some((fact) => fact.kind === "post-revocation" && fact.role === "access")) {
    observations.set("post-revocation-access", applyDependency(compatibilityPostRevocationAccessGate(compatibilityFacts, resolvedGrantState), conflictAwareDependency("grant-identification-revocation", grant)));
  }
  if (compatibilityFacts.some((fact) => fact.kind === "cleanup" && fact.role === "final")) {
    observations.set("cleanup", applyDependency(compatibilityCleanupGate(compatibilityFacts, rawGrant.state), conflictAwareDependency("grant-identification-revocation", grant)));
  }

  if (publicFamilyFacts.length > 0) {
    const semanticFacts = sharedAggregateSemanticFacts(facts);
    const publicEvaluation = evaluatePublicClientFacts({
      facts: Object.freeze([...semanticFacts]),
      target,
      dependencies: {
        "resource-discovery": conflictAwareDependency("resource-discovery", resource)?.status,
        "provider-discovery": conflictAwareDependency("provider-discovery", provider)?.status,
      },
      conflictingIdentities: Object.freeze([...sharedConflicts]),
      includeRequests: false,
    });
    for (const conclusion of publicEvaluation.conclusions) {
      if (conclusion.key === "resource-discovery" || conclusion.key === "provider-discovery") continue;
      observations.set(conclusion.key, fromSharedAggregateConclusion(conclusion));
    }
  }
  for (const [gateId, derived] of [...observations]) {
    if (conflicts.has(gateId)) observations.set(gateId, gate(gateId, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }));
    else observations.set(gateId, derived);
  }

  const result = [
    ...COMPATIBILITY_PROFILE.expandedGateIds
      .filter((gateId) => observations.has(gateId))
      .map((gateId) => normalizedGate(observations.get(gateId) as DerivedGate)),
  ];
  if (includeFactRequests) {
    result.push(...facts.flatMap((fact) => fact.request ? [{ kind: "request" as const, request: fact.request.request }] : []));
  }
  return result;
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

function snapshotOptions(options: AggregateCompatibilityEvidenceOptions): AggregateCompatibilityEvidenceOptions {
  if (!isRecord(options) || !hasOnlyOwnDataKeys(options, ["target", "versions", "configuredSecrets", "clock", "writer", "requestSource"])) throw new AggregateCompatibilityEvidenceBoundaryError();
  if (!isRecord(options.target) || !hasOnlyOwnDataKeys(options.target, ["name", "canonicalResource", "supabaseUrl", "expectedAuthorizationServer", "loopbackHosts"])) throw new AggregateCompatibilityEvidenceBoundaryError();
  if (!nonEmptyBoundedString(options.target.name) || !validHttpUrl(options.target.canonicalResource) || !validHttpUrl(options.target.supabaseUrl) || !validHttpUrl(options.target.expectedAuthorizationServer)) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  if (typeof options.clock !== "function") throw new AggregateCompatibilityEvidenceBoundaryError();
  if (!options.writer || (typeof options.writer !== "function" && (!isRecord(options.writer) || !hasOnlyOwnDataKeys(options.writer, ["write"]) || typeof options.writer.write !== "function"))) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  if (!isRecord(options.versions) || Object.keys(options.versions).length > MAX_OBJECT_KEYS || !hasOnlyOwnDataProperties(options.versions)) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  const configuredSecrets = options.configuredSecrets === undefined ? [] : options.configuredSecrets;
  if (!isDenseArray(configuredSecrets, MAX_CONFIGURED_SECRETS) || configuredSecrets.some((secret) => !nonEmptyConfiguredSecret(secret)) || new Set(configuredSecrets).size !== configuredSecrets.length) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  if (options.requestSource !== undefined && (!isRecord(options.requestSource) || !hasOnlyOwnDataKeys(options.requestSource, ["snapshot"]) || typeof options.requestSource.snapshot !== "function")) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  const versions = Object.fromEntries(Object.entries(options.versions).map(([key, value]) => {
    if (!nonEmptyBoundedString(key) || !nonEmptyBoundedString(value)) throw new AggregateCompatibilityEvidenceBoundaryError();
    return [key, value];
  }));
  const targetLoopbackHosts = options.target.loopbackHosts === undefined
    ? undefined
    : isDenseArray(options.target.loopbackHosts, 2)
      ? [...options.target.loopbackHosts]
      : [];
  if (targetLoopbackHosts !== undefined && (targetLoopbackHosts.length !== 2 || targetLoopbackHosts.some((host) => typeof host !== "string" || host.length > MAX_STRING_LENGTH) ||
    targetLoopbackHosts.join("|") !== [MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv4, MCP_ACCESS_GRANT_LOOPBACK_HOSTS.ipv6].join("|"))) {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  const target = {
    name: options.target.name,
    canonicalResource: options.target.canonicalResource,
    supabaseUrl: options.target.supabaseUrl,
    expectedAuthorizationServer: options.target.expectedAuthorizationServer,
    ...(targetLoopbackHosts !== undefined ? { loopbackHosts: targetLoopbackHosts } : {}),
  } satisfies CompatibilityReportTarget;
  let writer: (artifact: AggregateCompatibilityArtifact) => void | Promise<void>;
  try {
    writer = writerFunction(options.writer);
  } catch {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
  return deepFreeze({
    target,
    versions,
    configuredSecrets: [...configuredSecrets],
    clock: options.clock,
    writer,
    ...(options.requestSource === undefined ? {} : { requestSource: { snapshot: options.requestSource.snapshot } }),
  });
}

function sampleClock(clock: () => string, previous?: number): { readonly value: string; readonly millis: number } {
  let value: unknown;
  try {
    value = clock();
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 64) throw new Error("invalid clock");
    const millis = Date.parse(value);
    if (!Number.isFinite(millis) || (previous !== undefined && millis < previous)) throw new Error("invalid clock");
    const normalized = new Date(millis).toISOString();
    return { value: normalized, millis };
  } catch {
    throw new AggregateCompatibilityEvidenceBoundaryError();
  }
}

async function persist(writer: (artifact: AggregateCompatibilityArtifact) => void | Promise<void>, artifact: AggregateCompatibilityArtifact): Promise<boolean> {
  try {
    await writer(artifact);
    return true;
  } catch {
    return false;
  }
}

function factNeedsClockSample(fact: unknown): boolean {
  if (!isRecord(fact)) return false;
  return fact.kind === "delegated-token";
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
  if (facts.length > MAX_RETAINED_FACTS) throw new AggregateCompatibilityEvidenceBoundaryError();
  for (const fact of facts) {
    if (!fact.identity || !fact.kind || !fact.role) throw new AggregateCompatibilityEvidenceBoundaryError();
    const family = fact.source === "public-client" ? fact.family ?? "none" : "none";
    const catalogIdentity = classifyFactIdentity({
      profile: "compatibility",
      source: fact.source,
      kind: fact.kind,
      role: fact.role,
      family,
    });
    const expectedAuthority = fact.source === "compatibility"
      ? "authoritative"
      : fact.kind === "resource-discovery" || fact.kind === "provider-discovery"
        ? "shadow"
        : "authoritative";
    if (!catalogIdentity.accepted || catalogIdentity.authority !== expectedAuthority) throw new AggregateCompatibilityEvidenceBoundaryError();
    void factFingerprint(fact);
  }
  const context = createEvidenceRunContext({
    configuredSecrets: options.configuredSecrets ?? [],
    time: { startedAt, finishedAt },
    versions: options.versions,
  });
  const requestSource = options.requestSource;
  const observations = internalObservations(facts, options.target, requestSource === undefined);
  if (requestSource !== undefined) {
    observations.push(...requestSource.snapshot().map((request) => ({ kind: "request" as const, request })));
  }
  return finalizeEvidence({
    issue: COMPATIBILITY_PROFILE.issue,
    target: options.target,
    requiredGateIds: COMPATIBILITY_PROFILE.expandedGateIds,
    observations,
    ...(artifactWriteSucceeded !== undefined ? { artifactWriteSucceeded } : {}),
  }, context);
}

/** Run one private aggregate compatibility evidence session. */
export async function runAggregateCompatibilityEvidence(
  optionsInput: AggregateCompatibilityEvidenceOptions,
  journey: (recorders: AggregateCompatibilityRecorders) => void | Promise<void>,
): Promise<AggregateCompatibilityEvidenceResult> {
  if (typeof journey !== "function") throw stableFailure();
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
  const identityPayloads = new Map<string, Set<string>>();
  const publicBoundary = new PublicClientEvidenceBoundary();
  const pending = new Set<Promise<void>>();
  let recordChain = Promise.resolve();
  let closed = false;
  let poisoned = false;
  let lastClock = start.millis;

  const discard = (): void => {
    facts.length = 0;
    identityPayloads.clear();
  };

  const drain = async (): Promise<void> => {
    while (pending.size > 0) await Promise.allSettled([...pending]);
  };

  const record = (source: "compatibility" | "public-client", fact: AggregateCompatibilityFact | PublicClientJourneyFact): Promise<void> => {
    if (closed) {
      const failure = Promise.reject(stableFailure());
      void failure.catch(() => undefined);
      return failure;
    }
    let capturedFact: AggregateCompatibilityFact | PublicClientJourneyFact;
    try {
      capturedFact = source === "public-client"
        ? capturePublicClientJourneyFact(fact)
        : snapshotFactInput(fact);
    } catch (error) {
      poisoned = true;
      const failure = Promise.reject(stableFailure(error));
      void failure.catch(() => undefined);
      return failure;
    }
    const accepted = recordChain.then(async () => {
      try {
        const currentFact = capturedFact;
        const sampled = factNeedsClockSample(currentFact)
          ? sampleClock(options.clock, lastClock)
          : { value: "", millis: lastClock };
        lastClock = sampled.millis;
        if (source === "public-client") {
          if (facts.length >= MAX_RETAINED_FACTS) throw new AggregateCompatibilityEvidenceBoundaryError();
          const admission = await publicBoundary.accept(currentFact, sampled.millis);
          if (admission.disposition === "accepted") facts.push(tagPublicClientSource(admission.fact));
          return;
        }
        const normalized = await normalizeFact(currentFact, source, sampled.millis);
        const payload = factFingerprint(normalized);
        const payloads = identityPayloads.get(normalized.identity) ?? new Set<string>();
        const requestLike = normalized.request !== undefined;
        if (!requestLike && payloads.has(payload)) return;
        if (!requestLike && payloads.size >= MAX_UNIQUE_PAYLOADS_PER_IDENTITY) return;
        if (facts.length >= MAX_RETAINED_FACTS) throw new AggregateCompatibilityEvidenceBoundaryError();
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

  const recorders: AggregateCompatibilityRecorders = Object.freeze({
    compatibility: Object.freeze({ record: (fact: AggregateCompatibilityFact) => record("compatibility", fact) }),
    publicClient: Object.freeze({ record: (fact: PublicClientJourneyFact) => record("public-client", fact) }),
  });
  try {
    await journey(recorders);
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

  let finish: { readonly value: string; readonly millis: number };
  try {
    finish = sampleClock(options.clock, lastClock);
  } catch (error) {
    discard();
    throw stableFailure(error);
  }

  let preliminary: ReturnType<typeof finalizeRun>;
  let failure: ReturnType<typeof finalizeRun>;
  try {
    preliminary = finalizeRun(facts, options, start.value, finish.value, true);
    failure = finalizeRun(facts, options, start.value, finish.value, false);
  } catch (error) {
    discard();
    throw stableFailure(error);
  }

  const writer = writerFunction(options.writer);
  const preliminaryArtifact = artifact(preliminary.verification.serialized);
  if (preliminary.verification.sanitized && await persist(writer, preliminaryArtifact)) {
    return { report: preliminary.report, artifact: preliminaryArtifact, verification: preliminary.verification, artifactWriteSucceeded: true };
  }
  const failureArtifact = artifact(failure.verification.serialized);
  let failureWriteSucceeded = false;
  for (let attempt = 0; attempt < 2 && !failureWriteSucceeded; attempt += 1) failureWriteSucceeded = await persist(writer, failureArtifact);
  return { report: failure.report, artifact: failureArtifact, verification: failure.verification, artifactWriteSucceeded: failureWriteSucceeded };
}
