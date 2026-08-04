import crypto from "node:crypto";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export const ALLOWED_DELEGATED_JWT_ALGORITHMS = ["RS256", "ES256"] as const;

export type DelegatedJwtAlgorithm =
  (typeof ALLOWED_DELEGATED_JWT_ALGORITHMS)[number];

export type DelegatedJwtFailure =
  | "unexpected-algorithm"
  | "missing-key-id"
  | "unknown-key"
  | "key-algorithm-mismatch"
  | "key-not-for-signing"
  | "issuer-mismatch"
  | "missing-subject"
  | "audience-mismatch"
  | "invalid-expiry"
  | "invalid-issued-at"
  | "invalid-not-before"
  | "client-context-mismatch"
  | "grant-context-mismatch"
  | "resource-context-mismatch";

export interface DelegatedJwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

export interface DelegatedJwtClaims {
  [claim: string]: unknown;
}

export interface DelegatedJwk {
  [property: string]: unknown;
  alg?: unknown;
  kid?: unknown;
  key_ops?: unknown;
  kty?: unknown;
  use?: unknown;
}

export interface DelegatedTokenRequestContext {
  clientId?: string;
  grantType?: string;
  resource?: string;
}

export interface DelegatedJwtPolicy {
  canonicalResource: string;
  expectedClientId: string;
  expectedIssuer: string;
  nowSeconds: number;
  tokenRequest: DelegatedTokenRequestContext;
  clockSkewSeconds?: number;
}

export interface DelegatedJwtChecks {
  algorithmAllowed: boolean;
  keyIdPresent: boolean;
  issuerMatches: boolean;
  subjectPresent: boolean;
  audienceMatches: boolean;
  timeBoundsValid: boolean;
  clientContextMatches: boolean;
  grantContextMatches: boolean;
  resourceContextMatches: boolean;
}

export interface DelegatedJwtPolicyResult {
  valid: boolean;
  failures: DelegatedJwtFailure[];
  checks: DelegatedJwtChecks;
}

export function isAllowedDelegatedJwtAlgorithm(
  algorithm: unknown,
): algorithm is DelegatedJwtAlgorithm {
  return (
    typeof algorithm === "string" &&
    (ALLOWED_DELEGATED_JWT_ALGORITHMS as readonly string[]).includes(algorithm)
  );
}

export function s256CodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function matchesS256CodeChallenge(
  verifier: string | undefined,
  challenge: string | undefined,
  method: string | undefined,
): boolean {
  return Boolean(
    verifier &&
      challenge &&
      method === "S256" &&
      s256CodeChallenge(verifier) === challenge,
  );
}

export function isExactCanonicalResource(
  canonicalResource: string,
  candidate: string | undefined,
): boolean {
  return Boolean(candidate) && candidate === canonicalResource;
}

export function selectDelegatedSigningJwk(
  header: DelegatedJwtHeader,
  keys: readonly DelegatedJwk[],
):
  | { ok: true; key: DelegatedJwk }
  | { ok: false; reason: DelegatedJwtFailure } {
  if (!isAllowedDelegatedJwtAlgorithm(header.alg)) {
    return { ok: false, reason: "unexpected-algorithm" };
  }

  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return { ok: false, reason: "missing-key-id" };
  }

  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    return { ok: false, reason: "unknown-key" };
  }

  if (key.alg !== header.alg) {
    return { ok: false, reason: "key-algorithm-mismatch" };
  }

  if (key.use !== undefined && key.use !== "sig") {
    return { ok: false, reason: "key-not-for-signing" };
  }

  if (
    key.key_ops !== undefined &&
    (!Array.isArray(key.key_ops) || !key.key_ops.includes("verify"))
  ) {
    return { ok: false, reason: "key-not-for-signing" };
  }

  const expectedKeyType = header.alg === "RS256" ? "RSA" : "EC";
  if (key.kty !== expectedKeyType) {
    return { ok: false, reason: "key-algorithm-mismatch" };
  }

  if (header.alg === "ES256" && key.crv !== "P-256") {
    return { ok: false, reason: "key-algorithm-mismatch" };
  }

  return { ok: true, key };
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function evaluateDelegatedJwtPolicy(
  header: DelegatedJwtHeader,
  claims: DelegatedJwtClaims,
  policy: DelegatedJwtPolicy,
): DelegatedJwtPolicyResult {
  const clockSkewSeconds = policy.clockSkewSeconds ?? 30;
  const algorithmAllowed = isAllowedDelegatedJwtAlgorithm(header.alg);
  const keyIdPresent = nonEmptyString(header.kid);
  const issuerMatches = claims.iss === policy.expectedIssuer;
  const subjectPresent = nonEmptyString(claims.sub);
  const audienceMatches =
    typeof claims.aud === "string" &&
    isExactCanonicalResource(policy.canonicalResource, claims.aud);
  const timeBoundsValid =
    isInteger(claims.exp) &&
    claims.exp > policy.nowSeconds &&
    isInteger(claims.iat) &&
    claims.iat <= policy.nowSeconds + clockSkewSeconds &&
    claims.exp > claims.iat &&
    (claims.nbf === undefined ||
      (isInteger(claims.nbf) &&
        claims.nbf <= policy.nowSeconds + clockSkewSeconds));
  const clientContextMatches =
    claims.client_id === policy.expectedClientId &&
    (claims.azp === undefined || claims.azp === policy.expectedClientId);
  const grantContextMatches =
    policy.tokenRequest.grantType === "authorization_code" &&
    policy.tokenRequest.clientId === policy.expectedClientId;
  const resourceContextMatches =
    isExactCanonicalResource(
      policy.canonicalResource,
      policy.tokenRequest.resource,
    ) &&
    (claims.resource === undefined ||
      (nonEmptyString(claims.resource) &&
        isExactCanonicalResource(policy.canonicalResource, claims.resource)));

  const failures: DelegatedJwtFailure[] = [];
  if (!algorithmAllowed) failures.push("unexpected-algorithm");
  if (!keyIdPresent) failures.push("missing-key-id");
  if (!issuerMatches) failures.push("issuer-mismatch");
  if (!subjectPresent) failures.push("missing-subject");
  if (!audienceMatches) failures.push("audience-mismatch");
  if (!timeBoundsValid) {
    if (!isInteger(claims.exp) || claims.exp <= policy.nowSeconds || claims.exp <= (isInteger(claims.iat) ? claims.iat : 0)) {
      failures.push("invalid-expiry");
    }
    if (!isInteger(claims.iat) || claims.iat > policy.nowSeconds + clockSkewSeconds) {
      failures.push("invalid-issued-at");
    }
    if (
      claims.nbf !== undefined &&
      (!isInteger(claims.nbf) || claims.nbf > policy.nowSeconds + clockSkewSeconds)
    ) {
      failures.push("invalid-not-before");
    }
  }
  if (!clientContextMatches) failures.push("client-context-mismatch");
  if (!grantContextMatches) failures.push("grant-context-mismatch");
  if (!resourceContextMatches) failures.push("resource-context-mismatch");

  return {
    valid: failures.length === 0,
    failures,
    checks: {
      algorithmAllowed,
      keyIdPresent,
      issuerMatches,
      subjectPresent,
      audienceMatches,
      timeBoundsValid,
      clientContextMatches,
      grantContextMatches,
      resourceContextMatches,
    },
  };
}

export function publicBoundaryRejects(
  status: number | undefined,
  responseContainsCredentials: boolean,
): boolean {
  return (status === 401 || status === 403) && !responseContainsCredentials;
}

export type LoopbackHost = "127.0.0.1" | "::1";

export const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const satisfies readonly LoopbackHost[];

export const DEFAULT_LOOPBACK_CALLBACK_PATH = "/oauth/callback";

export interface LoopbackUrls {
  registrationUrl: string;
  callbackUrl: string;
}

export function buildLoopbackUrls(
  host: LoopbackHost,
  port: number,
  callbackPath = DEFAULT_LOOPBACK_CALLBACK_PATH,
): LoopbackUrls {
  const normalizedPath = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
  const hostname = host === "::1" ? `[${host}]` : host;
  return {
    registrationUrl: `http://${hostname}${normalizedPath}`,
    callbackUrl: `http://${hostname}:${port}${normalizedPath}`,
  };
}

export function isSupportedLoopbackRegistrationRedirect(
  value: string,
  expectedHost: LoopbackHost,
  callbackPath = DEFAULT_LOOPBACK_CALLBACK_PATH,
): boolean {
  try {
    const url = new URL(value);
    const actualHost = url.hostname.replace(/^\[|\]$/g, "");
    const expectedAuthority = expectedHost === "::1" ? `[${expectedHost}]` : expectedHost;
    const actualAuthority = /^http:\/\/([^/?#]+)/i.exec(value)?.[1];
    const normalizedPath = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
    return url.protocol === "http:" &&
      actualHost === expectedHost &&
      actualAuthority === expectedAuthority &&
      url.port === "" &&
      url.pathname === normalizedPath &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

export interface PublicNativeClientMetadataInput {
  registrationRedirectUri: string;
  clientName: string;
  clientUri: string;
  logoUri: string;
  softwareId: string;
  softwareVersion: string;
}

export function buildPublicNativeClientMetadata({
  registrationRedirectUri,
  clientName,
  clientUri,
  logoUri,
  softwareId,
  softwareVersion,
}: PublicNativeClientMetadataInput): OAuthClientMetadata {
  return {
    client_name: clientName,
    client_uri: clientUri,
    logo_uri: logoUri,
    redirect_uris: [registrationRedirectUri],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    software_id: softwareId,
    software_version: softwareVersion,
  };
}

export interface PublicClientProfileValidation {
  accepted: boolean;
  clientIdPresent: boolean;
  clientSecretReturned: boolean;
  supportedRedirects: boolean;
  supportedGrantTypes: boolean;
  supportedResponseTypes: boolean;
  publicTokenAuthentication: boolean;
}

export function validatePublicClientProfile(
  clientInformation: OAuthClientInformationMixed | Record<string, unknown> | undefined,
  expectedHost: LoopbackHost,
  callbackPath = DEFAULT_LOOPBACK_CALLBACK_PATH,
): PublicClientProfileValidation {
  const info = clientInformation as Record<string, unknown> | undefined;
  const redirectUris = Array.isArray(info?.redirect_uris)
    ? info.redirect_uris.filter((value): value is string => typeof value === "string")
    : [];
  const grantTypes = Array.isArray(info?.grant_types)
    ? info.grant_types.filter((value): value is string => typeof value === "string")
    : [];
  const responseTypes = Array.isArray(info?.response_types)
    ? info.response_types.filter((value): value is string => typeof value === "string")
    : [];
  const clientIdPresent = typeof info?.client_id === "string" && info.client_id.length > 0;
  const clientSecretReturned = Boolean(info && "client_secret" in info && info.client_secret !== undefined);
  const supportedRedirects = redirectUris.length > 0 && redirectUris.every((uri) =>
    isSupportedLoopbackRegistrationRedirect(uri, expectedHost, callbackPath),
  );
  const supportedGrantTypes = grantTypes.length === 1 && grantTypes[0] === "authorization_code";
  const supportedResponseTypes = responseTypes.length === 1 && responseTypes[0] === "code";
  const publicTokenAuthentication = info?.token_endpoint_auth_method === "none";

  return {
    accepted: clientIdPresent && !clientSecretReturned && supportedRedirects && supportedGrantTypes &&
      supportedResponseTypes && publicTokenAuthentication,
    clientIdPresent,
    clientSecretReturned,
    supportedRedirects,
    supportedGrantTypes,
    supportedResponseTypes,
    publicTokenAuthentication,
  };
}

export interface RegistrationNegativeCase {
  id: string;
  metadata: Record<string, unknown>;
}

export function buildRegistrationNegativeCases(
  metadata: OAuthClientMetadata,
): RegistrationNegativeCase[] {
  return [
    { id: "unsupported-client-auth-method", metadata: { ...metadata, token_endpoint_auth_method: "client_secret_post" } },
    { id: "unsupported-grant-type", metadata: { ...metadata, grant_types: ["client_credentials"] } },
    { id: "unsupported-response-type", metadata: { ...metadata, response_types: ["token"] } },
    { id: "malformed-metadata", metadata: { ...metadata, redirect_uris: ["not-a-loopback-uri"] } },
    { id: "unsafe-redirect-metadata", metadata: { ...metadata, redirect_uris: ["https://untrusted-client.example.test/callback"] } },
  ];
}

export function grantClientId(grant: unknown): string | undefined {
  if (!grant || typeof grant !== "object") return undefined;

  const record = grant as Record<string, unknown>;
  if (typeof record.client_id === "string") return record.client_id;

  if (record.client && typeof record.client === "object") {
    const client = record.client as Record<string, unknown>;
    return typeof client.id === "string"
      ? client.id
      : typeof client.client_id === "string"
        ? client.client_id
        : undefined;
  }

  return undefined;
}
