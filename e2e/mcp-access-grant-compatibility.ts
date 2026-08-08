import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { Page, TestInfo } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  discoverOAuthServerInfo,
  refreshAuthorization,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";

import {
  EVIDENCE_ARTIFACT_FILENAME,
  GateAccumulator,
  createEvidenceRunContext,
  finalizeEvidence,
  minimizeResponseBody,
  sanitizeText,
  sanitizeUrl,
  type CompatibilityReport,
  type DelegatedJwtObservation,
  type EvidenceObservation,
  type GateObservation,
  type MinimizedRequestObservation,
  type GateStatus as EvidenceGateStatus,
} from "./mcp-access-grant-evidence";
import {
  evaluateDelegatedJwtPolicy,
  isExactCanonicalResource,
  LOOPBACK_HOSTS,
  publicBoundaryRejects,
  s256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
  type DelegatedJwtPolicy,
  type LoopbackHost,
} from "./mcp-access-grant-policy";
import {
  runPublicClientLoopbackConsentCompatibility,
} from "./mcp-access-grant-public-client";

export type { CompatibilityGate, CompatibilityReport } from "./mcp-access-grant-evidence";
export type GateStatus = EvidenceGateStatus;

export const MCP_ACCESS_GRANT_AGGREGATE_ISSUE = "#768" as const;

export interface McpAccessGrantTarget {
  name: string;
  canonicalResource: string;
  supabaseUrl: string;
  expectedAuthorizationServer: string;
  loopbackHosts: LoopbackHost[];
  anonKey?: string;
  email?: string;
  password?: string;
}

type RequestEvidence = {
  -readonly [Key in keyof MinimizedRequestObservation]: MinimizedRequestObservation[Key]
};

interface CallbackResult {
  code?: string;
  state?: string;
  error?: string;
}

interface TargetConfig {
  name?: unknown;
  canonicalResource?: unknown;
  supabaseUrl?: unknown;
  expectedAuthorizationServer?: unknown;
  anonKeyEnv?: unknown;
  loopbackHosts?: unknown;
  emailEnv?: unknown;
  passwordEnv?: unknown;
}

export const REQUIRED_GATE_IDS = [
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
] as const;

function addGate(
  gates: GateAccumulator,
  id: string,
  status: GateStatus,
  detail: unknown,
  evidence?: unknown,
  error?: GateObservation["error"],
): void {
  gates.replace({ kind: "gate", gateId: id, status, detail, evidence, error });
}

function addPkceGate(
  observations: EvidenceObservation[],
  detail: unknown,
  evidence: unknown,
  verifierMatchesChallenge: boolean | undefined,
  method: string | undefined,
): void {
  observations.push({
    kind: "pkce",
    gateId: "loopback-pkce",
    detail,
    evidence,
    verifierMatchesChallenge,
    method,
  });
}

function bodyText(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined;
}

function requestBodyMetadata(body: BodyInit | null | undefined): {
  fields: string[];
  parameters?: URLSearchParams;
} {
  const text = bodyText(body);
  if (text === undefined) {
    return { fields: body ? ["[non-text body]"] : [] };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { fields: Object.keys(parsed).sort() };
    }
  } catch {
    // OAuth requests are form encoded and are handled below.
  }

  try {
    const parameters = new URLSearchParams(text);
    return { fields: [...parameters.keys()].sort(), parameters };
  } catch {
    return { fields: ["[unparsed body]"] };
  }
}

function responseCredentialFields(
  text: string,
  contentType: string | null,
  location: string | null,
): string[] {
  const fields = new Set<string>();
  const credentialKeys = new Set([
    "access_token",
    "refresh_token",
    "id_token",
    "client_secret",
    "code",
    "code_verifier",
  ]);

  if (location) {
    try {
      const locationUrl = new URL(location);
      for (const key of credentialKeys) {
        if (locationUrl.searchParams.get(key)) fields.add(key);
      }
    } catch {
      // The sanitized location is still retained as non-credential evidence.
    }
  }

  if (contentType?.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of credentialKeys) {
          const value = (parsed as Record<string, unknown>)[key];
          if (typeof value === "string" && value.length > 0) fields.add(key);
        }
      }
    } catch {
      // Response summarization handles malformed JSON separately.
    }
  }

  return [...fields].sort();
}

type EvidenceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function requestInputUrl(input: RequestInfo | URL): string | URL {
  if (typeof input === "string" || input instanceof URL) {
    return input;
  }

  return input.url;
}

function createEvidenceFetch(requests: RequestEvidence[]): EvidenceFetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestObject = typeof Request !== "undefined" && input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? requestObject?.headers);
    const bodyMetadata = requestBodyMetadata(init?.body);
    const parameters = bodyMetadata.parameters;
    const codeVerifier = parameters?.get("code_verifier");
    const request: RequestEvidence = {
      method: init?.method ?? requestObject?.method ?? "GET",
      url: sanitizeUrl(requestInputUrl(input)),
      requestBodyFields: bodyMetadata.fields,
      authorizationHeaderPresent: headers.has("authorization"),
      ...(parameters?.has("client_id") && { requestClientIdPresent: true }),
      ...(parameters?.get("client_id") && { requestClientId: sanitizeText(parameters.get("client_id") as string) }),
      ...(parameters?.has("code") && { requestCodePresent: true }),
      ...(parameters?.has("code_challenge") && { requestCodeChallengePresent: true }),
      ...(parameters?.has("code_verifier") && { requestCodeVerifierPresent: true }),
      ...(parameters?.get("code_challenge_method") && {
        requestCodeChallengeMethod: parameters.get("code_challenge_method") ?? undefined,
      }),
      ...(parameters?.get("grant_type") && {
        requestGrantType: parameters.get("grant_type") ?? undefined,
      }),
      ...(parameters?.get("redirect_uri") && {
        requestRedirectUri: sanitizeUrl(parameters.get("redirect_uri") as string),
      }),
      ...(parameters?.get("resource") && {
        requestResource: sanitizeUrl(parameters.get("resource") as string),
      }),
      ...(codeVerifier && { requestCodeVerifierHash: s256CodeChallenge(codeVerifier) }),
    };
    requests.push(request);

    try {
      const response = await fetch(input, init);
      request.status = response.status;
      const location = response.headers.get("location");
      if (location) {
        request.responseLocation = sanitizeUrl(location);
      }

      try {
        const contentType = response.headers.get("content-type");
        const responseText = contentType?.includes("text/event-stream")
          ? ""
          : await response.clone().text();
        request.responseCredentialFields = responseCredentialFields(
          responseText,
          contentType,
          location,
        );
        request.responseContainsCredentials = request.responseCredentialFields.length > 0;
        request.responseBody = contentType?.includes("text/event-stream")
          ? { contentType, body: "[STREAM BODY NOT RECORDED]" }
          : minimizeResponseBody(responseText, contentType);
      } catch {
        request.responseBody = { body: "[UNAVAILABLE RESPONSE BODY]" };
      }

      return response;
    } catch (error) {
      request.networkError = sanitizeText(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}

function errorDetail(error: unknown): string {
  return sanitizeText(error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function isLocalHostname(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

interface TargetConfigurationEvaluation {
  configured: boolean;
  nonProduction: boolean;
}

function evaluateMcpAccessGrantTargetConfiguration(
  target: Pick<McpAccessGrantTarget, "canonicalResource" | "supabaseUrl" | "expectedAuthorizationServer">,
): TargetConfigurationEvaluation {
  const configured = (() => {
    try {
      new URL(target.canonicalResource);
      new URL(target.supabaseUrl);
      new URL(target.expectedAuthorizationServer);
      return true;
    } catch {
      return false;
    }
  })();
  const nonProduction = isLocalHostname(target.canonicalResource) && isLocalHostname(target.supabaseUrl) ||
    process.env.MCP_ACCESS_GRANT_NON_PRODUCTION_ACK === "true";

  return { configured, nonProduction };
}

function deriveAuthorizationServer(supabaseUrl: string): string {
  try {
    const url = new URL(supabaseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/auth/v1`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parseTarget(raw: TargetConfig, index: number): McpAccessGrantTarget {
  const supabaseUrl = typeof raw.supabaseUrl === "string" ? raw.supabaseUrl : "";
  const anonKeyEnv = typeof raw.anonKeyEnv === "string" ? raw.anonKeyEnv : "MCP_SUPABASE_ANON_KEY";
  const emailEnv = typeof raw.emailEnv === "string" ? raw.emailEnv : "MCP_TEST_EMAIL";
  const passwordEnv = typeof raw.passwordEnv === "string" ? raw.passwordEnv : "MCP_TEST_PASSWORD";
  const configuredLoopbackHosts = Array.isArray(raw.loopbackHosts)
    ? raw.loopbackHosts
    : typeof raw.loopbackHosts === "string"
      ? raw.loopbackHosts.split(",")
      : [...LOOPBACK_HOSTS];
  const loopbackHosts = [...new Set(configuredLoopbackHosts.filter(
    (host): host is LoopbackHost => LOOPBACK_HOSTS.includes(host as LoopbackHost),
  ))];

  return {
    name: typeof raw.name === "string" ? raw.name : `target-${index + 1}`,
    canonicalResource: typeof raw.canonicalResource === "string" ? raw.canonicalResource : "",
    supabaseUrl,
    expectedAuthorizationServer:
      typeof raw.expectedAuthorizationServer === "string" && raw.expectedAuthorizationServer.length > 0
        ? raw.expectedAuthorizationServer
        : deriveAuthorizationServer(supabaseUrl),
    loopbackHosts,
    anonKey: process.env[anonKeyEnv] ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    email: process.env[emailEnv],
    password: process.env[passwordEnv],
  };
}

export function loadMcpAccessGrantTargets(): McpAccessGrantTarget[] {
  const rawTargets = process.env.MCP_ACCESS_GRANT_TARGETS;

  if (rawTargets) {
    try {
      const parsed: unknown = JSON.parse(rawTargets);
      if (Array.isArray(parsed)) {
        return parsed.map((target, index) =>
          parseTarget(target && typeof target === "object" ? (target as TargetConfig) : {}, index),
        );
      }
    } catch {
      return [parseTarget({}, 0)];
    }
  }

  return [
    parseTarget(
      {
        name: process.env.MCP_ACCESS_GRANT_TARGET_NAME ?? "configured-target",
        canonicalResource: process.env.MCP_ACCESS_GRANT_CANONICAL_RESOURCE,
        supabaseUrl: process.env.MCP_SUPABASE_URL,
        expectedAuthorizationServer: process.env.MCP_SUPABASE_AUTH_ISSUER,
        loopbackHosts: process.env.MCP_ACCESS_GRANT_LOOPBACK_HOSTS,
      },
      0,
    ),
  ];
}

class LoopbackCallback {
  private readonly server = createServer((request, response) => this.handleRequest(request, response));
  private readonly resultPromise: Promise<CallbackResult>;
  private resolveResult!: (result: CallbackResult) => void;
  private port = 0;

  constructor() {
    this.resultPromise = new Promise<CallbackResult>((resolve) => {
      this.resolveResult = resolve;
    });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve();
      });
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/oauth/callback`;
  }

  async wait(timeoutMs = 60_000): Promise<CallbackResult> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.resultPromise,
        new Promise<CallbackResult>((resolve) => {
          timeout = setTimeout(() => resolve({ error: "loopback callback timed out" }), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async close(): Promise<void> {
    if (!this.server.listening) {
      return;
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state") ?? undefined;

    if (error) {
      this.resolveResult({ error: sanitizeText(error), state });
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Authorization was not completed.");
      return;
    }

    if (code) {
      this.resolveResult({ code, state });
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Authorization callback received. You may close this tab.");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found.");
  }
}

async function closeAuthorizationAttempt(
  transport: StreamableHTTPClientTransport,
  client: Client,
  loopback: LoopbackCallback,
): Promise<void> {
  await transport.close().catch(() => undefined);
  await client.close().catch(() => undefined);
  await loopback.close();
}

class CompatibilityOAuthProvider implements OAuthClientProvider {
  private clientInfo?: OAuthClientInformationMixed;
  private tokenInfo?: OAuthTokens;
  private verifier?: string;
  private authorizationUrl?: URL;
  private discovery?: OAuthDiscoveryState;

  constructor(
    private readonly callbackUrl: string | undefined,
    private readonly sdkVersion: string,
    private readonly canonicalResource: string,
  ) {}

  get redirectUrl(): string | undefined {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "BetterR.Me MCP Access Grant Compatibility Client",
      redirect_uris: this.callbackUrl ? [this.callbackUrl] : [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      software_id: "betterr-me-mcp-access-grant-compatibility",
      software_version: this.sdkVersion,
    };
  }

  state(): string {
    return randomUUID();
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInfo;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.clientInfo = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.tokenInfo;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.tokenInfo = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) {
      throw new Error("OAuth SDK did not save a PKCE code verifier");
    }
    return this.verifier;
  }

  async validateResourceURL(
    _serverUrl: string | URL,
    resource?: string,
  ): Promise<URL> {
    if (!isExactCanonicalResource(this.canonicalResource, resource)) {
      throw new Error("OAuth resource must equal the configured Canonical MCP Resource");
    }
    return new URL(this.canonicalResource);
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.discovery;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.discovery = state;
  }

  get authorizationRequestUrl(): URL | undefined {
    return this.authorizationUrl;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const contents = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function packageVersion(packageJson: Record<string, unknown>): string {
  return typeof packageJson.version === "string" ? packageJson.version : "unavailable";
}

function commandVersion(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "unavailable";
  } catch {
    return "unavailable";
  }
}

async function collectVersions(target: McpAccessGrantTarget): Promise<Record<string, string>> {
  const root = process.cwd();
  const packageJson = await readJsonFile(path.join(root, "package.json"));
  const dependencyNames = [
    "@modelcontextprotocol/sdk",
    "@playwright/test",
    "@supabase/supabase-js",
    "mcp-handler",
  ];
  const versions: Record<string, string> = {
    "supabase-cli": commandVersion("supabase", ["--version"]),
  };

  for (const dependency of dependencyNames) {
    const installed = await readJsonFile(path.join(root, "node_modules", dependency, "package.json"));
    versions[dependency] = packageVersion(installed);
  }

  if (isLocalHostname(target.supabaseUrl)) {
    const dockerImages = commandVersion("docker", ["ps", "--format", "{{.Names}}|{{.Image}}"]).split(/\r?\n/);
    const authImage = dockerImages
      .find((line) => line.startsWith("supabase_auth_"))
      ?.split("|")[1];
    versions["supabase-auth-provider-image"] = authImage ?? "unavailable";
    versions["supabase-hosted-provider-version"] = "not-applicable";
  } else {
    versions["supabase-auth-provider-image"] = "not-applicable";
    versions["supabase-hosted-provider-version"] = "not-publicly-exposed";
  }

  const declaredSdk = (packageJson.devDependencies as Record<string, unknown> | undefined)?.["@modelcontextprotocol/sdk"];
  versions["declared-sdk-range"] = typeof declaredSdk === "string" ? declaredSdk : "unavailable";
  return versions;
}

function metadataEndpoints(metadata: AuthorizationServerMetadata | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  return {
    issuer: sanitizeUrl(metadata.issuer),
    authorizationEndpoint: sanitizeUrl(metadata.authorization_endpoint),
    tokenEndpoint: sanitizeUrl(metadata.token_endpoint),
    registrationEndpoint: metadata.registration_endpoint ? sanitizeUrl(metadata.registration_endpoint) : "unavailable",
    responseTypesSupported: metadata.response_types_supported,
    grantTypesSupported: metadata.grant_types_supported,
    tokenEndpointAuthMethodsSupported: metadata.token_endpoint_auth_methods_supported,
    codeChallengeMethodsSupported: metadata.code_challenge_methods_supported,
  };
}

function metadataSupportsGoldenPath(metadata: AuthorizationServerMetadata): boolean {
  return Boolean(
    metadata.registration_endpoint &&
      metadata.response_types_supported?.includes("code") &&
      metadata.grant_types_supported?.includes("authorization_code") &&
      metadata.token_endpoint_auth_methods_supported?.includes("none") &&
      metadata.code_challenge_methods_supported?.includes("S256"),
  );
}

function providerFeatureDisabled(requests: RequestEvidence[], providerUrl: string): string | undefined {
  const providerRequests = requests.filter((request) => request.url.startsWith(providerUrl));
  const disabled = providerRequests.find(
    (request) => request.responseBody?.error_code === "feature_disabled",
  );
  if (!disabled) {
    return undefined;
  }

  const status = disabled.status ?? "unknown status";
  const message = typeof disabled.responseBody?.msg === "string" ? disabled.responseBody.msg : "OAuth server feature disabled";
  return `Supabase OAuth provider returned HTTP ${status} with error_code=feature_disabled: ${sanitizeText(message)}`;
}

interface RefreshAttempt {
  tokens?: OAuthTokens;
  request?: RequestEvidence;
  error?: unknown;
}

interface McpOperationResult {
  status: "authorized" | "rejected" | "not-proven";
  detail: string;
  evidence?: Record<string, unknown>;
}

function lastRequestForEndpoint(
  requests: RequestEvidence[],
  startIndex: number,
  endpoint: string | undefined,
): RequestEvidence | undefined {
  if (!endpoint) {
    return undefined;
  }

  const sanitizedEndpoint = sanitizeUrl(endpoint);
  for (let index = requests.length - 1; index >= startIndex; index -= 1) {
    const request = requests[index];
    if (request.method === "POST" && request.url === sanitizedEndpoint) {
      return request;
    }
  }

  return undefined;
}

function responseHasField(request: RequestEvidence | undefined, field: string): boolean {
  return Boolean(request?.responseBody && Object.prototype.hasOwnProperty.call(request.responseBody, field));
}

function responseField(request: RequestEvidence | undefined, field: string): unknown {
  return request?.responseBody?.[field];
}

function tokenSummary(tokens: OAuthTokens | undefined): Record<string, unknown> {
  if (!tokens) {
    return {
      accessTokenPresent: false,
      refreshTokenPresent: false,
      tokenType: "missing",
      expiresIn: "missing",
      scope: "missing",
    };
  }

  return {
    accessTokenPresent: Boolean(tokens.access_token),
    refreshTokenPresent: Boolean(tokens.refresh_token),
    tokenType: tokens.token_type ?? "missing",
    expiresIn: tokens.expires_in ?? "missing",
    scope: tokens.scope ?? "missing",
  };
}

function tokenReplacementEvidence(
  previous: OAuthTokens,
  attempt: RefreshAttempt,
): Record<string, unknown> {
  const next = attempt.tokens;
  return {
    previous: tokenSummary(previous),
    replacement: tokenSummary(next),
    providerReturnedAccessToken: responseHasField(attempt.request, "access_token"),
    providerReturnedRefreshToken: responseHasField(attempt.request, "refresh_token"),
    accessTokenChanged: Boolean(next?.access_token && next.access_token !== previous.access_token),
    refreshTokenChanged: Boolean(next?.refresh_token && next.refresh_token !== previous.refresh_token),
    tokenEndpointStatus: attempt.request?.status ?? "not-observed",
    requestBodyFields: attempt.request?.requestBodyFields ?? [],
    authorizationHeaderPresent: attempt.request?.authorizationHeaderPresent ?? false,
  };
}

function refreshAttemptEvidence(attempt: RefreshAttempt): Record<string, unknown> {
  return {
    succeeded: Boolean(attempt.tokens),
    tokenSummary: tokenSummary(attempt.tokens),
    tokenEndpointStatus: attempt.request?.status ?? "not-observed",
    providerReturnedAccessToken: responseHasField(attempt.request, "access_token"),
    providerReturnedRefreshToken: responseHasField(attempt.request, "refresh_token"),
    error: responseField(attempt.request, "error") ?? "none",
    errorCode: responseField(attempt.request, "error_code") ?? "none",
    errorDescription: responseField(attempt.request, "error_description") ?? responseField(attempt.request, "msg") ?? "none",
    requestBodyFields: attempt.request?.requestBodyFields ?? [],
    authorizationHeaderPresent: attempt.request?.authorizationHeaderPresent ?? false,
    errorDetail: attempt.error ? errorDetail(attempt.error) : "none",
  };
}

async function refreshWithOfficialClient(options: {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  clientInformation: OAuthClientInformationMixed;
  refreshToken: string;
  resource: URL;
  addClientAuthentication?: OAuthClientProvider["addClientAuthentication"];
  fetchFn: EvidenceFetch;
  requests: RequestEvidence[];
}): Promise<RefreshAttempt> {
  const startIndex = options.requests.length;
  try {
    const tokens = await refreshAuthorization(options.authorizationServerUrl, {
      metadata: options.metadata,
      clientInformation: options.clientInformation,
      refreshToken: options.refreshToken,
      resource: options.resource,
      addClientAuthentication: options.addClientAuthentication,
      fetchFn: options.fetchFn,
    });

    return {
      tokens,
      request: lastRequestForEndpoint(options.requests, startIndex, options.metadata.token_endpoint),
    };
  } catch (error) {
    return {
      error,
      request: lastRequestForEndpoint(options.requests, startIndex, options.metadata.token_endpoint),
    };
  }
}

function grantClientId(grant: unknown): string | undefined {
  if (!grant || typeof grant !== "object") {
    return undefined;
  }

  const record = grant as Record<string, unknown>;
  if (typeof record.client_id === "string") {
    return record.client_id;
  }

  if (record.client && typeof record.client === "object") {
    const client = record.client as Record<string, unknown>;
    return typeof client.client_id === "string" ? client.client_id : undefined;
  }

  return undefined;
}

function grantSummary(grant: unknown): Record<string, unknown> {
  if (!grant || typeof grant !== "object") {
    return { present: false };
  }

  const record = grant as Record<string, unknown>;
  const client = record.client && typeof record.client === "object"
    ? record.client as Record<string, unknown>
    : undefined;

  return {
    present: true,
    clientId: grantClientId(grant) ?? "missing",
    clientName: typeof client?.client_name === "string" ? sanitizeText(client.client_name) : "missing",
    scopes: Array.isArray(record.scopes) ? record.scopes.map((scope) => sanitizeText(String(scope))) : [],
    grantedAt: typeof record.granted_at === "string" ? sanitizeText(record.granted_at) : "missing",
  };
}

function accessTokenLifetimeEvidence(tokens: OAuthTokens): Record<string, unknown> {
  try {
    const payload = decodeJwt(tokens.access_token);
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = typeof payload.iat === "number" ? payload.iat : undefined;
    const expiresAt = typeof payload.exp === "number" ? payload.exp : undefined;
    return {
      accessTokenHasIssuedAt: issuedAt !== undefined,
      accessTokenHasExpiry: expiresAt !== undefined,
      documentedLifetimeSeconds: tokens.expires_in ?? (issuedAt !== undefined && expiresAt !== undefined ? expiresAt - issuedAt : "unavailable"),
      secondsRemaining: expiresAt !== undefined ? expiresAt - now : "unavailable",
      withinDocumentedLifetime: expiresAt !== undefined && expiresAt > now,
    };
  } catch {
    return {
      accessTokenHasIssuedAt: false,
      accessTokenHasExpiry: false,
      documentedLifetimeSeconds: tokens.expires_in ?? "unavailable",
      secondsRemaining: "unavailable",
      withinDocumentedLifetime: false,
    };
  }
}

async function runMcpOperation(
  target: McpAccessGrantTarget,
  provider: CompatibilityOAuthProvider,
  fetchFn: EvidenceFetch,
  requests: RequestEvidence[],
): Promise<McpOperationResult> {
  const startIndex = requests.length;
  const client = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), {
    authProvider: provider,
    fetch: fetchFn,
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tool = listed.tools.find((candidate) => candidate.name === "getProjects") ?? listed.tools[0];
    if (!tool) {
      return {
        status: "not-proven",
        detail: "Authenticated MCP session returned no callable tools.",
      };
    }

    const result = await client.callTool({ name: tool.name, arguments: {} });
    if (result.isError) {
      return {
        status: "not-proven",
        detail: `Official MCP client callTool(${tool.name}) returned an MCP error rather than a successful operation.`,
        evidence: { tool: tool.name, resultIsError: true },
      };
    }

    return {
      status: "authorized",
      detail: `Official MCP client completed listTools and callTool(${tool.name}).`,
      evidence: { tool: tool.name, resultIsError: false },
    };
  } catch (error) {
    const requestStatuses = requests
      .slice(startIndex)
      .map((request) => request.status)
      .filter((status): status is number => typeof status === "number");
    const rejected = requestStatuses.includes(401) || requests
      .slice(startIndex)
      .some((request) => request.responseBody?.error === "invalid_token");

    return {
      status: rejected ? "rejected" : "not-proven",
      detail: rejected
        ? `MCP access was rejected by the protected resource: ${errorDetail(error)}`
        : `MCP operation could not be classified at the public boundary: ${errorDetail(error)}`,
      evidence: { requestStatuses },
    };
  } finally {
    await transport.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

async function createGrantManagementClient(
  target: McpAccessGrantTarget,
  tokens: OAuthTokens,
  fetchFn: EvidenceFetch,
): Promise<{ client?: SupabaseClient; error?: string }> {
  if (!target.anonKey) {
    return { error: "Supabase anon key was not supplied through an environment variable." };
  }

  const client = createClient(target.supabaseUrl, target.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetchFn },
  });
  const { error } = await client.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? "",
  });

  return error
    ? { error: `Official Supabase client could not establish the provider session: ${errorDetail(error)}` }
    : { client };
}

async function writeReport(serialized: string, testInfo: TestInfo): Promise<boolean> {
  const outputPath = testInfo.outputPath(EVIDENCE_ARTIFACT_FILENAME);
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");

    const configuredPath = process.env.MCP_ACCESS_GRANT_EVIDENCE_PATH;
    if (configuredPath) {
      await mkdir(path.dirname(path.resolve(configuredPath)), { recursive: true });
      await writeFile(path.resolve(configuredPath), serialized, "utf8");
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Characterization-only seams for issue #880. These expose the current aggregate
 * mechanics to executable tests until the later live-evidence migration moves
 * them behind its canonical capability boundary.
 */
export const mcpAccessGrantCharacterization = {
  createEvidenceFetch,
  collectVersions,
  evaluateTargetConfiguration: evaluateMcpAccessGrantTargetConfiguration,
  issue: MCP_ACCESS_GRANT_AGGREGATE_ISSUE,
  writeReport,
} as const;

interface LiveEvidenceRun {
  readonly issue: string;
  readonly target: CompatibilityReport["target"];
  readonly startedAt: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets: readonly string[];
  readonly requests: RequestEvidence[];
  readonly typedObservations: EvidenceObservation[];
}

async function finishReport(
  run: LiveEvidenceRun,
  gates: GateAccumulator,
  testInfo: TestInfo,
): Promise<CompatibilityReport> {
  const context = createEvidenceRunContext({
    configuredSecrets: run.configuredSecrets,
    time: { startedAt: run.startedAt, finishedAt: new Date().toISOString() },
    versions: run.versions,
  });
  const input = {
    issue: run.issue,
    target: run.target,
    requiredGateIds: REQUIRED_GATE_IDS,
    observations: [
      ...gates.observations(),
      ...run.typedObservations,
      ...run.requests.map((request): EvidenceObservation => ({ kind: "request", request })),
    ],
  };
  const preliminary = finalizeEvidence(input, context);
  const preliminaryWritten = await writeReport(preliminary.verification.serialized, testInfo);
  const finalized = finalizeEvidence({ ...input, artifactWriteSucceeded: preliminaryWritten }, context);
  const finalizedWritten = await writeReport(finalized.verification.serialized, testInfo);
  if (finalizedWritten) return finalized.report;

  const artifactFailure = finalizeEvidence({ ...input, artifactWriteSucceeded: false }, context);
  await writeReport(artifactFailure.verification.serialized, testInfo);
  return artifactFailure.report;
}

async function probeProviderMetadata(
  target: McpAccessGrantTarget,
  requests: RequestEvidence[],
): Promise<void> {
  if (!target.expectedAuthorizationServer) {
    return;
  }

  const metadataUrl = `${target.expectedAuthorizationServer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
  try {
    await createEvidenceFetch(requests)(metadataUrl);
  } catch {
    // The request evidence contains the sanitized network error.
  }
}

function recordPkceMatch(
  request: RequestEvidence | undefined,
  challenge: string | undefined,
): boolean {
  const exactMatch = Boolean(
    request &&
      request.requestCodeVerifierPresent &&
      request.requestCodeVerifierHash &&
      challenge &&
      request.requestCodeVerifierHash === challenge,
  );
  if (request) request.requestCodeVerifierMatchesChallenge = exactMatch;
  return exactMatch;
}

function latestRequest(
  requests: RequestEvidence[],
  predicate: (request: RequestEvidence) => boolean,
): RequestEvidence | undefined {
  return [...requests].reverse().find(predicate);
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJwtPart(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JWT part was not an object");
  }
  return parsed as Record<string, unknown>;
}

type NegativeTokenVariant =
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

function alteredDelegatedToken(
  token: string,
  variant: NegativeTokenVariant,
  canonicalResource: string,
): string {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Provider token was not a compact JWT");
  const [headerPart, payloadPart, signaturePart] = parts;
  if (variant === "modified-signature") {
    const first = signaturePart[0] ?? "A";
    const replacement = first === "A" ? "B" : "A";
    return `${headerPart}.${payloadPart}.${replacement}${signaturePart.slice(1)}`;
  }

  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  switch (variant) {
    case "unexpected-algorithm":
      header.alg = "HS256";
      break;
    case "unexpected-key":
      header.kid = "unexpected-compatibility-key";
      break;
    case "wrong-issuer":
      payload.iss = "https://unrelated.example/issuer";
      break;
    case "missing-subject":
      delete payload.sub;
      break;
    case "missing-audience":
      delete payload.aud;
      break;
    case "generic-audience":
      payload.aud = "mcp";
      break;
    case "inferred-resource-audience":
      payload.aud = new URL(canonicalResource).origin;
      break;
    case "unrelated-resource-audience":
      payload.aud = "https://unrelated.example/mcp";
      break;
    case "invalid-time":
      payload.exp = 1;
      break;
    case "missing-client-context":
      delete payload.client_id;
      delete payload.azp;
      break;
  }

  return `${encodeJwtPart(header)}.${encodeJwtPart(payload)}.${signaturePart}`;
}

interface PublicBoundaryProbeResult {
  id: string;
  status: GateStatus;
  httpStatus?: number;
  responseContainsCredentials: boolean;
}

async function probeMcpTokenBoundary(
  target: McpAccessGrantTarget,
  token: string,
  id: string,
  fetchFn: ReturnType<typeof createEvidenceFetch>,
  requests: RequestEvidence[],
): Promise<PublicBoundaryProbeResult> {
  const before = requests.length;
  try {
    await fetchFn(target.canonicalResource, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `negative-${id}`,
        method: "initialize",
        params: {
          capabilities: {},
          clientInfo: {
            name: "betterr-me-mcp-access-grant-negative-probe",
            version: "1.0.0",
          },
          protocolVersion: "2025-06-18",
        },
      }),
    });
  } catch {
    // The request evidence carries the sanitized network failure.
  }

  const request = requests.slice(before).find((candidate) => candidate.url === sanitizeUrl(target.canonicalResource));
  const responseContainsCredentials = request?.responseContainsCredentials ?? false;
  const rejected = publicBoundaryRejects(request?.status, responseContainsCredentials);
  return {
    id,
    status: request?.networkError || request?.status === undefined
      ? "not-proven"
      : rejected
        ? "pass"
        : "fail",
    ...(request?.status === undefined ? {} : { httpStatus: request.status }),
    responseContainsCredentials,
  };
}

function aggregateProbeStatus(results: PublicBoundaryProbeResult[]): GateStatus {
  if (results.some(({ status }) => status === "fail")) return "fail";
  if (results.some(({ status }) => status === "not-proven")) return "not-proven";
  return "pass";
}

function protocolBoundaryRejects(
  status: number | undefined,
  responseContainsCredentials: boolean,
): boolean {
  return Boolean(
    status &&
      status >= 400 &&
      status < 500 &&
      !responseContainsCredentials,
  );
}

async function probeProtocolRejection(
  id: string,
  url: string,
  init: RequestInit,
  fetchFn: ReturnType<typeof createEvidenceFetch>,
  requests: RequestEvidence[],
): Promise<PublicBoundaryProbeResult> {
  const before = requests.length;
  try {
    await fetchFn(url, init);
  } catch {
    // The request evidence carries the sanitized network failure.
  }
  const request = requests[before];
  const responseContainsCredentials = request?.responseContainsCredentials ?? false;
  const rejected = protocolBoundaryRejects(request?.status, responseContainsCredentials);
  return {
    id,
    status: request?.networkError || request?.status === undefined
      ? "not-proven"
      : rejected
        ? "pass"
        : "fail",
    ...(request?.status === undefined ? {} : { httpStatus: request.status }),
    responseContainsCredentials,
  };
}

async function probePkceNegativeProof(
  metadata: AuthorizationServerMetadata,
  authorizationUrl: URL,
  authorizationCode: string,
  clientInfo: OAuthClientInformationMixed,
  redirectUrl: string,
  canonicalResource: string,
  fetchFn: ReturnType<typeof createEvidenceFetch>,
  requests: RequestEvidence[],
): Promise<PublicBoundaryProbeResult[]> {
  const missingChallengeUrl = new URL(authorizationUrl);
  missingChallengeUrl.searchParams.delete("code_challenge");
  missingChallengeUrl.searchParams.delete("code_challenge_method");
  const plainChallengeUrl = new URL(authorizationUrl);
  plainChallengeUrl.searchParams.set("code_challenge", "compatibility-plain-challenge");
  plainChallengeUrl.searchParams.set("code_challenge_method", "plain");
  const commonHeaders = { accept: "application/json, text/html" };
  const results = [
    await probeProtocolRejection(
      "missing-code-challenge",
      missingChallengeUrl.toString(),
      { headers: commonHeaders, redirect: "manual" },
      fetchFn,
      requests,
    ),
    await probeProtocolRejection(
      "plain-code-challenge-method",
      plainChallengeUrl.toString(),
      { headers: commonHeaders, redirect: "manual" },
      fetchFn,
      requests,
    ),
  ];

  const tokenEndpoint = String(metadata.token_endpoint);
  const tokenRequests = [
    {
      id: "missing-code-verifier",
      body: new URLSearchParams({
        client_id: clientInfo.client_id,
        code: authorizationCode,
        grant_type: "authorization_code",
        redirect_uri: redirectUrl,
        resource: canonicalResource,
      }),
    },
    {
      id: "incorrect-code-verifier",
      body: new URLSearchParams({
        client_id: clientInfo.client_id,
        code: authorizationCode,
        code_verifier: "A".repeat(43),
        grant_type: "authorization_code",
        redirect_uri: redirectUrl,
        resource: canonicalResource,
      }),
    },
  ];
  for (const tokenRequest of tokenRequests) {
    results.push(
      await probeProtocolRejection(
        tokenRequest.id,
        tokenEndpoint,
        {
          body: tokenRequest.body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          method: "POST",
        },
        fetchFn,
        requests,
      ),
    );
  }
  return results;
}

async function probeResourceBindingNegatives(
  authorizationUrl: URL,
  fetchFn: ReturnType<typeof createEvidenceFetch>,
  requests: RequestEvidence[],
): Promise<PublicBoundaryProbeResult[]> {
  const cases: Array<{ id: string; resource?: string; remove?: boolean }> = [
    { id: "missing-resource", remove: true },
    { id: "generic-resource", resource: "mcp" },
    { id: "inferred-resource", resource: authorizationUrl.origin },
    { id: "unrelated-resource", resource: "https://unrelated.example/mcp" },
  ];

  const results: PublicBoundaryProbeResult[] = [];
  for (const testCase of cases) {
    const probeUrl = new URL(authorizationUrl);
    if (testCase.remove) {
      probeUrl.searchParams.delete("resource");
    } else {
      probeUrl.searchParams.set("resource", testCase.resource ?? "");
    }
    results.push(
      await probeProtocolRejection(
        testCase.id,
        probeUrl.toString(),
        { headers: { accept: "application/json, text/html" }, redirect: "manual" },
        fetchFn,
        requests,
      ),
    );
  }

  return results;
}

async function probeDelegatedTokenBoundaryNegatives(
  target: McpAccessGrantTarget,
  accessToken: string,
  fetchFn: ReturnType<typeof createEvidenceFetch>,
  requests: RequestEvidence[],
  gates: GateAccumulator,
  authorizationResourceResults: PublicBoundaryProbeResult[],
): Promise<void> {
  const variants: Array<{ id: string; variant: NegativeTokenVariant }> = [
    { id: "modified-signature", variant: "modified-signature" },
    { id: "unexpected-algorithm", variant: "unexpected-algorithm" },
    { id: "unexpected-key", variant: "unexpected-key" },
    { id: "wrong-issuer", variant: "wrong-issuer" },
    { id: "missing-subject", variant: "missing-subject" },
    { id: "missing-audience", variant: "missing-audience" },
    { id: "generic-audience", variant: "generic-audience" },
    { id: "inferred-resource-audience", variant: "inferred-resource-audience" },
    { id: "unrelated-resource-audience", variant: "unrelated-resource-audience" },
    { id: "invalid-time", variant: "invalid-time" },
    { id: "missing-client-context", variant: "missing-client-context" },
  ];
  const results: PublicBoundaryProbeResult[] = [];
  for (const { id, variant } of variants) {
    let alteredToken: string;
    try {
      alteredToken = alteredDelegatedToken(accessToken, variant, target.canonicalResource);
    } catch {
      results.push({
        id,
        status: "not-proven",
        responseContainsCredentials: false,
      });
      continue;
    }
    results.push(await probeMcpTokenBoundary(target, alteredToken, id, fetchFn, requests));
  }

  addGate(
    gates,
    "delegated-token-negative-boundary",
    aggregateProbeStatus(results),
    "The public MCP boundary was exercised with tampered signature, algorithm, key, issuer, audience, time, and client-context tokens; no probe may authorize or return credentials.",
    { cases: results },
  );

  const tokenResourceResults = results.filter(({ id }) =>
    id === "missing-audience" ||
    id === "generic-audience" ||
    id === "inferred-resource-audience" ||
    id === "unrelated-resource-audience",
  );
  const resourceResults = [...authorizationResourceResults, ...tokenResourceResults];
  addGate(
    gates,
    "resource-binding-negative",
    aggregateProbeStatus(resourceResults),
    "The public authorization and MCP boundaries rejected missing, generic, inferred-URL, and unrelated-resource values without issuing usable credentials.",
    { cases: resourceResults },
  );
}

function minimizeDelegatedJwtClaims(claims: DelegatedJwtClaims): DelegatedJwtClaims {
  const minimized: DelegatedJwtClaims = {};
  for (const key of ["iss", "sub", "aud", "exp", "iat", "nbf", "client_id", "azp", "resource"]) {
    const value = claims[key];
    if (value !== undefined) minimized[key] = boundedObservationValue(value);
  }
  return minimized;
}

function boundedObservationValue(value: unknown): unknown {
  if (typeof value === "string") return value.length <= 500 ? value : "[REDACTED]";
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return {};
  return "[REDACTED]";
}

function minimizeDelegatedSigningKeys(keys: readonly DelegatedJwk[], preferredKey?: DelegatedJwk): DelegatedJwk[] {
  const boundedKeys = keys.slice(0, 32);
  const preferredIncluded = !preferredKey || boundedKeys.some((key) => key.kid === preferredKey.kid);
  const sourceKeys = preferredIncluded || !preferredKey
    ? boundedKeys
    : [...boundedKeys.slice(0, 31), preferredKey];
  return sourceKeys.map((key) => ({
    ...(key.alg !== undefined ? { alg: boundedObservationValue(key.alg) } : {}),
    ...(key.kid !== undefined ? { kid: boundedObservationValue(key.kid) } : {}),
    ...(key.kty !== undefined ? { kty: boundedObservationValue(key.kty) } : {}),
    ...(key.crv !== undefined ? { crv: boundedObservationValue(key.crv) } : {}),
    ...(key.use !== undefined ? { use: boundedObservationValue(key.use) } : {}),
    ...(key.key_ops !== undefined
      ? { key_ops: Array.isArray(key.key_ops)
        ? key.key_ops.slice(0, 8).map((operation) => boundedObservationValue(operation))
        : boundedObservationValue(key.key_ops) }
      : {}),
  }));
}

async function validateProviderToken(
  tokens: OAuthTokens,
  metadata: AuthorizationServerMetadata,
  clientInfo: OAuthClientInformationMixed,
  target: McpAccessGrantTarget,
  tokenRequest: RequestEvidence | undefined,
  requests: RequestEvidence[],
  fetchFn: ReturnType<typeof createEvidenceFetch>,
): Promise<{
  status: GateStatus;
  detail: string;
  evidence?: Record<string, unknown>;
  observation?: DelegatedJwtObservation;
}> {
  if (!metadata.jwks_uri) {
    return {
      status: "not-proven",
      detail: "Authorization server metadata did not advertise a JWKS URI.",
    };
  }

  try {
    const verificationRequestsBefore = requests.length;
    const protectedHeader = decodeProtectedHeader(tokens.access_token) as DelegatedJwtHeader;
    const jwksResponse = await fetchFn(String(metadata.jwks_uri), {
      headers: { accept: "application/json" },
    });
    if (!jwksResponse.ok) {
      return {
        status: "fail",
        detail: `Provider JWKS endpoint returned HTTP ${jwksResponse.status}; local signature verification was not possible.`,
        evidence: {
          jwksUri: sanitizeUrl(String(metadata.jwks_uri)),
          jwksFetched: true,
          jwksStatus: jwksResponse.status,
        },
      };
    }

    const jwksBody: unknown = await jwksResponse.json();
    const keys = jwksBody && typeof jwksBody === "object" && !Array.isArray(jwksBody) &&
      Array.isArray((jwksBody as { keys?: unknown }).keys)
      ? ((jwksBody as { keys: unknown[] }).keys.filter(
          (key): key is DelegatedJwk => Boolean(key && typeof key === "object" && !Array.isArray(key)),
        ))
      : [];
    const selected = selectDelegatedSigningJwk(protectedHeader, keys);
    if (!selected.ok) {
      return {
        status: "fail",
        detail: `Provider JWT signing key policy rejected the token: ${selected.reason}.`,
        evidence: {
          jwksUri: sanitizeUrl(String(metadata.jwks_uri)),
          jwksFetched: true,
          jwksKeyMatched: false,
          signatureAlgorithm: typeof protectedHeader.alg === "string" ? protectedHeader.alg : "missing",
          keyIdPresent: typeof protectedHeader.kid === "string" && protectedHeader.kid.length > 0,
          failure: selected.reason,
        },
      };
    }

    const verificationKey = await importJWK(
      selected.key as Parameters<typeof importJWK>[0],
      protectedHeader.alg as string,
    );
    const verified = await jwtVerify(tokens.access_token, verificationKey, {
      algorithms: ["RS256", "ES256"],
      audience: target.canonicalResource,
      issuer: target.expectedAuthorizationServer,
      clockTolerance: 0,
    });
    const policy: DelegatedJwtPolicy = {
      canonicalResource: target.canonicalResource,
      expectedClientId: clientInfo.client_id,
      expectedIssuer: target.expectedAuthorizationServer,
      nowSeconds: Math.floor(Date.now() / 1000),
      tokenRequest: {
        clientId: tokenRequest?.requestClientId,
        grantType: tokenRequest?.requestGrantType,
        resource: tokenRequest?.requestResource,
      },
    };
    const claims = verified.payload as DelegatedJwtClaims;
    const minimizedHeader: DelegatedJwtHeader = {
      ...(protectedHeader.alg !== undefined ? { alg: boundedObservationValue(protectedHeader.alg) } : {}),
      ...(protectedHeader.kid !== undefined ? { kid: boundedObservationValue(protectedHeader.kid) } : {}),
      ...(protectedHeader.typ !== undefined ? { typ: boundedObservationValue(protectedHeader.typ) } : {}),
    };
    const minimizedClaims = minimizeDelegatedJwtClaims(claims);
    const minimizedSigningKeys = minimizeDelegatedSigningKeys(keys, selected.key);
    const policyResult = evaluateDelegatedJwtPolicy(protectedHeader, claims, policy);
    const verificationRequests = requests.slice(verificationRequestsBefore);
    const jwksRequestObserved = verificationRequests.some(
      (request) => request.url === sanitizeUrl(String(metadata.jwks_uri)),
    );
    const providerValidationRoundTrip = verificationRequests.some(
      (request) => request.url !== sanitizeUrl(String(metadata.jwks_uri)),
    );
    const evidence = {
      jwksUri: sanitizeUrl(String(metadata.jwks_uri)),
      jwksFetched: jwksRequestObserved,
      jwksKeyMatched: true,
      signatureAlgorithm: verified.protectedHeader.alg,
      localVerification: true,
      providerValidationRoundTrip,
      ...policyResult.checks,
      ...(policyResult.failures.length > 0 ? { failures: policyResult.failures } : {}),
    };

    const valid = policyResult.valid && jwksRequestObserved && !providerValidationRoundTrip;
    const detail = valid
      ? "Provider-issued access token was verified locally with the advertised asymmetric JWKS, allowed algorithm/key, exact issuer/resource audience, subject, time bounds, and registered-client authorization-code context."
      : "Provider JWT verification did not satisfy every local asymmetric-key, claim, or client/grant context gate.";
    return {
      status: valid ? "pass" : "fail",
      detail,
      evidence,
      observation: {
        kind: "delegated-jwt",
        gateId: "delegated-token-validation",
        detail,
        evidence,
        header: minimizedHeader,
        claims: minimizedClaims,
        policy,
        signingKeys: minimizedSigningKeys,
        signatureValid: true,
        ...(jwksRequestObserved && !providerValidationRoundTrip
          ? {}
          : { error: { kind: "malformed-observation", code: "provider-validation-round-trip" } }),
      },
    };
  } catch (error) {
    return {
      status: "fail",
      detail: `Local provider-token verification failed: ${errorDetail(error)}`,
    };
  }
}

export async function runMcpAccessGrantCompatibility(
  target: McpAccessGrantTarget,
  page: Page,
  testInfo: TestInfo,
): Promise<CompatibilityReport> {
  const startedAt = new Date().toISOString();
  const fetchRequests: RequestEvidence[] = [];
  const versions = await collectVersions(target);
  const run: LiveEvidenceRun = {
    issue: MCP_ACCESS_GRANT_AGGREGATE_ISSUE,
    startedAt,
    target: {
      name: target.name,
      canonicalResource: sanitizeUrl(target.canonicalResource),
      supabaseUrl: sanitizeUrl(target.supabaseUrl),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
    },
    versions,
    configuredSecrets: [
      target.email,
      target.password,
      target.anonKey,
      process.env.MCP_TEST_PASSWORD,
      process.env.MCP_SUPABASE_ANON_KEY,
      process.env.SUPABASE_ANON_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.API_KEY_HMAC_SECRET,
    ].filter((secret): secret is string => Boolean(secret)),
    requests: fetchRequests,
    typedObservations: [],
  };
  const gates = new GateAccumulator();

  const publicClientLayer = await runPublicClientLoopbackConsentCompatibility(target, page, testInfo);
  fetchRequests.push(...publicClientLayer.requests);
  for (const gate of publicClientLayer.gates) gates.add(gate);

  const { configured, nonProduction } = evaluateMcpAccessGrantTargetConfiguration(target);

  addGate(
    gates,
    "reproducible-configuration",
    configured && nonProduction ? "pass" : "not-proven",
    configured
      ? nonProduction
        ? "Target uses configured nonproduction loopback services; provider credentials are read only from environment variables."
        : "Target is not loopback; set MCP_ACCESS_GRANT_NON_PRODUCTION_ACK=true only for an explicitly approved nonproduction target."
      : "Canonical Resource, Supabase URL, and expected authorization-server issuer must be configured as URLs.",
    {
      hasProviderCredentials: Boolean(target.email && target.password),
      hasProviderClientKey: Boolean(target.anonKey),
      canonicalResource: sanitizeUrl(target.canonicalResource),
      supabaseUrl: sanitizeUrl(target.supabaseUrl),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
    },
  );

  const localProvider = isLocalHostname(target.supabaseUrl);
  const versionsComplete = Object.entries(run.versions)
    .filter(([key]) => key !== "declared-sdk-range")
    .filter(([key]) => localProvider || key !== "supabase-auth-provider-image")
    .filter(([key]) => !localProvider || key !== "supabase-hosted-provider-version")
    .every(([, value]) => value !== "unavailable" && value !== "not-publicly-exposed");
  addGate(
    gates,
    "versions",
    versionsComplete ? "pass" : "not-proven",
    versionsComplete
      ? localProvider
        ? "Exact installed SDK, Supabase client, Playwright, MCP handler, CLI, and local provider image versions were recorded."
        : "Exact installed SDK, Supabase client, Playwright, MCP handler, and CLI versions were recorded; the hosted provider does not expose an exact server version."
      : localProvider
        ? "One or more relevant installed versions could not be read in this environment."
        : "The hosted provider does not expose an exact server version, so the deployed provider-version gate remains not-proven.",
    run.versions,
  );

  if (!configured || !nonProduction) {
    return finishReport(run, gates, testInfo);
  }

  const loopback = new LoopbackCallback();
  const fetchFn = createEvidenceFetch(fetchRequests);
  let resourceInfo: Awaited<ReturnType<typeof discoverOAuthServerInfo>>;

  try {
    resourceInfo = await discoverOAuthServerInfo(new URL(target.canonicalResource), { fetchFn });
  } catch (error) {
    addGate(gates, "resource-discovery", "fail", `Canonical Resource metadata discovery failed: ${errorDetail(error)}`);
    await probeProviderMetadata(target, fetchRequests);
    const providerFailure = providerFeatureDisabled(fetchRequests, target.expectedAuthorizationServer);
    addGate(
      gates,
      "provider-discovery",
      providerFailure ? "fail" : "not-proven",
      providerFailure ?? "Delegated provider metadata could not be proven after resource discovery failed.",
    );
    return finishReport(run, gates, testInfo);
  }

  const discoveredAuthorizationServer = resourceInfo.authorizationServerUrl;
  const resourceMetadata = resourceInfo.resourceMetadata as OAuthProtectedResourceMetadata | undefined;
  const resourceMatches = isExactCanonicalResource(
    target.canonicalResource,
    resourceMetadata?.resource,
  );
  const delegatedProviderMatches = discoveredAuthorizationServer.replace(/\/$/, "") === target.expectedAuthorizationServer.replace(/\/$/, "");
  addGate(
    gates,
    "resource-discovery",
    resourceMatches && delegatedProviderMatches ? "pass" : "fail",
    resourceMatches && delegatedProviderMatches
      ? "Official MCP SDK discovered Protected Resource Metadata and the configured delegated Supabase authorization server from the Canonical Resource."
      : "Protected Resource Metadata did not delegate this Canonical Resource to the configured Supabase authorization server; no BetterR.Me OAuth fallback was used.",
    {
      resourceMetadataUrl: sanitizeUrl(`${target.canonicalResource.replace(/\/$/, "")}/.well-known/oauth-protected-resource`),
      advertisedResource: resourceMetadata?.resource ? sanitizeUrl(resourceMetadata.resource) : "unavailable",
      advertisedAuthorizationServer: sanitizeUrl(discoveredAuthorizationServer),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
      authorizationServerCount: resourceMetadata?.authorization_servers?.length ?? 0,
    },
  );

  if (!resourceMatches || !delegatedProviderMatches) {
    await probeProviderMetadata(target, fetchRequests);
    const providerFailure = providerFeatureDisabled(fetchRequests, target.expectedAuthorizationServer);
    addGate(
      gates,
      "provider-discovery",
      providerFailure ? "fail" : "not-proven",
      providerFailure ?? "The configured delegated provider was not selected by Protected Resource Metadata.",
    );
    return finishReport(run, gates, testInfo);
  }

  const metadata = resourceInfo.authorizationServerMetadata;
  if (!metadata) {
    addGate(gates, "provider-discovery", "not-proven", "The official SDK found the delegated issuer but could not obtain authorization-server metadata.");
    return finishReport(run, gates, testInfo);
  }

  const issuerMatches = metadata.issuer.replace(/\/$/, "") === target.expectedAuthorizationServer.replace(/\/$/, "");
  addGate(
    gates,
    "provider-discovery",
    metadataSupportsGoldenPath(metadata) && issuerMatches ? "pass" : "fail",
    metadataSupportsGoldenPath(metadata) && issuerMatches
      ? "Delegated provider metadata advertises dynamic registration, authorization-code/code, public-client authentication, and S256 PKCE."
      : "Delegated provider metadata does not advertise the expected issuer and every required public authorization-code/S256 capability.",
    { ...metadataEndpoints(metadata), issuerMatches },
  );

  if (!metadataSupportsGoldenPath(metadata) || !issuerMatches) {
    return finishReport(run, gates, testInfo);
  }

  await loopback.listen();
  const provider = new CompatibilityOAuthProvider(
    loopback.url,
    run.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
    target.canonicalResource,
  );
  const initialClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
  const initialTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), {
    authProvider: provider,
    fetch: fetchFn,
  });
  let initialConnectError: unknown;

  try {
    await initialClient.connect(initialTransport);
  } catch (error) {
    initialConnectError = error;
  }

  const clientInfo = provider.clientInformation();
  const registrationObserved = fetchRequests.some(
    (request) => request.method === "POST" && request.url === sanitizeUrl(metadata.registration_endpoint ?? ""),
  );
  const registeredClient = clientInfo as OAuthClientInformationFull | undefined;
  const publicClient = Boolean(
    registeredClient?.client_id &&
      !registeredClient.client_secret &&
      registeredClient.token_endpoint_auth_method === "none" &&
      registeredClient.grant_types?.includes("authorization_code") &&
      registeredClient.response_types?.includes("code") &&
      registeredClient.redirect_uris?.includes(loopback.url),
  );
  addGate(
    gates,
    "public-client-registration",
    registrationObserved && publicClient ? "pass" : "fail",
    registrationObserved && publicClient
      ? "Official SDK dynamic registration returned a public native client without a client secret for the authorization-code/code flow."
      : "Official SDK dynamic registration did not return the required public native client profile.",
    {
      registrationEndpoint: metadata.registration_endpoint ? sanitizeUrl(metadata.registration_endpoint) : "unavailable",
      registrationObserved,
      clientSecretReturned: Boolean(clientInfo?.client_secret),
      clientIdPresent: Boolean(clientInfo?.client_id),
      registeredTokenEndpointAuthMethod: registeredClient?.token_endpoint_auth_method ?? "missing",
      registeredGrantTypes: registeredClient?.grant_types ?? [],
      registeredResponseTypes: registeredClient?.response_types ?? [],
      registeredRedirectUris: registeredClient?.redirect_uris?.map((uri) => sanitizeUrl(uri)) ?? [],
    },
  );

  if (!initialConnectError && !provider.authorizationRequestUrl) {
    addGate(gates, "authorization-consent", "fail", "MCP endpoint connected without the required delegated authorization challenge.");
    addPkceGate(run.typedObservations, "No authorization redirect was produced because the endpoint did not challenge the client.", undefined, undefined, undefined);
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
  }

  if (!provider.authorizationRequestUrl) {
    addGate(gates, "authorization-consent", "fail", `Official SDK did not produce an authorization redirect: ${errorDetail(initialConnectError)}`);
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
  }

  const authorizationUrl = provider.authorizationRequestUrl;
  const authorizationQuery = authorizationUrl.searchParams;
  const pkceRequestValid = authorizationUrl.origin === new URL(metadata.authorization_endpoint).origin &&
    authorizationUrl.pathname === new URL(metadata.authorization_endpoint).pathname &&
    authorizationQuery.get("response_type") === "code" &&
    Boolean(authorizationQuery.get("code_challenge")) &&
    authorizationQuery.get("code_challenge_method") === "S256" &&
    authorizationQuery.get("redirect_uri") === loopback.url &&
    authorizationQuery.get("resource") === target.canonicalResource;
  addPkceGate(
    run.typedObservations,
    pkceRequestValid
      ? "Authorization request used code response, fixed IPv4 loopback callback, exact Canonical Resource, and S256 PKCE."
      : "Authorization request did not preserve the required code, loopback, resource, and S256 PKCE parameters.",
    {
      authorizationEndpoint: sanitizeUrl(authorizationUrl),
      callbackHost: new URL(loopback.url).hostname,
      callbackPath: new URL(loopback.url).pathname,
      responseType: authorizationQuery.get("response_type") ?? "missing",
      codeChallengeMethod: authorizationQuery.get("code_challenge_method") ?? "missing",
      codeChallengePresent: Boolean(authorizationQuery.get("code_challenge")),
      resource: authorizationQuery.get("resource") ? sanitizeUrl(authorizationQuery.get("resource") as string) : "missing",
    },
    pkceRequestValid,
    authorizationQuery.get("code_challenge_method") ?? undefined,
  );

  if (!pkceRequestValid) {
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
  }

  const resourceNegativeResults = await probeResourceBindingNegatives(
    authorizationUrl,
    fetchFn,
    fetchRequests,
  );
  addGate(
    gates,
    "resource-binding-negative",
    aggregateProbeStatus(resourceNegativeResults),
    "The public authorization boundary rejected missing, generic, inferred-URL, and unrelated Canonical Resource values without issuing usable credentials.",
    { cases: resourceNegativeResults },
  );

  if (!target.email || !target.password) {
    addGate(gates, "authorization-consent", "not-proven", "Provider test identity credentials were not supplied through environment variables.");
    addGate(gates, "pkce-negative-proof", "not-proven", "Negative proof cases were not exercised because browser credentials were not configured.");
    addGate(gates, "delegated-token-validation", "not-proven", "No provider access token was obtained because browser credentials were not configured.");
    addGate(gates, "delegated-token-negative-boundary", "not-proven", "Negative MCP-boundary token cases require a provider-issued access token.");
    addGate(gates, "authenticated-mcp-operation", "not-proven", "No provider access token was obtained because browser credentials were not configured.");
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
  }

  try {
    await page.goto(authorizationUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const email = page.locator('input[type="email"], input[name="email"], #email').first();
    const password = page.locator('input[type="password"], input[name="password"], #password').first();

    if (await email.count()) {
      await email.fill(target.email);
    }
    if (await password.count()) {
      await password.fill(target.password);
    }
    if (await email.count() || await password.count()) {
      const submit = page.getByRole("button", { name: /sign in|log in|continue/i }).first();
      if (await submit.count()) {
        await submit.click();
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      }
    }

    const bodyText = await page.locator("body").innerText();
    const approve = page.getByRole("button", { name: /^(allow|approve|authorize|grant|continue)$/i }).first();
    const deny = page.getByRole("button", { name: /^(deny|reject|cancel)$/i }).first();
    const explicitConsent = /\b(allow|approve|authorize|grant access|consent)\b/i.test(bodyText) &&
      await approve.count() > 0 && await deny.count() > 0 &&
      !/verified partner|official partner/i.test(bodyText);

    if (!explicitConsent) {
      addGate(
        gates,
        "authorization-consent",
        "fail",
        "Browser authorization did not expose an explicit affirmative consent decision alongside a denial decision.",
      );
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    await approve.click();
    const callback = await loopback.wait();
    if (callback.error || !callback.code) {
      addGate(gates, "authorization-consent", "fail", callback.error ?? "Provider did not return an authorization code to the loopback callback.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    const stateMatches = callback.state === authorizationQuery.get("state");
    addGate(
      gates,
      "authorization-consent",
      stateMatches ? "pass" : "fail",
      stateMatches
        ? "Browser login and explicit affirmative consent returned a code to the client callback with matching OAuth state."
        : "Browser callback state did not match the authorization request.",
      { consentDecision: "affirmative", denialControlPresent: true, stateMatches },
    );

    if (!stateMatches) {
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    if (!clientInfo) {
      addGate(gates, "pkce-negative-proof", "not-proven", "Registered client context was unavailable for negative proof requests.");
      addGate(gates, "delegated-token-validation", "not-proven", "Registered client context was unavailable for provider-token validation.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    const negativeProofResults = await probePkceNegativeProof(
      metadata,
      authorizationUrl,
      callback.code,
      clientInfo,
      loopback.url,
      target.canonicalResource,
      fetchFn,
      fetchRequests,
    );
    addGate(
      gates,
      "pkce-negative-proof",
      aggregateProbeStatus(negativeProofResults),
      "Public OAuth boundaries rejected missing PKCE challenge/verifier material, the plain challenge method, and an incorrect verifier without returning usable credentials.",
      { cases: negativeProofResults },
    );
    await initialTransport.finishAuth(callback.code);
    const tokens = provider.tokens();
    const tokenRequest = latestRequest(
      fetchRequests,
      (request) => request.method === "POST" && request.url === sanitizeUrl(metadata.token_endpoint),
    );
    const tokenResourceMatches = Boolean(
      tokenRequest &&
        isExactCanonicalResource(
          target.canonicalResource,
          tokenRequest?.requestResource,
        ),
    );
    const verifierMatchesChallenge = recordPkceMatch(
      tokenRequest,
      authorizationQuery.get("code_challenge") ?? undefined,
    );
    const tokenRequestIsPublicPkce = Boolean(
      tokenRequest &&
        !tokenRequest.authorizationHeaderPresent &&
        tokenRequest.requestBodyFields.includes("code") &&
        tokenRequest.requestBodyFields.includes("code_verifier") &&
        tokenRequest.requestBodyFields.includes("redirect_uri") &&
        tokenRequest.requestBodyFields.includes("resource") &&
        tokenRequest.requestGrantType === "authorization_code" &&
        tokenRequest.requestClientIdPresent &&
        tokenRequest.requestRedirectUri === loopback.url &&
        tokenResourceMatches &&
        verifierMatchesChallenge,
    );
    addPkceGate(
      run.typedObservations,
      tokenRequestIsPublicPkce
        ? "Authorization code exchange used the loopback redirect, S256 verifier, Canonical Resource, and no token-endpoint client authentication."
        : "Authorization code exchange did not show the required public-client PKCE request shape.",
      {
        tokenEndpoint: sanitizeUrl(metadata.token_endpoint),
        tokenRequestObserved: Boolean(tokenRequest),
        authorizationHeaderPresent: tokenRequest?.authorizationHeaderPresent ?? false,
        requestBodyFields: tokenRequest?.requestBodyFields ?? [],
        grantType: tokenRequest?.requestGrantType ?? "missing",
        clientIdPresent: tokenRequest?.requestClientIdPresent ?? false,
        redirectUri: tokenRequest?.requestRedirectUri ?? "missing",
        resource: tokenRequest?.requestResource ?? "missing",
        resourceMatchesCanonical: tokenResourceMatches,
        codeVerifierMatchesChallenge: verifierMatchesChallenge,
      },
      tokenRequestIsPublicPkce,
      authorizationQuery.get("code_challenge_method") ?? undefined,
    );

    if (!tokenRequestIsPublicPkce) {
      addGate(gates, "delegated-token-validation", "not-proven", "Provider-token validation was not attempted after the public PKCE/resource exchange gate failed.");
      addGate(gates, "delegated-token-negative-boundary", "not-proven", "MCP-boundary token probes were not attempted after the public PKCE/resource exchange gate failed.");
      addGate(gates, "authenticated-mcp-operation", "not-proven", "Authenticated MCP operation was not attempted after the public PKCE/resource exchange gate failed.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    if (!tokens?.access_token || !clientInfo) {
      addGate(gates, "delegated-token-validation", "not-proven", "Provider token exchange did not return an access token and registered client context.");
      addGate(gates, "authenticated-mcp-operation", "not-proven", "Provider token exchange did not return an access token.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    const tokenValidation = await validateProviderToken(
      tokens,
      metadata,
      clientInfo,
      target,
      tokenRequest,
      fetchRequests,
      fetchFn,
    );
    if (tokenValidation.observation) {
      run.typedObservations.push(tokenValidation.observation);
    } else {
      addGate(gates, "delegated-token-validation", tokenValidation.status, tokenValidation.detail, tokenValidation.evidence);
    }

    await probeDelegatedTokenBoundaryNegatives(
      target,
      tokens.access_token,
      fetchFn,
      fetchRequests,
      gates,
      resourceNegativeResults,
    );

    if (tokenValidation.status !== "pass") {
      addGate(gates, "authenticated-mcp-operation", "not-proven", "Authenticated MCP operation was not attempted because local provider-token verification did not pass.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(run, gates, testInfo);
    }

    await initialTransport.close().catch(() => undefined);
    await initialClient.close().catch(() => undefined);

    const operationClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
    const operationTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), {
      authProvider: provider,
      fetch: fetchFn,
    });
    const operationRequestsBefore = fetchRequests.length;
    try {
      await operationClient.connect(operationTransport);
      const listed = await operationClient.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === "getProjects") ?? listed.tools[0];
      const operationRequest = latestRequest(
        fetchRequests.slice(operationRequestsBefore),
        (request) => request.url === sanitizeUrl(target.canonicalResource),
      );
      const operationResourceMatches = Boolean(
        operationRequest && operationRequest.authorizationHeaderPresent,
      );
      if (!tool) {
        addGate(
          gates,
          "authenticated-mcp-operation",
          "fail",
          "Authenticated MCP session returned no callable tools.",
          { operationResourceMatches },
        );
      } else {
        const result = await operationClient.callTool({ name: tool.name, arguments: {} });
        const operationRequestAfterCall = latestRequest(
          fetchRequests.slice(operationRequestsBefore),
          (request) => request.url === sanitizeUrl(target.canonicalResource),
        );
        const operationRequestMatches = Boolean(
          operationRequestAfterCall && operationRequestAfterCall.authorizationHeaderPresent,
        );
        addGate(
          gates,
          "authenticated-mcp-operation",
          result.isError || !operationRequestMatches ? "fail" : "pass",
          result.isError
            ? `Official MCP client callTool(${tool.name}) returned an MCP error.`
            : operationRequestMatches
              ? `Official MCP client completed listTools and callTool(${tool.name}) through the delegated access grant at the exact Canonical MCP Resource.`
              : "Official MCP client returned a result without an authenticated request to the exact Canonical MCP Resource.",
          {
            tool: tool.name,
            resultIsError: Boolean(result.isError),
            operationResourceMatches: operationRequestMatches,
            operationUrl: operationRequestAfterCall?.url ?? "missing",
          },
        );
      }
    } catch (error) {
      addGate(gates, "authenticated-mcp-operation", "fail", `Authenticated MCP operation failed: ${errorDetail(error)}`);
    } finally {
      await operationTransport.close().catch(() => undefined);
      await operationClient.close().catch(() => undefined);
    }

    if (!tokens.refresh_token) {
      addGate(
        gates,
        "refresh-rotation",
        "not-proven",
        "Provider token exchange did not return a refresh token, so rotation and the Refresh Token Family could not be exercised.",
        { initialTokens: tokenSummary(tokens) },
      );
    return finishReport(run, gates, testInfo);
    }

    const refreshOptions = {
      authorizationServerUrl: metadata.issuer,
      metadata,
      clientInformation: clientInfo,
      resource: new URL(target.canonicalResource),
      fetchFn,
      requests: fetchRequests,
    };
    const firstRefresh = await refreshWithOfficialClient({
      ...refreshOptions,
      refreshToken: tokens.refresh_token,
    });
    const firstReplacement = tokenReplacementEvidence(tokens, firstRefresh);
    const firstRotationProven = Boolean(
      firstRefresh.tokens &&
        firstReplacement.providerReturnedAccessToken &&
        firstReplacement.providerReturnedRefreshToken &&
        firstReplacement.accessTokenChanged &&
        firstReplacement.refreshTokenChanged,
    );

    if (!firstRotationProven || !firstRefresh.tokens) {
      addGate(
        gates,
        "refresh-rotation",
        firstRefresh.tokens ? "fail" : firstRefresh.request ? "fail" : "not-proven",
        firstRefresh.tokens
          ? "Provider returned refresh credentials without replacing both the access and refresh credentials."
          : `The official MCP SDK refresh request did not return replacement credentials: ${errorDetail(firstRefresh.error)}`,
        firstReplacement,
      );
    return finishReport(run, gates, testInfo);
    }

    provider.saveTokens(firstRefresh.tokens);
    if (!firstRefresh.tokens.refresh_token) {
      addGate(gates, "refresh-rotation", "fail", "Provider returned an access-token replacement without a usable refresh-token replacement.", firstReplacement);
    return finishReport(run, gates, testInfo);
    }

    const secondRefresh = await refreshWithOfficialClient({
      ...refreshOptions,
      refreshToken: firstRefresh.tokens.refresh_token,
    });
    const secondReplacement = tokenReplacementEvidence(firstRefresh.tokens, secondRefresh);
    const secondRotationProven = Boolean(
      secondRefresh.tokens &&
        secondReplacement.providerReturnedAccessToken &&
        secondReplacement.providerReturnedRefreshToken &&
        secondReplacement.accessTokenChanged &&
        secondReplacement.refreshTokenChanged,
    );
    if (!secondRotationProven || !secondRefresh.tokens?.refresh_token) {
      addGate(
        gates,
        "refresh-rotation",
        secondRefresh.tokens ? "fail" : secondRefresh.request ? "fail" : "not-proven",
        secondRefresh.tokens
          ? "The second Refresh Token Family descendant did not receive a complete credential replacement."
          : `The official MCP SDK could not issue the second Refresh Token Family descendant: ${errorDetail(secondRefresh.error)}`,
        { firstReplacement, secondReplacement },
      );
    return finishReport(run, gates, testInfo);
    }

    provider.saveTokens(secondRefresh.tokens);
    const replacementOperation = await runMcpOperation(target, provider, fetchFn, fetchRequests);
    addGate(
      gates,
      "authenticated-mcp-operation",
      replacementOperation.status === "authorized"
        ? "pass"
        : replacementOperation.status === "rejected"
          ? "fail"
          : "not-proven",
      replacementOperation.status === "authorized"
        ? "The official MCP client replaced its stored credentials and completed a real MCP operation with the replacement access token."
        : `Replacement access-token operation was not proven: ${replacementOperation.detail}`,
      {
        ...replacementOperation.evidence,
        replacementCredentialsStored: true,
      },
    );
    addGate(
      gates,
      "refresh-rotation",
      "pass",
      "The official MCP SDK completed two single-use refreshes; each provider response replaced both credentials, and the client stored the latest replacement.",
      {
        initial: tokenSummary(tokens),
        firstDescendant: tokenSummary(firstRefresh.tokens),
        secondDescendant: tokenSummary(secondRefresh.tokens),
        firstReplacement,
        secondReplacement,
        replacementOperation: replacementOperation.status,
      },
    );

    const familyAttempts = [
      {
        label: "consumed-root",
        refreshToken: tokens.refresh_token,
      },
      {
        label: "consumed-descendant-1",
        refreshToken: firstRefresh.tokens.refresh_token,
      },
      {
        label: "active-descendant-2",
        refreshToken: secondRefresh.tokens.refresh_token,
      },
    ];
    const familyResults: Record<string, Record<string, unknown>> = {};
    const familyStatuses: Array<"rejected" | "succeeded" | "not-proven"> = [];
    for (const familyAttempt of familyAttempts) {
      const result = await refreshWithOfficialClient({
        ...refreshOptions,
        refreshToken: familyAttempt.refreshToken,
      });
      const status = result.tokens
        ? "succeeded"
        : ((result.request?.status && result.request.status >= 400 && result.request.status < 500) || responseField(result.request, "error"))
          ? "rejected"
          : "not-proven";
      familyStatuses.push(status);
      familyResults[familyAttempt.label] = {
        status,
        ...refreshAttemptEvidence(result),
      };
    }
    const rootReplayStatus = familyStatuses[0];
    const familyContainmentProven = familyStatuses.every((status) => status === "rejected");
    addGate(
      gates,
      "refresh-replay-containment",
      familyContainmentProven ? "pass" : familyStatuses.includes("succeeded") ? "fail" : "not-proven",
      familyContainmentProven
        ? "Replay of the consumed root refresh token was rejected, and every issued descendant in the active Refresh Token Family was also rejected."
        : familyStatuses.includes("succeeded")
          ? "Replay or descendant refresh unexpectedly produced replacement credentials; provider family containment is not effective."
          : "The provider did not return enough classified responses to prove Refresh Token Family containment.",
      {
        rootReplayDetected: rootReplayStatus === "rejected",
        everyIssuedDescendantRejected: familyContainmentProven,
        familyMemberCountExercised: familyAttempts.length,
        familyResults,
      },
    );

    const grantClientResult = await createGrantManagementClient(target, secondRefresh.tokens, fetchFn);
    if (!grantClientResult.client) {
      addGate(gates, "grant-identification-revocation", "not-proven", grantClientResult.error ?? "User-facing grant-management client was unavailable.");
      addGate(gates, "post-revocation-refresh", "not-proven", "Grant revocation was not exercised because the supported user-facing grant-management client was unavailable.");
      addGate(gates, "post-revocation-access", "not-proven", "Grant revocation was not exercised because the supported user-facing grant-management client was unavailable.");
      addGate(gates, "cleanup", "not-proven", "No grant could be identified for cleanup; provider cleanup is not proven in this environment.");
    return finishReport(run, gates, testInfo);
    }

    const grantClient = grantClientResult.client;
    let grantClientIdToRevoke: string | undefined;
    let grantRevoked = false;
    let relevantGrant: unknown;
    try {
      const grantsResult = await grantClient.auth.oauth.listGrants();
      const grants = grantsResult.data ?? [];
      relevantGrant = grants.find((grant) => grantClientId(grant) === clientInfo.client_id);
      const grantsRequest = [...fetchRequests].reverse().find(
        (request) => request.method === "GET" && request.url.endsWith("/auth/v1/user/oauth/grants"),
      );
      const grantIdentified = Boolean(relevantGrant && grantClientId(relevantGrant));
      grantClientIdToRevoke = grantIdentified ? grantClientId(relevantGrant) : undefined;

      if (grantsResult.error) {
        addGate(gates, "grant-identification-revocation", "fail", `Official Supabase client grant listing failed: ${errorDetail(grantsResult.error)}`, {
          requestStatus: grantsRequest?.status ?? "not-observed",
          grantEndpointObserved: Boolean(grantsRequest),
        });
      } else if (!grantIdentified) {
        addGate(gates, "grant-identification-revocation", "fail", "The dedicated user could not identify the grant created for the registered MCP client.", {
          requestStatus: grantsRequest?.status ?? "not-observed",
          grantEndpointObserved: Boolean(grantsRequest),
          grantCount: grants.length,
          registeredClientIdPresent: Boolean(clientInfo.client_id),
        });
      } else {
        const revokeResult = await grantClient.auth.oauth.revokeGrant({ clientId: grantClientIdToRevoke as string });
        const revokeRequest = [...fetchRequests].reverse().find(
        (request) => request.method === "DELETE" && request.url.includes("/auth/v1/user/oauth/grants"),
        );
        if (revokeResult.error) {
          addGate(gates, "grant-identification-revocation", "fail", `Official Supabase client grant revocation failed: ${errorDetail(revokeResult.error)}`, {
            grant: grantSummary(relevantGrant),
            requestStatus: revokeRequest?.status ?? "not-observed",
          });
        } else {
          grantRevoked = true;
          addGate(gates, "grant-identification-revocation", "pass", "The dedicated user identified the registered MCP client through Supabase's user-facing grant list and revoked that grant through the official client API.", {
            grant: grantSummary(relevantGrant),
            requestStatus: revokeRequest?.status ?? "not-observed",
            revokeEndpointObserved: Boolean(revokeRequest),
          });
        }
      }
    } catch (error) {
      addGate(gates, "grant-identification-revocation", "not-proven", `The supported Supabase grant-management boundary could not be classified: ${errorDetail(error)}`);
    }

    if (!grantRevoked) {
      addGate(gates, "post-revocation-refresh", "not-proven", "Post-revocation refresh behavior was not exercised because the relevant grant was not revoked.");
      addGate(gates, "post-revocation-access", "not-proven", "Post-revocation access behavior was not exercised because the relevant grant was not revoked.");
      addGate(gates, "cleanup", "not-proven", "The relevant grant was not revoked; provider cleanup remains unproven and must be handled by the dedicated test environment.");
    return finishReport(run, gates, testInfo);
    }

    const postRevocationRefresh = await refreshWithOfficialClient({
      ...refreshOptions,
      refreshToken: secondRefresh.tokens.refresh_token,
    });
    const postRefreshStatus = postRevocationRefresh.tokens
      ? "fail"
      : ((postRevocationRefresh.request?.status && postRevocationRefresh.request.status >= 400 && postRevocationRefresh.request.status < 500) || responseField(postRevocationRefresh.request, "error"))
        ? "pass"
        : "not-proven";
    addGate(
      gates,
      "post-revocation-refresh",
      postRefreshStatus,
      postRefreshStatus === "pass"
        ? "The refresh path produced no replacement credentials after the user-facing grant was revoked."
        : postRefreshStatus === "fail"
          ? "The provider issued replacement credentials after the user-facing grant was revoked; effective authority remains."
          : "The provider did not return a classifiable response to the post-revocation refresh attempt.",
      refreshAttemptEvidence(postRevocationRefresh),
    );

    const formerAccessProvider = new CompatibilityOAuthProvider(
      undefined,
      run.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
      target.canonicalResource,
    );
    formerAccessProvider.saveClientInformation(clientInfo);
    formerAccessProvider.saveTokens(secondRefresh.tokens);
    const postRevocationOperation = await runMcpOperation(target, formerAccessProvider, fetchFn, fetchRequests);
    const lifetime = accessTokenLifetimeEvidence(secondRefresh.tokens);
    const postAccessStatus = postRevocationOperation.status === "rejected"
      ? "pass"
      : postRevocationOperation.status === "authorized" && lifetime.accessTokenHasExpiry && lifetime.withinDocumentedLifetime
        ? "pass"
        : postRevocationOperation.status === "authorized" && lifetime.accessTokenHasExpiry
          ? "fail"
          : "not-proven";
    addGate(
      gates,
      "post-revocation-access",
      postAccessStatus,
      postAccessStatus === "pass" && postRevocationOperation.status === "rejected"
        ? "The former access path was rejected after grant revocation."
        : postAccessStatus === "pass"
          ? "The former access token remained effective only within its provider-documented lifetime; this observed stateless-access window is recorded for the gate decision."
          : postAccessStatus === "fail"
            ? "The former access token remained effective beyond a provider-documented lifetime after grant revocation."
            : `The former access path could not be classified: ${postRevocationOperation.detail}`,
      {
        ...postRevocationOperation.evidence,
        operationStatus: postRevocationOperation.status,
        ...lifetime,
      },
    );
    addGate(
      gates,
      "cleanup",
      grantRevoked ? "pass" : "not-proven",
      "The grant created for this run was revoked through the supported user-facing Supabase boundary; dynamic client-registration cleanup is not exposed to this public client and is intentionally not emulated.",
      { grantIdentified: Boolean(grantClientIdToRevoke), grantRevoked },
    );
  } catch (error) {
    addGate(gates, "authorization-consent", "fail", `Browser authorization flow failed: ${errorDetail(error)}`);
    if (error instanceof UnauthorizedError) {
      addGate(gates, "delegated-token-validation", "not-proven", "The official SDK remained unauthorized after the browser flow.");
    }
  } finally {
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
  }

    return finishReport(run, gates, testInfo);
}
