import {
  classifyFactIdentity,
  MCP_ACCESS_GRANT_ARTIFACT_NAME,
  MCP_ACCESS_GRANT_CATALOGS,
  MCP_ACCESS_GRANT_LOOPBACK_HOSTS,
  PUBLIC_CLIENT_PROFILE,
  type CatalogFamily,
  type CatalogFactKind,
  type GateStatus,
} from "./mcp-access-grant-catalogs";
import {
  createEvidenceRunContext,
  finalizeEvidence,
  type CompatibilityReport,
  type CompatibilityReportTarget,
  type EvidenceError,
  type EvidenceObservation,
  type EvidenceVerification,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";
import type {
  PublicClientFamily,
  PublicClientJourneyFact,
  PublicClientNegativeRegistrationCase,
  PublicClientNormalizedFact,
  PublicClientSemanticConclusion,
} from "./mcp-access-grant-public-client-semantics";
import {
  PublicClientEvidenceBoundary,
  capturePublicClientJourneyFact,
  evaluatePublicClientFacts,
} from "./mcp-access-grant-public-client-semantics";
export type {
  PublicClientApprovalObservation,
  PublicClientAuthorizationOutcomeObservation,
  PublicClientCleanupObservation,
  PublicClientConsentObservation,
  PublicClientDelegatedTokenObservation,
  PublicClientDiscoveryObservation,
  PublicClientFamily,
  PublicClientGrantObservation,
  PublicClientJourneyFact,
  PublicClientJsonValue,
  PublicClientMcpOperationObservation,
  PublicClientNegativeRegistrationCase,
  PublicClientPkceObservation,
  PublicClientRequestInput,
  PublicClientResponseSurface,
} from "./mcp-access-grant-public-client-semantics";

/**
 * The standalone Candidate 2 public-client operation.
 *
 * This module is deterministic and deliberately does not import either live
 * adapter. The callback receives only a source-bound recorder. The recorder
 * accepts primitive protocol observations and derives all evidence decisions
 * after the callback has settled.
 */

export type PublicClientCredentialPresence = "present" | "absent" | "unknown";

export interface PublicClientConfigurationObservation {
  readonly loopbackHosts?: readonly string[];
  readonly providerCredentialsAvailable?: boolean;
}

export type PublicClientProfileFact =
  | PublicClientJourneyFact
  | {
      readonly kind: "configuration";
      readonly role: "snapshot";
      readonly observation?: PublicClientConfigurationObservation;
    }
  | {
      readonly kind: "versions";
      readonly role: "snapshot";
      readonly values?: Readonly<Record<string, string>>;
    };

export interface PublicClientEvidenceRecorder {
  readonly record: (fact: PublicClientJourneyFact) => Promise<void>;
  readonly recordProfileFact: (fact: PublicClientProfileFact) => Promise<void>;
}

export interface PublicClientArtifact {
  readonly filename: typeof MCP_ACCESS_GRANT_ARTIFACT_NAME;
  readonly contents: string;
}

export type PublicClientArtifactWriter =
  | ((artifact: PublicClientArtifact) => void | Promise<void>)
  | { readonly write: (artifact: PublicClientArtifact) => void | Promise<void> };

export interface PublicClientEvidenceRequestSource {
  readonly snapshot: () => readonly MinimizedRequestObservation[];
}

export interface PublicClientEvidenceOptions {
  readonly target: CompatibilityReportTarget;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets?: readonly string[];
  readonly clock: () => string;
  readonly writer: PublicClientArtifactWriter;
  readonly requestSource?: PublicClientEvidenceRequestSource;
}

export interface PublicClientEvidenceResult {
  readonly report: CompatibilityReport;
  readonly artifact: PublicClientArtifact;
  readonly verification: EvidenceVerification;
  readonly artifactWriteSucceeded: boolean;
}

type NormalizedRequest = PublicClientNormalizedFact["request"];

interface NormalizedFact {
  readonly identity: string;
  readonly kind: PublicClientProfileFact["kind"];
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
const MAX_RETAINED_FACTS = 1_024;
const MAX_UNIQUE_PAYLOADS_PER_IDENTITY = 2;
const CONCLUSION_KEYS = new Set([
  "profile", "source", "gateId", "gate", "status", "outcome", "issue", "template", "templateFamily",
  "evidenceProjection", "detail", "finalize", "finalizeEvidence", "finalizeReport", "artifactFilename",
  "authorized", "rejected", "passed", "failed", "valid", "success", "signatureValid", "algorithmAllowed",
  "identity", "factIdentity", "catalogIdentity", "authority", "semanticRole",
]);
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

function snapshotFactInput(value: unknown): PublicClientProfileFact {
  const snapshot = copyFactInput(value, 0, new WeakSet<object>());
  if (!isRecord(snapshot)) throw new PublicClientEvidenceBoundaryError();
  return snapshot as PublicClientProfileFact;
}

function isPublicClientJourneyFactInput(value: unknown): value is PublicClientJourneyFact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (descriptor === undefined) return true;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) return true;
  const profileFact = descriptor.value === "configuration" || descriptor.value === "versions";
  const prototype = Object.getPrototypeOf(value);
  return !profileFact || (prototype !== Object.prototype && prototype !== null);
}

function toPublicNormalizedFact(value: PublicClientNormalizedFact): NormalizedFact {
  return {
    identity: value.identity,
    kind: value.kind,
    role: value.role,
    ...(value.family === undefined ? {} : { family: value.family }),
    ...(value.caseId === undefined ? {} : { caseId: value.caseId }),
    data: value.data,
    ...(value.request === undefined ? {} : { request: value.request }),
  };
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

function normalizeStringList(value: unknown): string[] | undefined {
  if (!isDenseArray(value, MAX_FACT_ARRAY_ITEMS)) return undefined;
  const values = value.map((item) => boundedString(item));
  return values.every((item): item is string => item !== undefined) ? values : undefined;
}

function normalizeProfileFact(value: PublicClientProfileFact): NormalizedFact {
  if (!isRecord(value)) throw new PublicClientEvidenceBoundaryError();
  assertNoConclusionFields(value);
  if (value.kind !== "configuration" && value.kind !== "versions") throw new PublicClientEvidenceBoundaryError();
  if (value.role !== "snapshot") throw new PublicClientEvidenceBoundaryError();
  const catalogIdentity = classifyFactIdentity({
    profile: "public-client",
    source: "public-client",
    kind: value.kind,
    role: value.role,
    family: "none",
  });
  if (!catalogIdentity.accepted || catalogIdentity.authority !== "authoritative") throw new PublicClientEvidenceBoundaryError();
  if (value.kind === "configuration") {
    const observation = isRecord(value.observation) ? value.observation : {};
    return {
      identity: "configuration|snapshot",
      kind: value.kind,
      role: value.role,
      data: {
        loopbackHosts: normalizeStringList(observation.loopbackHosts),
        providerCredentialsAvailable: boundedBoolean(observation.providerCredentialsAvailable),
      },
    };
  }
  const rawValues = value.values;
  if (rawValues !== undefined && (!isRecord(rawValues) || Object.keys(rawValues).length > MAX_FACT_OBJECT_KEYS || !hasOnlyOwnDataProperties(rawValues))) throw new PublicClientEvidenceBoundaryError();
  const values = Object.fromEntries(Object.entries(rawValues ?? {}).map(([key, child]) => {
    if (!nonEmptyBoundedString(key)) throw new PublicClientEvidenceBoundaryError();
    return [key, boundedString(child) ?? "[REDACTED]"];
  }));
  return { identity: "versions|snapshot", kind: value.kind, role: value.role, data: { values } };
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

function deriveFactGate(
  fact: NormalizedFact,
  target: CompatibilityReportTarget,
): DerivedGate | undefined {
  if (fact.kind === "resource-discovery") {
    const response = fact.data.response as { readonly complete: boolean; readonly status?: number };
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
    const response = fact.data.response as { readonly complete: boolean; readonly status?: number };
    const issuer = fact.data.issuer as string | undefined;
    if (!response.complete || response.status === undefined) return gate("provider-discovery", "not-proven");
    const responseTypesSupported = (fact.data.responseTypesSupported as string[] | undefined) ?? [];
    const grantTypesSupported = (fact.data.grantTypesSupported as string[] | undefined) ?? [];
    const tokenEndpointAuthMethodsSupported = (fact.data.tokenEndpointAuthMethodsSupported as string[] | undefined) ?? [];
    const codeChallengeMethodsSupported = (fact.data.codeChallengeMethodsSupported as string[] | undefined) ?? [];
    const supportsGoldenPath = Boolean(fact.data.registrationEndpoint) &&
      responseTypesSupported.includes("code") &&
      grantTypesSupported.includes("authorization_code") &&
      tokenEndpointAuthMethodsSupported.includes("none") &&
      codeChallengeMethodsSupported.includes("S256");
    return gate("provider-discovery", issuer === target.expectedAuthorizationServer && supportsGoldenPath ? "pass" : "fail", {
      issuerMatches: issuer === target.expectedAuthorizationServer,
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
    return gate("reproducible-configuration", validHosts && targetValid ? "pass" : "not-proven", {
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
  return undefined;
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
  if (!isRecord(options) || !hasOnlyOwnDataKeys(options, ["target", "versions", "configuredSecrets", "clock", "writer", "requestSource"])) throw new PublicClientEvidenceBoundaryError();
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
  if (options.requestSource !== undefined && (!isRecord(options.requestSource) || !hasOnlyOwnDataKeys(options.requestSource, ["snapshot"]) || typeof options.requestSource.snapshot !== "function")) {
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
    ...(options.requestSource === undefined ? {} : { requestSource: { snapshot: options.requestSource.snapshot } }),
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

function toCanonicalPublicFact(fact: NormalizedFact): PublicClientNormalizedFact {
  return {
    identity: fact.identity,
    kind: fact.kind as PublicClientJourneyFact["kind"],
    role: fact.role,
    ...(fact.family === undefined ? {} : { family: fact.family }),
    ...(fact.caseId === undefined ? {} : { caseId: fact.caseId }),
    data: fact.data,
    ...(fact.request === undefined ? {} : { request: fact.request }),
  };
}

function fromSharedPublicConclusion(conclusion: PublicClientSemanticConclusion): DerivedGate {
  return {
    gateId: conclusion.key,
    status: conclusion.status,
    evidence: conclusion.evidence,
    error: conclusion.error,
  };
}

function sharedPublicInternalObservations(
  facts: readonly NormalizedFact[],
  target: CompatibilityReportTarget,
  includeFactRequests: boolean,
  sampledAtMillis: number,
): EvidenceObservation[] {
  const profileGates = new Map<string, DerivedGate>();
  const profilePayloads = new Map<string, string>();
  for (const fact of facts) {
    if (fact.kind !== "configuration" && fact.kind !== "versions" && fact.kind !== "resource-discovery" && fact.kind !== "provider-discovery") continue;
    const derived = deriveFactGate(fact, target);
    if (!derived) continue;
    const payload = factFingerprint(fact);
    const previous = profilePayloads.get(fact.identity);
    if (previous !== undefined && previous !== payload) {
      profileGates.set(derived.gateId, gate(derived.gateId, "fail", { observedBoundary: "conflict" }, { kind: "conflicting-observation" }));
    } else {
      profilePayloads.set(fact.identity, payload);
      profileGates.set(derived.gateId, derived);
    }
  }
  const publicFacts = facts
    .filter((fact) => fact.kind !== "configuration" && fact.kind !== "versions")
    .map(toCanonicalPublicFact);
  const dependencies = Object.fromEntries(
    ["resource-discovery", "provider-discovery"]
      .map((key) => [key === "resource-discovery" ? "resourceDiscovery" : "providerDiscovery", profileGates.get(key)?.status] as const)
      .filter(([, status]) => status !== undefined),
  );
  const evaluation = evaluatePublicClientFacts({
    facts: Object.freeze(publicFacts),
    target,
    sampledAtMillis,
    dependencies,
    includeRequests: includeFactRequests,
  });
  const conclusions = new Map(evaluation.conclusions.map((conclusion) => [conclusion.key, fromSharedPublicConclusion(conclusion)]));
  const normalizedGate = (derived: DerivedGate): EvidenceObservation => ({
    kind: "gate",
    gateId: derived.gateId,
    ...(derived.status !== undefined ? { status: derived.status } : {}),
    ...(derived.status !== undefined ? { detail: templateText(derived.gateId, derived.status) } : {}),
    ...(derived.evidence !== undefined ? { evidence: omitUndefined(derived.evidence) } : {}),
    error: derived.error,
  });
  const observations: EvidenceObservation[] = [];
  for (const gateId of ["resource-discovery", "provider-discovery", "reproducible-configuration", "versions"]) {
    const profileGate = profileGates.get(gateId);
    const sharedConclusion = conclusions.get(gateId);
    const derived = profileGate && sharedConclusion
      ? { ...profileGate, status: sharedConclusion.status, error: sharedConclusion.error ?? profileGate.error }
      : profileGate ?? sharedConclusion;
    if (derived) observations.push(normalizedGate(derived));
  }
  for (const base of FAMILY_GATE_BASES) {
    for (const family of ["ipv4", "ipv6"] as const) {
      const derived = conclusions.get(`${base}-${family}`);
      if (derived) observations.push(normalizedGate(derived));
    }
    const aggregate = conclusions.get(`${base}-both`);
    if (aggregate) observations.push(normalizedGate(aggregate));
  }
  if (includeFactRequests) {
    observations.push(...evaluation.requests.map((request) => ({ kind: "request" as const, request })));
  }
  return observations;
}

function finalizeRun(
  facts: readonly NormalizedFact[],
  options: PublicClientEvidenceOptions,
  startedAt: string,
  finishedAt: string,
  sampledAtMillis: number,
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
  const requestSource = options.requestSource;
  const observations = sharedPublicInternalObservations(facts, options.target, requestSource === undefined, sampledAtMillis);
  if (requestSource !== undefined) {
    observations.push(...requestSource.snapshot().map((request) => ({ kind: "request" as const, request })));
  }
  return finalizeEvidence({
    issue: PUBLIC_CLIENT_PROFILE.issue,
    target: options.target,
    requiredGateIds: PUBLIC_CLIENT_PROFILE.expandedGateIds,
    observations,
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
  journey: (recorder: PublicClientEvidenceRecorder) => void | Promise<void>,
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
  const publicBoundary = new PublicClientEvidenceBoundary();
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

  const recordProfileFact = (fact: PublicClientProfileFact): Promise<void> => {
    if (closed) {
      const failure = Promise.reject(stableFailure());
      void failure.catch(() => undefined);
      return failure;
    }
    let capturedFact: PublicClientProfileFact;
    try {
      capturedFact = isPublicClientJourneyFactInput(fact)
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
        capturedFact = undefined as never;
        const clock = factNeedsClockSample(currentFact)
          ? sampleIso(options.clock, lastClock)
          : { value: "", millis: lastClock };
        lastClock = clock.millis;
        if (isPublicClientJourneyFactInput(currentFact)) {
          if (facts.length >= MAX_RETAINED_FACTS) throw new PublicClientEvidenceBoundaryError();
          const admission = await publicBoundary.acceptSnapshot(currentFact, clock.millis);
          if (admission.disposition === "accepted") facts.push(toPublicNormalizedFact(admission.fact));
          return;
        }
        const normalized = normalizeProfileFact(currentFact);
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

  const recorder: PublicClientEvidenceRecorder = Object.freeze({
    record: (fact: PublicClientJourneyFact) => recordProfileFact(fact),
    recordProfileFact,
  });
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
    finalized = finalizeRun(facts, options, start.value, finish.value, lastClock, true);
    failure = finalizeRun(facts, options, start.value, finish.value, lastClock, false);
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
