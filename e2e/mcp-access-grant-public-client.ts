import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { Page, Request as PlaywrightRequest, TestInfo } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  EVIDENCE_ARTIFACT_FILENAME,
  GateAccumulator,
  browserUrlCredentialEvidence,
  classifyAuthorizationOutcome,
  classifyConsentPresentation,
  classifyPublicRegistrationBoundary,
  classifyRegistrationProbe,
  createEvidenceRunContext,
  finalizeEvidence,
  hasUnnegatedEndorsementLanguage,
  minimizeResponseBody,
  sanitizeText,
  sanitizeUrl,
  type CompatibilityReport,
  type ConsentPresentationObservation,
  type EvidenceObservation,
  type GateObservation,
  type GateStatus as EvidenceGateStatus,
  type MinimizedRequestObservation,
} from "./mcp-access-grant-evidence";
import {
  DEFAULT_LOOPBACK_CALLBACK_PATH,
  buildLoopbackUrls,
  buildPublicNativeClientMetadata,
  buildRegistrationNegativeCases,
  grantClientId,
  LOOPBACK_HOSTS,
  type LoopbackHost,
  type PublicClientProfileValidation,
  validatePublicClientProfile,
} from "./mcp-access-grant-policy";

export type GateStatus = EvidenceGateStatus;

export interface McpAccessGrantTarget {
  name: string;
  canonicalResource: string;
  supabaseUrl: string;
  expectedAuthorizationServer: string;
  loopbackHosts?: LoopbackHost[];
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
  oauthError?: boolean;
  accessTokenPresent?: boolean;
  refreshTokenPresent?: boolean;
  idTokenPresent?: boolean;
}

interface TargetConfig {
  name?: unknown;
  canonicalResource?: unknown;
  supabaseUrl?: unknown;
  expectedAuthorizationServer?: unknown;
  loopbackHosts?: unknown;
  emailEnv?: unknown;
  passwordEnv?: unknown;
}

export const PUBLIC_CLIENT_REQUIRED_GATE_IDS = [
  "resource-discovery",
  "provider-discovery",
  "public-client-registration-both",
  "registration-negative-validation-both",
  "untrusted-client-metadata-both",
  "authorization-consent-both",
  "consent-denial-both",
  "consent-abandonment-both",
  "consent-cleanup-both",
  "loopback-both",
  "loopback-request-both",
  "loopback-pkce-both",
  "delegated-token-validation-both",
  "authenticated-mcp-operation-both",
  "reproducible-configuration",
  "sanitized-evidence",
  "versions",
] as const;

const CALLBACK_WAIT_TIMEOUT_MS = 10_000;
const LOGO_FIXTURE_PATH = "/mcp-client-logo.svg";
const LOGO_FIXTURE_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f766e"/><path d="M18 32h28M32 18v28" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`;

const SENSITIVE_ENV_NAMES = [
  "MCP_TEST_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "API_KEY_HMAC_SECRET",
];

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

function requestBodyFields(body: BodyInit | null | undefined): string[] {
  const text = typeof body === "string"
    ? body
    : body instanceof URLSearchParams
      ? body.toString()
      : undefined;
  if (text === undefined) {
    return body ? ["[non-text body]"] : [];
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed).sort();
    }
  } catch {
    // OAuth requests are form encoded and are handled below.
  }

  try {
    return [...new URLSearchParams(text).keys()].sort();
  } catch {
    return ["[unparsed body]"];
  }
}

function requestParameterEvidence(body: BodyInit | null | undefined): Pick<
  RequestEvidence,
  | "requestClientId"
  | "requestGrantType"
  | "requestRedirectUri"
  | "requestResource"
  | "requestCodeChallengeMethod"
  | "requestCodeChallengePresent"
  | "requestCodePresent"
  | "requestCodeVerifierPresent"
  | "requestCodeVerifierHash"
> {
  const text = typeof body === "string"
    ? body
    : body instanceof URLSearchParams
      ? body.toString()
      : undefined;
  if (text === undefined) {
    return {};
  }

  let parameters: URLSearchParams;
  try {
    parameters = new URLSearchParams(text);
  } catch {
    return {};
  }

  const codeVerifier = parameters.get("code_verifier");
  const redirectUri = parameters.get("redirect_uri");
  const resource = parameters.get("resource");
  return {
    ...(parameters.has("client_id") ? { requestClientId: sanitizeText(parameters.get("client_id") ?? "") } : {}),
    ...(parameters.has("grant_type") ? { requestGrantType: sanitizeText(parameters.get("grant_type") ?? "") } : {}),
    ...(redirectUri ? { requestRedirectUri: sanitizeUrl(redirectUri) } : {}),
    ...(resource ? { requestResource: sanitizeUrl(resource) } : {}),
    ...(parameters.has("code_challenge_method") ? { requestCodeChallengeMethod: sanitizeText(parameters.get("code_challenge_method") ?? "") } : {}),
    requestCodeChallengePresent: parameters.has("code_challenge"),
    requestCodePresent: parameters.has("code"),
    requestCodeVerifierPresent: parameters.has("code_verifier"),
    ...(codeVerifier ? { requestCodeVerifierHash: createHash("sha256").update(codeVerifier).digest("base64url") } : {}),
  };
}

function createEvidenceFetch(requests: RequestEvidence[]) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const inputUrl = typeof input === "string" || input instanceof URL ? input : input.url;
    const request: RequestEvidence = {
      method: init?.method ?? "GET",
      url: sanitizeUrl(inputUrl),
      requestBodyFields: requestBodyFields(init?.body),
      authorizationHeaderPresent: headers.has("authorization"),
      ...requestParameterEvidence(init?.body),
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
        request.responseBody = contentType?.includes("text/event-stream")
          ? { contentType, body: "[STREAM BODY NOT RECORDED]" }
          : minimizeResponseBody(
              await response.clone().text(),
              contentType,
            );
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

function captureBrowserTokenRequests(
  page: Page,
  tokenEndpoint: string,
  requests: RequestEvidence[],
): () => void {
  const expectedTokenEndpoint = new URL(tokenEndpoint);
  const onRequest = (request: PlaywrightRequest): void => {
    let actualTokenEndpoint: URL;
    try {
      actualTokenEndpoint = new URL(request.url());
    } catch {
      return;
    }
    if (request.method() !== "POST" || actualTokenEndpoint.origin !== expectedTokenEndpoint.origin ||
      actualTokenEndpoint.pathname !== expectedTokenEndpoint.pathname) {
      return;
    }

    const headers = request.headers();
    requests.push({
      method: request.method(),
      url: sanitizeUrl(expectedTokenEndpoint),
      requestBodyFields: requestBodyFields(request.postData()),
      authorizationHeaderPresent: Object.keys(headers).some((key) => key.toLowerCase() === "authorization"),
    });
  };
  page.on("request", onRequest);
  return () => page.off("request", onRequest);
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
  private result?: CallbackResult;
  private callbackRequestSeen = false;
  private port = 0;

  constructor(
    private readonly host: LoopbackHost,
    private readonly callbackPath = DEFAULT_LOOPBACK_CALLBACK_PATH,
  ) {
    this.resultPromise = new Promise<CallbackResult>((resolve) => {
      this.resolveResult = resolve;
    });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        this.server.removeListener("listening", handleListening);
        reject(error);
      };
      const handleListening = (): void => {
        this.server.removeListener("error", handleError);
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve();
      };
      this.server.once("error", handleError);
      this.server.once("listening", handleListening);
      this.server.listen(0, this.host);
    });
  }

  get registrationUrl(): string {
    return buildLoopbackUrls(this.host, this.port, this.callbackPath).registrationUrl;
  }

  get url(): string {
    return buildLoopbackUrls(this.host, this.port, this.callbackPath).callbackUrl;
  }

  get callbackReceived(): boolean {
    return this.callbackRequestSeen;
  }

  async wait(timeoutMs = CALLBACK_WAIT_TIMEOUT_MS): Promise<CallbackResult> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.resultPromise,
        new Promise<CallbackResult>((resolve) => {
          timeout = setTimeout(() => resolve({ error: "loopback callback timed out", oauthError: false }), timeoutMs);
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
    if (requestUrl.pathname !== this.callbackPath) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found.");
      return;
    }
    this.callbackRequestSeen = true;
    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state") ?? undefined;
    const accessTokenPresent = requestUrl.searchParams.has("access_token");
    const refreshTokenPresent = requestUrl.searchParams.has("refresh_token");
    const idTokenPresent = requestUrl.searchParams.has("id_token");

    if (error) {
      this.resolveOnce({ error: sanitizeText(error), oauthError: true, code: code ?? undefined, state, accessTokenPresent, refreshTokenPresent, idTokenPresent });
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Authorization was not completed.");
      return;
    }

    if (code) {
      this.resolveOnce({ code, state, accessTokenPresent, refreshTokenPresent, idTokenPresent });
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Authorization callback received. You may close this tab.");
      return;
    }

    if (accessTokenPresent || refreshTokenPresent || idTokenPresent) {
      this.resolveOnce({ accessTokenPresent, refreshTokenPresent, idTokenPresent, state });
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Authorization callback contained an unexpected credential.");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found.");
  }

  private resolveOnce(result: CallbackResult): void {
    if (this.result) {
      return;
    }
    this.result = result;
    this.resolveResult(result);
  }
}

class LogoFixture {
  private readonly server = createServer((request, response) => {
    if (new URL(request.url ?? "/", "http://127.0.0.1").pathname !== LOGO_FIXTURE_PATH) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found.");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "image/svg+xml",
    });
    response.end(LOGO_FIXTURE_CONTENT);
  });
  private port = 0;

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        this.server.removeListener("listening", handleListening);
        reject(error);
      };
      const handleListening = (): void => {
        this.server.removeListener("error", handleError);
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve();
      };
      this.server.once("error", handleError);
      this.server.once("listening", handleListening);
      this.server.listen(0, "127.0.0.1");
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}${LOGO_FIXTURE_PATH}`;
  }

  async close(): Promise<void> {
    if (!this.server.listening) {
      return;
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

class CompatibilityOAuthProvider implements OAuthClientProvider {
  private clientInfo?: OAuthClientInformationMixed;
  private tokenInfo?: OAuthTokens;
  private verifier?: string;
  private authorizationUrl?: URL;
  private discovery?: OAuthDiscoveryState;

  constructor(
    private readonly callbackUrl: string,
    private readonly registeredMetadata: OAuthClientMetadata,
  ) {}

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.registeredMetadata;
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

async function collectVersions(): Promise<Record<string, string>> {
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

  const dockerImages = commandVersion("docker", ["ps", "--format", "{{.Names}}|{{.Image}}"]);
  const authImage = dockerImages
    .split(/\r?\n/)
    .find((line) => line.startsWith("supabase_auth_"))
    ?.split("|")[1];
  versions["supabase-auth-provider-image"] = authImage ?? "unavailable";

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
    clientName: typeof client?.name === "string"
      ? sanitizeText(client.name)
      : typeof client?.client_name === "string"
        ? sanitizeText(client.client_name)
        : "missing",
    scopes: Array.isArray(record.scopes) ? record.scopes.map((scope) => sanitizeText(String(scope))) : [],
    grantedAt: typeof record.granted_at === "string" ? sanitizeText(record.granted_at) : "missing",
  };
}

interface GrantBoundaryObservation {
  status: "absent" | "present" | "unavailable";
  detail: string;
  evidence: Record<string, unknown>;
  grant?: unknown;
}

async function createGrantManagementClient(
  target: McpAccessGrantTarget,
  tokens: OAuthTokens | undefined,
  requests: RequestEvidence[],
): Promise<{ client?: SupabaseClient; error?: string }> {
  if (!target.anonKey) {
    return { error: "Supabase anon key was not supplied through an environment variable." };
  }
  if (!tokens && (!target.email || !target.password)) {
    return { error: "Dedicated browser credentials were not supplied for the supported user-facing grant boundary." };
  }

  const client = createClient(target.supabaseUrl, target.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: createEvidenceFetch(requests) },
  });
  const authResult = tokens
    ? await client.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? "",
    })
    : await client.auth.signInWithPassword({
      email: target.email as string,
      password: target.password as string,
    });

  if (authResult.error) {
    return { error: `Official Supabase client could not establish the provider session: ${errorDetail(authResult.error)}` };
  }
  return { client };
}

function latestGrantRequest(requests: RequestEvidence[], method: string): RequestEvidence | undefined {
  return [...requests].reverse().find((request) =>
    request.method === method && (() => {
      try {
        return new URL(request.url).pathname.endsWith("/auth/v1/user/oauth/grants");
      } catch {
        return false;
      }
    })(),
  );
}

async function inspectGrantForClient(
  target: McpAccessGrantTarget,
  clientId: string,
  requests: RequestEvidence[],
): Promise<GrantBoundaryObservation> {
  let clientResult: { client?: SupabaseClient; error?: string };
  try {
    clientResult = await createGrantManagementClient(target, undefined, requests);
  } catch (error) {
    return {
      status: "unavailable",
      detail: `The supported user-facing grant client could not be created: ${errorDetail(error)}`,
      evidence: { grantEndpointObserved: false },
    };
  }
  if (!clientResult.client) {
    return {
      status: "unavailable",
      detail: clientResult.error ?? "Supported user-facing grant listing was unavailable.",
      evidence: { grantEndpointObserved: false },
    };
  }

  try {
    const grantsResult = await clientResult.client.auth.oauth.listGrants();
    const grants = grantsResult.data ?? [];
    const grant = grants.find((candidate) => grantClientId(candidate) === clientId);
    const grantRequest = latestGrantRequest(requests, "GET");
    if (grantsResult.error) {
      return {
        status: "unavailable",
        detail: `Official Supabase client grant listing failed: ${errorDetail(grantsResult.error)}`,
        evidence: {
          grantEndpointObserved: Boolean(grantRequest),
          requestStatus: grantRequest?.status ?? "not-observed",
        },
      };
    }
    return {
      status: grant ? "present" : "absent",
      detail: grant
        ? "The supported user-facing grant list already contains the registered MCP client."
        : "The supported user-facing grant list contains no grant for the newly registered MCP client.",
      evidence: {
        grantEndpointObserved: Boolean(grantRequest),
        requestStatus: grantRequest?.status ?? "not-observed",
        grantCount: grants.length,
        registeredClientIdPresent: clientId.length > 0,
        grant: grantSummary(grant),
      },
      grant,
    };
  } catch (error) {
    return {
      status: "unavailable",
      detail: `The supported user-facing grant list could not be classified: ${errorDetail(error)}`,
      evidence: {
        grantEndpointObserved: Boolean(latestGrantRequest(requests, "GET")),
      },
    };
  }
}

async function revokeGrantForClient(
  target: McpAccessGrantTarget,
  clientId: string,
  tokens: OAuthTokens | undefined,
  requests: RequestEvidence[],
): Promise<GrantBoundaryObservation> {
  let clientResult: { client?: SupabaseClient; error?: string };
  try {
    clientResult = await createGrantManagementClient(target, tokens, requests);
  } catch (error) {
    return {
      status: "unavailable",
      detail: `The supported user-facing grant client could not be created for cleanup: ${errorDetail(error)}`,
      evidence: { grantEndpointObserved: false },
    };
  }
  if (!clientResult.client) {
    return {
      status: "unavailable",
      detail: clientResult.error ?? "Supported user-facing grant revocation was unavailable.",
      evidence: { grantEndpointObserved: false },
    };
  }

  try {
    const grantsResult = await clientResult.client.auth.oauth.listGrants();
    const grants = grantsResult.data ?? [];
    const grant = grants.find((candidate) => grantClientId(candidate) === clientId);
    const listRequest = latestGrantRequest(requests, "GET");
    if (grantsResult.error) {
      return {
        status: "unavailable",
        detail: `Official Supabase client grant listing failed during cleanup: ${errorDetail(grantsResult.error)}`,
        evidence: {
          grantEndpointObserved: Boolean(listRequest),
          requestStatus: listRequest?.status ?? "not-observed",
        },
      };
    }
    if (!grant) {
      return {
        status: "present",
        detail: "The successful public-client journey did not leave an identifiable grant in the supported user-facing grant list.",
        evidence: {
          grantEndpointObserved: Boolean(listRequest),
          requestStatus: listRequest?.status ?? "not-observed",
          grantCount: grants.length,
          registeredClientIdPresent: clientId.length > 0,
          grant: grantSummary(grant),
        },
      };
    }

    const revokeResult = await clientResult.client.auth.oauth.revokeGrant({ clientId });
    const revokeRequest = latestGrantRequest(requests, "DELETE");
    if (revokeResult.error) {
      return {
        status: "present",
        detail: `Official Supabase client grant revocation failed: ${errorDetail(revokeResult.error)}`,
        evidence: {
          grant: grantSummary(grant),
          requestStatus: revokeRequest?.status ?? "not-observed",
        },
      };
    }
    return {
      status: "absent",
      detail: "The successful public-client journey's grant was identified and revoked through the supported user-facing Supabase boundary.",
      evidence: {
        grant: grantSummary(grant),
        requestStatus: revokeRequest?.status ?? "not-observed",
        revokeEndpointObserved: Boolean(revokeRequest),
      },
    };
  } catch (error) {
    return {
      status: "unavailable",
      detail: `The supported user-facing grant cleanup could not be classified: ${errorDetail(error)}`,
      evidence: {
        grantEndpointObserved: Boolean(latestGrantRequest(requests, "GET")),
      },
    };
  }
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

interface LiveEvidenceRun {
  readonly issue: string;
  readonly target: CompatibilityReport["target"];
  readonly startedAt: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly configuredSecrets: readonly string[];
}

async function finishReport(
  run: LiveEvidenceRun,
  gates: GateAccumulator,
  requests: RequestEvidence[],
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
    requiredGateIds: PUBLIC_CLIENT_REQUIRED_GATE_IDS,
    observations: [
      ...gates.observations(),
      ...requests.map((request): EvidenceObservation => ({ kind: "request", request })),
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

async function validateProviderToken(
  tokens: OAuthTokens,
  metadata: AuthorizationServerMetadata,
  clientInfo: OAuthClientInformationMixed,
  target: McpAccessGrantTarget,
): Promise<{ status: GateStatus; detail: string; evidence?: Record<string, unknown> }> {
  if (!metadata.jwks_uri) {
    return {
      status: "not-proven",
      detail: "Authorization server metadata did not advertise a JWKS URI.",
    };
  }

  try {
    const jwks = createRemoteJWKSet(new URL(String(metadata.jwks_uri)));
    const verified = await jwtVerify(tokens.access_token, jwks, {
      issuer: metadata.issuer,
      audience: target.canonicalResource,
    });
    const now = Math.floor(Date.now() / 1000);
    const payload = verified.payload;
    const subject = typeof payload.sub === "string" && payload.sub.length > 0;
    const clientId = typeof payload.client_id === "string" ? payload.client_id : undefined;
    const times = typeof payload.exp === "number" && payload.exp > now &&
      typeof payload.iat === "number" && payload.iat <= now + 60;
    const asymmetric = !verified.protectedHeader.alg.startsWith("HS");
    const clientContext = clientId === clientInfo.client_id;

    if (!asymmetric || !subject || !times || !clientContext) {
      return {
        status: "fail",
        detail: "Provider token signature was readable but did not satisfy asymmetric key, subject, time, or client context checks.",
        evidence: {
          alg: verified.protectedHeader.alg,
          kidPresent: Boolean(verified.protectedHeader.kid),
          issuer: metadata.issuer,
          audience: target.canonicalResource,
          subjectPresent: subject,
          timeClaimsValid: times,
          clientContextMatches: clientContext,
        },
      };
    }

    return {
      status: "pass",
      detail: "Provider-issued access token verified locally with asymmetric JWKS, issuer, Canonical Resource audience, subject, time, and client context checks.",
      evidence: {
        alg: verified.protectedHeader.alg,
        kidPresent: Boolean(verified.protectedHeader.kid),
        issuer: metadata.issuer,
        audience: target.canonicalResource,
        subjectPresent: subject,
        timeClaimsValid: times,
        clientContextMatches: clientContext,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      detail: `Local provider-token verification failed: ${errorDetail(error)}`,
    };
  }
}

async function probeRegistrationConstraints(
  registrationEndpoint: string,
  metadata: OAuthClientMetadata,
  requests: RequestEvidence[],
): Promise<{ status: GateStatus; detail: string; evidence: Record<string, unknown> }> {
  const results: Array<Record<string, unknown>> = [];
  const fetchFn = createEvidenceFetch(requests);

  for (const registrationCase of buildRegistrationNegativeCases(metadata)) {
    const requestStart = requests.length;
    try {
      const response = await fetchFn(registrationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationCase.metadata),
      });
      const request = requests[requestStart];
      const observedError = request?.responseBody?.error ?? request?.responseBody?.error_code ?? request?.responseBody?.error_description ?? "unavailable";
      results.push({
        id: registrationCase.id,
        status: classifyRegistrationProbe(response.status, observedError),
        observedStatus: response.status,
        observedError,
      });
    } catch {
      const request = requests[requestStart];
      results.push({
        id: registrationCase.id,
        status: "not-proven",
        observedStatus: request?.status ?? "unavailable",
        observedError: request?.networkError ?? "registration request failed",
      });
    }
  }

  const accepted = results.filter((result) => result.status === "accepted");
  const unproven = results.filter((result) => result.status === "not-proven");
  const status: GateStatus = accepted.length > 0 ? "fail" : unproven.length > 0 ? "not-proven" : "pass";
  return {
    status,
    detail: status === "pass"
      ? "The public registration endpoint rejected every unsupported, malformed, and unsafe client metadata variant."
      : status === "fail"
        ? "The public registration endpoint accepted at least one unsupported, malformed, or unsafe client metadata variant."
        : "At least one public registration negative case could not be observed to completion.",
    evidence: {
      registrationEndpoint: sanitizeUrl(registrationEndpoint),
      cases: results,
    },
  };
}

function clientMarker(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "target";
}

function familyName(host: LoopbackHost): "ipv4" | "ipv6" {
  return host === "127.0.0.1" ? "ipv4" : "ipv6";
}

function clientMetadataFor(
  target: McpAccessGrantTarget,
  host: LoopbackHost,
  registrationRedirectUri: string,
  sdkVersion: string,
  logoUri: string,
  scenario: "approval" | "denial" | "abandonment" = "approval",
): OAuthClientMetadata {
  const suffix = `${clientMarker(target.name)}-${familyName(host)}-${scenario}`;
  return buildPublicNativeClientMetadata({
    registrationRedirectUri,
    clientName: `MCP Compatibility Client ${suffix}`,
    clientUri: `https://mcp-compatibility.example.test/${suffix}/about`,
    logoUri,
    softwareId: "betterr-me-mcp-access-grant-compatibility",
    softwareVersion: sdkVersion,
  });
}

interface ConsentPageSnapshot extends ConsentPresentationObservation {
  bodyText: string;
}

async function inspectConsentPage(
  page: Page,
  metadata: OAuthClientMetadata,
  callbackBeforeDecision: boolean,
): Promise<ConsentPageSnapshot> {
  const bodyText = await page.locator("body").innerText();
  const clientUri = typeof metadata.client_uri === "string" ? metadata.client_uri : "";
  const logoUri = typeof metadata.logo_uri === "string" ? metadata.logo_uri : "";
  const softwareId = typeof metadata.software_id === "string" ? metadata.software_id : "";
  const softwareVersion = typeof metadata.software_version === "string" ? metadata.software_version : "";
  const clientUriLinkVisible = clientUri.length > 0 && await page.locator("a").evaluateAll(
    (elements, expectedUri) => elements.some((element) =>
      element.getAttribute("href") === expectedUri &&
      Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight),
    ),
    clientUri,
  );
  const logoVisible = logoUri.length > 0 && await page.locator("img").evaluateAll(
    (elements, expectedUri) => elements.some((element) =>
      element.getAttribute("src") === expectedUri &&
      Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight) &&
      (element as HTMLImageElement).complete &&
      (element as HTMLImageElement).naturalWidth > 0 &&
      (element as HTMLImageElement).naturalHeight > 0,
    ),
    logoUri,
  );
  const affirmativeControlVisible = await page.getByRole("button", {
    name: /^(allow|approve|authorize|grant|continue)$/i,
  }).count() > 0;
  const denialControlVisible = await page.getByRole("button", {
    name: /^(deny|reject|cancel)$/i,
  }).count() > 0;
  const clientName = typeof metadata.client_name === "string" ? metadata.client_name : "";
  const clientNameIndex = clientName ? bodyText.indexOf(clientName) : -1;
  const clientDisclosureText = clientNameIndex === -1
    ? ""
    : bodyText.slice(Math.max(0, clientNameIndex - 600), clientNameIndex + clientName.length + 900);
  const untrustedDisclaimerVisible = /\b(?:unverified|untrusted|not verified|not endorsed|cannot verify|not approved|not trusted)\b/i.test(clientDisclosureText);
  const clientEndorsementLanguage = hasUnnegatedEndorsementLanguage(clientDisclosureText);
  const providerEndorsementLanguage = bodyText.split(/[.!?]\s+/).some((segment) => {
    const mentionsProviderEndorsement = /\b(?:verified|endorsed|approved|trusted|recommended|sponsored|official(?:ly)?|partner)\b[\s\S]{0,60}\bbetterr\.?me\b|\bbetterr\.?me\b[\s\S]{0,60}\b(?:verified|endorsed|approved|trusted|recommended|sponsored|official(?:ly)?|partner)\b/i.test(segment);
    return mentionsProviderEndorsement && hasUnnegatedEndorsementLanguage(segment);
  });
  const endorsementLanguageVisible = clientEndorsementLanguage || providerEndorsementLanguage;

  return {
    bodyText,
    clientNameVisible: typeof metadata.client_name === "string" && bodyText.includes(metadata.client_name),
    clientUriVisible: clientUriLinkVisible || bodyText.includes(clientUri),
    logoVisible,
    softwareIdVisible: softwareId.length > 0 && bodyText.includes(softwareId),
    softwareVersionVisible: softwareVersion.length > 0 && bodyText.includes(softwareVersion),
    untrustedDisclaimerVisible,
    endorsementLanguageVisible,
    affirmativeControlVisible,
    denialControlVisible,
    callbackBeforeDecision,
  };
}

async function navigateToConsent(
  page: Page,
  authorizationUrl: URL,
  target: McpAccessGrantTarget,
  metadata: OAuthClientMetadata,
  callbackBeforeDecision: boolean,
): Promise<ConsentPageSnapshot> {
  await page.goto(authorizationUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const email = page.locator('input[type="email"], input[name="email"], #email').first();
  const password = page.locator('input[type="password"], input[name="password"], #password').first();
  const emailCount = await email.count();
  const passwordCount = await password.count();

  if (emailCount > 0 && target.email) {
    await email.fill(target.email);
  }
  if (passwordCount > 0 && target.password) {
    await password.fill(target.password);
  }
  if (emailCount > 0 || passwordCount > 0) {
    const submit = page.getByRole("button", { name: /sign in|log in|continue|submit/i }).first();
    if (await submit.count() > 0) {
      await submit.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
  }

  return inspectConsentPage(page, metadata, callbackBeforeDecision);
}

interface RegisteredConsentClient {
  clientMetadata: OAuthClientMetadata;
  clientInformation: OAuthClientInformationMixed;
  registrationEvidence: Record<string, unknown>;
}

async function registerConsentScenarioClient(
  kind: "denial" | "abandonment",
  host: LoopbackHost,
  target: McpAccessGrantTarget,
  metadata: AuthorizationServerMetadata,
  resourceMetadata: OAuthProtectedResourceMetadata | undefined,
  sdkVersion: string,
  logoUri: string,
  requests: RequestEvidence[],
  gates: GateAccumulator,
): Promise<RegisteredConsentClient | undefined> {
  const family = familyName(host);
  const registrationRedirectUri = buildLoopbackUrls(host, 0).registrationUrl;
  const clientMetadata = clientMetadataFor(target, host, registrationRedirectUri, sdkVersion, logoUri, kind);
  const registrationStart = requests.length;
  let clientInformation: OAuthClientInformationMixed | undefined;
  let registrationError: string | undefined;

  try {
    clientInformation = await registerClient(metadata.issuer, {
      metadata,
      clientMetadata,
      scope: resourceMetadata?.scopes_supported?.join(" "),
      fetchFn: createEvidenceFetch(requests),
    });
  } catch (error) {
    registrationError = errorDetail(error);
  }

  const registrationRequest = requests.slice(registrationStart).find((request) =>
    request.method === "POST" && request.url === sanitizeUrl(metadata.registration_endpoint ?? ""),
  );
  const registrationObserved = Boolean(registrationRequest);
  const validation = validatePublicClientProfile(clientInformation, host);
  const registrationStatus = classifyPublicRegistrationBoundary(
    registrationObserved,
    Boolean(clientInformation && validation.accepted),
    registrationRequest?.status,
    registrationRequest?.networkError,
  );
  const registrationEvidence = {
    registrationEndpoint: metadata.registration_endpoint ? sanitizeUrl(metadata.registration_endpoint) : "unavailable",
    registrationObserved,
    registrationStatus,
    registrationRedirectUri,
    requestBodyFields: registrationRequest?.requestBodyFields ?? [],
    clientMetadata: {
      clientName: clientMetadata.client_name,
      clientUri: clientMetadata.client_uri,
      logoUri: clientMetadata.logo_uri,
      softwareId: clientMetadata.software_id,
      softwareVersion: clientMetadata.software_version,
    },
    ...validation,
    returnedClientId: Boolean(clientInformation?.client_id),
  } satisfies Record<string, unknown>;

  if (registrationStatus !== "pass" || !clientInformation) {
    addGate(
      gates,
      `consent-${kind}-${family}`,
      registrationStatus,
      registrationError
        ? `Fresh ${kind} consent-client registration failed at the public boundary: ${registrationError}`
        : registrationStatus === "not-proven"
          ? `Fresh ${kind} consent-client registration was unavailable or ambiguous at the public boundary.`
          : `Fresh ${kind} consent-client registration did not return the required public native profile.`,
      registrationEvidence,
    );
    return undefined;
  }

  return { clientMetadata, clientInformation, registrationEvidence };
}

function tokenEvidenceObserved(requests: RequestEvidence[], tokenEndpoint: string): {
  tokenRequestObserved: boolean;
  accessTokenObserved: boolean;
  refreshTokenObserved: boolean;
  idTokenObserved: boolean;
} {
  const tokenRequests = requests.filter((request) =>
    request.method === "POST" && request.url === sanitizeUrl(tokenEndpoint),
  );
  return {
    tokenRequestObserved: tokenRequests.length > 0,
    accessTokenObserved: tokenRequests.some((request) => Boolean(request.responseBody && "access_token" in request.responseBody)),
    refreshTokenObserved: tokenRequests.some((request) => Boolean(request.responseBody && "refresh_token" in request.responseBody)),
    idTokenObserved: tokenRequests.some((request) => Boolean(request.responseBody && "id_token" in request.responseBody)),
  };
}

async function runConsentRejection(
  kind: "denial" | "abandonment",
  host: LoopbackHost,
  target: McpAccessGrantTarget,
  metadata: AuthorizationServerMetadata,
  clientMetadata: OAuthClientMetadata,
  clientInformation: OAuthClientInformationMixed,
  registrationEvidence: Record<string, unknown>,
  page: Page,
  requests: RequestEvidence[],
  gates: GateAccumulator,
): Promise<void> {
  const family = familyName(host);
  const gateId = `consent-${kind}-${family}`;
  const callback = new LoopbackCallback(host);
  const requestStart = requests.length;
  const stopBrowserTokenRequests = captureBrowserTokenRequests(page, metadata.token_endpoint, requests);

  try {
    await callback.listen();
    const authorizationState = randomUUID();
    const authorization = await startAuthorization(metadata.issuer, {
      metadata,
      clientInformation,
      redirectUrl: callback.url,
      state: authorizationState,
      resource: new URL(target.canonicalResource),
    });
    const snapshot = await navigateToConsent(
      page,
      authorization.authorizationUrl,
      target,
      clientMetadata,
      callback.callbackReceived,
    );
    const presentationStatus = classifyConsentPresentation(snapshot);

    if (kind === "denial") {
      const deny = page.getByRole("button", { name: /^(deny|reject|cancel)$/i }).first();
      if (presentationStatus !== "pass" || await deny.count() === 0) {
        addGate(gates, gateId, "fail", "The denial journey did not expose the same explicit, untrusted consent boundary as the approval journey.", {
          presentationStatus,
          consentControlsVisible: snapshot.affirmativeControlVisible && snapshot.denialControlVisible,
          registration: registrationEvidence,
        });
        return;
      }
      await deny.click();
    } else {
      if (presentationStatus !== "pass") {
        addGate(gates, gateId, "fail", "The abandoned journey did not reach an explicit, untrusted consent boundary before the browser interaction was abandoned.", {
          presentationStatus,
          registration: registrationEvidence,
        });
        return;
      }
      await page.goto("about:blank");
    }

    const callbackResult = await callback.wait(kind === "denial" ? 10_000 : 1_000);
    const callbackReceived = callback.callbackReceived;
    const credentials = tokenEvidenceObserved(requests.slice(requestStart), metadata.token_endpoint);
    const browserFragmentCredentials = browserUrlCredentialEvidence(page.url());
    const stateMatches = callbackResult.state === authorizationState;
    const callbackStatus = classifyAuthorizationOutcome({
      kind,
      callbackReceived,
      authorizationError: callbackResult.oauthError === true,
      stateMatches,
      authorizationCodePresent: Boolean(callbackResult.code) || browserFragmentCredentials.authorizationCodePresent,
      tokenRequestObserved: credentials.tokenRequestObserved,
      accessTokenObserved: credentials.accessTokenObserved || Boolean(callbackResult.accessTokenPresent) || browserFragmentCredentials.accessTokenPresent,
      refreshTokenObserved: credentials.refreshTokenObserved || Boolean(callbackResult.refreshTokenPresent) || browserFragmentCredentials.refreshTokenPresent,
      idTokenObserved: credentials.idTokenObserved || Boolean(callbackResult.idTokenPresent) || browserFragmentCredentials.idTokenPresent,
      browserFragmentCredentialObserved: browserFragmentCredentials.credentialObserved,
    });
    const grantObservation = await inspectGrantForClient(target, clientInformation.client_id, requests);
    const unexpectedGrantCleanup = grantObservation.status === "present"
      ? await revokeGrantForClient(target, clientInformation.client_id, undefined, requests)
      : undefined;
    const status: GateStatus = callbackStatus === "fail"
      ? "fail"
      : grantObservation.status === "absent"
        ? callbackStatus
        : grantObservation.status === "present"
          ? "fail"
          : "not-proven";
    addGate(
      gates,
      gateId,
      status,
      kind === "denial"
        ? status === "pass"
          ? "Explicit denial returned the provider authorization error without credentials and left no grant in the supported user-facing grant list."
          : "Explicit denial did not produce the required provider authorization error without credentials and grant absence."
        : status === "pass"
          ? "Abandoning the consent page produced no callback, credentials, token request, or grant in the supported user-facing grant list."
          : "Abandoning the consent page produced a callback, usable credentials, or an unclassified/present grant.",
      {
        registration: registrationEvidence,
        decision: kind,
        callbackReceived,
        observedAuthorizationError: callbackResult.oauthError === true ? callbackResult.error : "none",
        authorizationCodePresent: Boolean(callbackResult.code) || browserFragmentCredentials.authorizationCodePresent,
        stateMatches,
        tokenRequestObserved: credentials.tokenRequestObserved,
        accessTokenObserved: credentials.accessTokenObserved || Boolean(callbackResult.accessTokenPresent) || browserFragmentCredentials.accessTokenPresent,
        refreshTokenObserved: credentials.refreshTokenObserved || Boolean(callbackResult.refreshTokenPresent) || browserFragmentCredentials.refreshTokenPresent,
        idTokenObserved: credentials.idTokenObserved || Boolean(callbackResult.idTokenPresent) || browserFragmentCredentials.idTokenPresent,
        browserFragmentCredentialObserved: browserFragmentCredentials.credentialObserved,
        browserFragmentKeys: browserFragmentCredentials.fragmentKeys,
        callbackStatus,
        grantStatus: grantObservation.status,
        grantEvidence: grantObservation.evidence,
        unexpectedGrantCleanup: unexpectedGrantCleanup
          ? { status: unexpectedGrantCleanup.status, detail: unexpectedGrantCleanup.detail, evidence: unexpectedGrantCleanup.evidence }
          : "not-needed",
      },
    );
  } catch (error) {
    addGate(gates, gateId, "fail", `Consent ${kind} boundary failed: ${errorDetail(error)}`, {
      registration: registrationEvidence,
      host,
      callbackPath: DEFAULT_LOOPBACK_CALLBACK_PATH,
    });
  } finally {
    stopBrowserTokenRequests();
    await callback.close();
  }
}

function addFamilyDownstreamNotProven(
  gates: GateAccumulator,
  family: "ipv4" | "ipv6",
  reason: string,
): void {
  for (const id of [
    `untrusted-client-metadata-${family}`,
    `authorization-consent-${family}`,
    `loopback-${family}`,
    `loopback-request-${family}`,
    `loopback-pkce-${family}`,
    `delegated-token-validation-${family}`,
    `authenticated-mcp-operation-${family}`,
    `consent-denial-${family}`,
    `consent-abandonment-${family}`,
    `consent-cleanup-${family}`,
  ]) {
    if (!gates.has(id)) {
      addGate(gates, id, "not-proven", reason, { reached: false, observedBoundary: "not-reached" });
    }
  }
}

function addAllLoopbackFamiliesNotProven(
  gates: GateAccumulator,
  reason: string,
): void {
  for (const host of LOOPBACK_HOSTS) {
    const family = familyName(host);
    const evidence = { reached: false, observedBoundary: "not-reached" };
    addGate(gates, `public-client-registration-${family}`, "not-proven", reason, evidence);
    addGate(gates, `registration-negative-validation-${family}`, "not-proven", reason, evidence);
    addGate(gates, `loopback-${family}`, "not-proven", reason, evidence);
    addGate(gates, `loopback-request-${family}`, "not-proven", reason, evidence);
    addFamilyDownstreamNotProven(gates, family, reason);
  }
}

function aggregateFamilyGate(
  gates: GateAccumulator,
  id: string,
  familyIds: string[],
  detail: string,
): void {
  const familyGates = familyIds.map((familyId) => gates.get(familyId));
  const status: GateStatus = familyGates.some((gate) => gate?.status === "fail")
    ? "fail"
    : familyGates.some((gate) => gate?.status === "not-proven" || !gate)
      ? "not-proven"
      : "pass";
  addGate(gates, id, status, detail, {
    families: familyGates.map((gate, index) => ({
      family: familyIds[index].replace(/^.*-/, ""),
      status: gate?.status ?? "not-proven",
    })),
  });
}

interface FamilyRunResult {
  clientMetadata: OAuthClientMetadata;
  clientInformation?: OAuthClientInformationMixed;
  canRunConsentRejections: boolean;
}

async function runLoopbackFamily(
  host: LoopbackHost,
  target: McpAccessGrantTarget,
  metadata: AuthorizationServerMetadata,
  resourceMetadata: OAuthProtectedResourceMetadata | undefined,
  sdkVersion: string,
  logoUri: string,
  page: Page,
  requests: RequestEvidence[],
  gates: GateAccumulator,
): Promise<FamilyRunResult> {
  const family = familyName(host);
  const registrationRedirectUri = buildLoopbackUrls(host, 0).registrationUrl;
  const clientMetadata = clientMetadataFor(target, host, registrationRedirectUri, sdkVersion, logoUri);
  const loopback = new LoopbackCallback(host);
  let loopbackBindError: unknown;
  try {
    await loopback.listen();
  } catch (error) {
    loopbackBindError = error;
  }
  let clientInformation: OAuthClientInformationMixed | undefined;
  let validation: PublicClientProfileValidation = validatePublicClientProfile(undefined, host);
  let registrationError: string | undefined;
  const registrationStart = requests.length;

  try {
    clientInformation = await registerClient(metadata.issuer, {
      metadata,
      clientMetadata,
      scope: resourceMetadata?.scopes_supported?.join(" "),
      fetchFn: createEvidenceFetch(requests),
    });
    validation = validatePublicClientProfile(clientInformation, host);
  } catch (error) {
    registrationError = errorDetail(error);
  }

  const registrationObserved = requests.slice(registrationStart).some((request) =>
    request.method === "POST" && request.url === sanitizeUrl(metadata.registration_endpoint ?? ""),
  );
  const registrationRequest = requests.slice(registrationStart).find((request) =>
    request.method === "POST" && request.url === sanitizeUrl(metadata.registration_endpoint ?? ""),
  );
  const registrationStatus = classifyPublicRegistrationBoundary(
    registrationObserved,
    Boolean(clientInformation && validation.accepted),
    registrationRequest?.status,
    registrationRequest?.networkError,
  );
  addGate(
    gates,
    `public-client-registration-${family}`,
    registrationStatus,
    registrationStatus === "pass"
      ? "Official MCP SDK registration accepted the authorization-code/code public native profile without a client secret and with a host/path-only loopback redirect."
      : registrationStatus === "not-proven"
        ? `The public registration boundary was unavailable or ambiguous; the required public native profile was not proven${registrationError ? `: ${registrationError}` : "."}`
        : registrationError
          ? `The public registration boundary did not return the required public native profile: ${registrationError}`
          : "The public registration boundary did not return the required public native profile.",
    {
      registrationEndpoint: metadata.registration_endpoint ? sanitizeUrl(metadata.registration_endpoint) : "unavailable",
      registrationObserved,
      registrationStatus,
      registrationRedirectUri,
      requestBodyFields: registrationRequest?.requestBodyFields ?? [],
      clientMetadata: {
        clientName: clientMetadata.client_name,
        clientUri: clientMetadata.client_uri,
        logoUri: clientMetadata.logo_uri,
        softwareId: clientMetadata.software_id,
        softwareVersion: clientMetadata.software_version,
      },
      ...validation,
      returnedRedirectUris: Array.isArray((clientInformation as Record<string, unknown> | undefined)?.redirect_uris)
        ? ((clientInformation as Record<string, unknown>).redirect_uris as unknown[]).map((uri) =>
          typeof uri === "string" ? sanitizeUrl(uri) : "[REDACTED]",
        )
        : [],
    },
  );

  if (!metadata.registration_endpoint) {
    addGate(gates, `registration-negative-validation-${family}`, "not-proven", "Authorization-server metadata did not advertise a public registration endpoint.");
  } else {
    const negative = await probeRegistrationConstraints(metadata.registration_endpoint, clientMetadata, requests);
    addGate(gates, `registration-negative-validation-${family}`, negative.status, negative.detail, negative.evidence);
  }

  if (loopbackBindError) {
    const detail = `Request-time ${family} loopback port could not be bound; this is a hard compatibility failure: ${errorDetail(loopbackBindError)}`;
    addGate(gates, `loopback-${family}`, "fail", detail, {
      host,
      callbackPath: DEFAULT_LOOPBACK_CALLBACK_PATH,
      portSelection: "failed",
    });
    addGate(gates, `loopback-request-${family}`, "fail", detail);
    addGate(gates, `loopback-pkce-${family}`, "fail", detail);
    addFamilyDownstreamNotProven(gates, family, "The request-time loopback port was unavailable for this address family.");
    await loopback.close();
    return { clientMetadata, clientInformation, canRunConsentRejections: false };
  }

  if (!clientInformation || !validation.accepted) {
    addFamilyDownstreamNotProven(gates, family, "Public registration or dedicated browser credentials were not proven; downstream consent gates were not attempted.");
    await loopback.close();
    return { clientMetadata, clientInformation, canRunConsentRejections: false };
  }
  const canRunConsentRejections = Boolean(target.email && target.password);

  let initialClient: Client | undefined;
  let initialTransport: StreamableHTTPClientTransport | undefined;
  let stopBrowserTokenRequests: (() => void) | undefined;
  let issuedTokens: OAuthTokens | undefined;
  try {
    const provider = new CompatibilityOAuthProvider(
      loopback.url,
      clientMetadata,
    );
    provider.saveClientInformation(clientInformation);
    initialClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
    initialTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), {
      authProvider: provider,
      fetch: createEvidenceFetch(requests),
    });
    let initialConnectError: unknown;

    try {
      await initialClient.connect(initialTransport);
    } catch (error) {
      initialConnectError = error;
    }

    const authorizationUrl = provider.authorizationRequestUrl;
    if (!authorizationUrl) {
      const detail = initialConnectError
        ? `Official MCP SDK did not produce an authorization redirect: ${errorDetail(initialConnectError)}`
        : "MCP endpoint connected without the required delegated authorization challenge.";
      addGate(gates, `loopback-${family}`, "not-proven", detail);
      addGate(gates, `loopback-request-${family}`, "not-proven", detail);
      addGate(gates, `loopback-pkce-${family}`, "fail", detail);
      addFamilyDownstreamNotProven(gates, family, "No authorization redirect was produced for this loopback family.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const authorizationQuery = authorizationUrl.searchParams;
    const authorizationEndpoint = new URL(metadata.authorization_endpoint);
    const requestTimeCallback = buildLoopbackUrls(host, Number(new URL(loopback.url).port));
    const pkceRequestValid = authorizationUrl.origin === authorizationEndpoint.origin &&
      authorizationUrl.pathname === authorizationEndpoint.pathname &&
      authorizationQuery.get("response_type") === "code" &&
      authorizationQuery.get("code_challenge_method") === "S256" &&
      authorizationQuery.get("redirect_uri") === requestTimeCallback.callbackUrl &&
      authorizationQuery.get("resource") === target.canonicalResource &&
      requestTimeCallback.registrationUrl === registrationRedirectUri &&
      new URL(requestTimeCallback.callbackUrl).port !== "";
    const loopbackRequestEvidence = {
      host,
      callbackPath: DEFAULT_LOOPBACK_CALLBACK_PATH,
      registrationRedirectUri,
      requestTimeCallbackUrl: requestTimeCallback.callbackUrl,
      authorizationEndpoint: sanitizeUrl(authorizationUrl),
      responseType: authorizationQuery.get("response_type") ?? "missing",
      codeChallengeMethod: authorizationQuery.get("code_challenge_method") ?? "missing",
      resource: authorizationQuery.get("resource") ? sanitizeUrl(authorizationQuery.get("resource") as string) : "missing",
      portSelectedAtRequest: new URL(requestTimeCallback.callbackUrl).port !== "",
    };
    addGate(
      gates,
      `loopback-request-${family}`,
      pkceRequestValid ? "pass" : "fail",
      pkceRequestValid
        ? `Authorization request used the registered ${family} loopback host and callback path with a request-time port, code response, exact Canonical Resource, and S256 PKCE.`
        : `Authorization request did not preserve the registered ${family} loopback host/path, request-time port, exact resource, code response, and S256 PKCE parameters.`,
      loopbackRequestEvidence,
    );
    if (!pkceRequestValid) {
      addGate(gates, `loopback-${family}`, "fail", "The authorization request did not preserve the required loopback host, callback path, or request-time port.", loopbackRequestEvidence);
      addGate(gates, `loopback-pkce-${family}`, "fail", "The authorization request did not satisfy the loopback or PKCE contract.", loopbackRequestEvidence);
      addFamilyDownstreamNotProven(gates, family, "The authorization request did not satisfy the loopback or PKCE contract.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    if (!canRunConsentRejections) {
      addGate(gates, `loopback-${family}`, "not-proven", "The authorization request was valid, but the callback and code exchange were not attempted because dedicated browser credentials were not supplied.", loopbackRequestEvidence);
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "The authorization request was valid, but the public-client callback and PKCE exchange were not attempted because dedicated browser credentials were not supplied.", loopbackRequestEvidence);
      addFamilyDownstreamNotProven(gates, family, "The public authorization request was reached, but dedicated browser credentials were not supplied for consent gates.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const consentRequestStart = requests.length;
    stopBrowserTokenRequests = captureBrowserTokenRequests(page, metadata.token_endpoint, requests);
    let snapshot: ConsentPageSnapshot;
    try {
      snapshot = await navigateToConsent(page, authorizationUrl, target, clientMetadata, loopback.callbackReceived);
    } catch (error) {
      addGate(gates, `untrusted-client-metadata-${family}`, "fail", `Consent metadata could not be inspected in the browser: ${errorDetail(error)}`);
      addGate(gates, `authorization-consent-${family}`, "fail", `Browser consent flow failed before a decision: ${errorDetail(error)}`);
      addGate(gates, `loopback-${family}`, "not-proven", "The browser consent page was not reached, so the request-time loopback callback was not exercised.", loopbackRequestEvidence);
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "The browser consent page was not reached, so the public-client callback and PKCE exchange were not exercised.", loopbackRequestEvidence);
      addFamilyDownstreamNotProven(gates, family, "Browser consent was not reached.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const presentationStatus = classifyConsentPresentation(snapshot);
    addGate(
      gates,
      `untrusted-client-metadata-${family}`,
      presentationStatus,
      presentationStatus === "pass"
        ? "Consent visibly presented the Registered MCP Client name, logo, and URL as untrusted claims without BetterR.Me endorsement language."
        : "Consent did not visibly present all Registered MCP Client claims as untrusted, or exposed endorsement language.",
      {
        clientName: clientMetadata.client_name,
        clientUri: clientMetadata.client_uri,
        logoUri: clientMetadata.logo_uri,
        softwareId: clientMetadata.software_id,
        softwareVersion: clientMetadata.software_version,
        clientNameVisible: snapshot.clientNameVisible,
        clientUriVisible: snapshot.clientUriVisible,
        logoVisible: snapshot.logoVisible,
        softwareIdVisible: snapshot.softwareIdVisible,
        softwareVersionVisible: snapshot.softwareVersionVisible,
        untrustedDisclaimerVisible: snapshot.untrustedDisclaimerVisible,
        endorsementLanguageVisible: snapshot.endorsementLanguageVisible,
      },
    );
    const callbackBeforeDecision = loopback.callbackReceived;
    const preDecisionCredentials = tokenEvidenceObserved(
      requests.slice(consentRequestStart),
      metadata.token_endpoint,
    );
    const approve = page.getByRole("button", { name: /^(allow|approve|authorize|grant|continue)$/i }).first();
    if (presentationStatus !== "pass" || await approve.count() === 0 || callbackBeforeDecision || preDecisionCredentials.tokenRequestObserved) {
      addGate(
        gates,
        `authorization-consent-${family}`,
        "fail",
        "Browser authorization did not require a distinct affirmative consent decision before a callback or token request.",
        {
          explicitConsentControls: snapshot.affirmativeControlVisible && snapshot.denialControlVisible,
          callbackBeforeDecision,
          preDecisionTokenRequestObserved: preDecisionCredentials.tokenRequestObserved,
          preDecisionAccessTokenObserved: preDecisionCredentials.accessTokenObserved,
          preDecisionRefreshTokenObserved: preDecisionCredentials.refreshTokenObserved,
          preDecisionIdTokenObserved: preDecisionCredentials.idTokenObserved,
        },
      );
      addFamilyDownstreamNotProven(gates, family, "The browser consent boundary was not proven before approval.");
      addGate(gates, `loopback-${family}`, "not-proven", "The browser consent boundary stopped before the request-time loopback callback was exercised.", loopbackRequestEvidence);
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "The browser consent boundary stopped before the public-client callback and PKCE exchange were exercised.", loopbackRequestEvidence);
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const preDecisionGrant = await inspectGrantForClient(target, clientInformation.client_id, requests);
    if (preDecisionGrant.status !== "absent") {
      const grantStatus: GateStatus = preDecisionGrant.status === "present" ? "fail" : "not-proven";
      addGate(
        gates,
        `authorization-consent-${family}`,
        grantStatus,
        grantStatus === "fail"
          ? "The supported user-facing grant list already contained this registered MCP client before affirmative consent, so a fresh consent gate was not proven."
          : "The supported user-facing grant list was unavailable before affirmative consent, so grant absence was not proven.",
        {
          explicitConsentControls: snapshot.affirmativeControlVisible && snapshot.denialControlVisible,
          preDecisionGrantStatus: preDecisionGrant.status,
          ...preDecisionGrant.evidence,
        },
      );
      addFamilyDownstreamNotProven(gates, family, "The user-facing grant list did not prove grant absence before the affirmative consent decision.");
      addGate(gates, `loopback-${family}`, "not-proven", "The grant-absence precondition stopped the browser consent journey before the request-time callback was exercised.", loopbackRequestEvidence);
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "The grant-absence precondition stopped the public-client callback and PKCE exchange.", loopbackRequestEvidence);
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    await approve.click();
    const callback = await loopback.wait(CALLBACK_WAIT_TIMEOUT_MS);
    addGate(
      gates,
      `loopback-${family}`,
      loopback.callbackReceived ? "pass" : "not-proven",
      loopback.callbackReceived
        ? `The ${family} request-time loopback callback reached the exact registered host and callback path.`
        : `The ${family} request-time loopback callback was not observed within the bounded browser-flow wait.`,
      { ...loopbackRequestEvidence, callbackReceived: loopback.callbackReceived },
    );
    const stateMatches = callback.state === authorizationQuery.get("state");
    const callbackCredentialPresent = Boolean(
      callback.accessTokenPresent || callback.refreshTokenPresent || callback.idTokenPresent,
    );
    const consentStatus: GateStatus = callback.error || !callback.code || !stateMatches || callbackCredentialPresent ? "fail" : "pass";
    addGate(
      gates,
      `authorization-consent-${family}`,
      consentStatus,
      consentStatus === "pass"
        ? `Authenticated browser user made an explicit affirmative decision and returned a matching-state authorization code through the ${family} loopback callback.`
        : "Browser approval did not return a matching-state authorization code without an authorization error.",
      {
        consentDecision: "affirmative",
        denialControlPresent: snapshot.denialControlVisible,
        callbackReceived: loopback.callbackReceived,
        authorizationError: callback.oauthError === true ? callback.error : "none",
        authorizationCodePresent: Boolean(callback.code),
        stateMatches,
        accessTokenPresent: Boolean(callback.accessTokenPresent),
        refreshTokenPresent: Boolean(callback.refreshTokenPresent),
        idTokenPresent: Boolean(callback.idTokenPresent),
      },
    );
    if (consentStatus !== "pass" || !callback.code) {
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "Affirmative consent did not return a usable authorization code for the public-client PKCE exchange.", {
        ...loopbackRequestEvidence,
        callbackReceived: loopback.callbackReceived,
        authorizationCodePresent: Boolean(callback.code),
      });
      addFamilyDownstreamNotProven(gates, family, "Affirmative consent did not return a usable authorization code.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    try {
      await initialTransport.finishAuth(callback.code);
    } catch (error) {
      addGate(gates, `loopback-pkce-${family}`, "fail", `Public-client authorization-code exchange failed: ${errorDetail(error)}`);
      addFamilyDownstreamNotProven(gates, family, "Authorization-code exchange did not complete.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const tokens = provider.tokens();
    issuedTokens = tokens;
    const tokenRequest = [...requests].reverse().find((request) =>
      request.method === "POST" && request.url === sanitizeUrl(metadata.token_endpoint),
    );
    const expectedTokenRedirectUri = sanitizeUrl(requestTimeCallback.callbackUrl);
    const expectedTokenResource = sanitizeUrl(target.canonicalResource);
    const tokenRequestClientIdMatches = tokenRequest?.requestClientId === clientInformation.client_id;
    const tokenRequestRedirectUriMatches = tokenRequest?.requestRedirectUri === expectedTokenRedirectUri;
    const tokenRequestResourceMatches = tokenRequest?.requestResource === expectedTokenResource;
    const tokenRequestVerifierMatchesChallenge = tokenRequest?.requestCodeVerifierHash === authorizationQuery.get("code_challenge");
    const tokenRequestIsPublicPkce = Boolean(
      tokenRequest &&
        !tokenRequest.authorizationHeaderPresent &&
        tokenRequest.requestGrantType === "authorization_code" &&
        tokenRequestClientIdMatches &&
        tokenRequest.requestCodePresent &&
        tokenRequest.requestCodeVerifierPresent &&
        tokenRequestRedirectUriMatches &&
        tokenRequestResourceMatches &&
        tokenRequestVerifierMatchesChallenge,
    );
    addGate(
      gates,
      `loopback-pkce-${family}`,
      tokenRequestIsPublicPkce ? "pass" : "fail",
      tokenRequestIsPublicPkce
        ? `Authorization code exchange used the ${family} request-time loopback redirect, S256 verifier, exact Canonical Resource, and no token-endpoint client authentication.`
        : "Authorization code exchange did not show the required public-client PKCE request shape.",
      {
        tokenEndpoint: sanitizeUrl(metadata.token_endpoint),
        tokenRequestObserved: Boolean(tokenRequest),
        authorizationHeaderPresent: tokenRequest?.authorizationHeaderPresent ?? false,
        requestBodyFields: tokenRequest?.requestBodyFields ?? [],
        requestGrantType: tokenRequest?.requestGrantType ?? "missing",
        requestClientIdMatches: tokenRequestClientIdMatches,
        requestCodePresent: tokenRequest?.requestCodePresent ?? false,
        requestCodeVerifierPresent: tokenRequest?.requestCodeVerifierPresent ?? false,
        requestRedirectUri: tokenRequest?.requestRedirectUri ?? "missing",
        requestRedirectUriMatches: tokenRequestRedirectUriMatches,
        requestResource: tokenRequest?.requestResource ?? "missing",
        requestResourceMatches: tokenRequestResourceMatches,
        requestCodeVerifierMatchesChallenge: tokenRequestVerifierMatchesChallenge,
      },
    );

    if (!tokens?.access_token || !clientInformation) {
      addGate(gates, `delegated-token-validation-${family}`, "not-proven", "Provider token exchange did not return an access token and registered client context.");
      addGate(gates, `authenticated-mcp-operation-${family}`, "not-proven", "Provider token exchange did not return an access token.");
      return { clientMetadata, clientInformation, canRunConsentRejections };
    }

    const tokenValidation = await validateProviderToken(tokens, metadata, clientInformation, target);
    addGate(gates, `delegated-token-validation-${family}`, tokenValidation.status, tokenValidation.detail, tokenValidation.evidence);

    await initialTransport.close().catch(() => undefined);
    await initialClient.close().catch(() => undefined);
    initialTransport = undefined;
    initialClient = undefined;

    const operationClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
    const operationTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), {
      authProvider: provider,
      fetch: createEvidenceFetch(requests),
    });
    try {
      await operationClient.connect(operationTransport);
      const listed = await operationClient.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === "getProjects") ?? listed.tools[0];
      if (!tool) {
        addGate(gates, `authenticated-mcp-operation-${family}`, "fail", "Authenticated MCP session returned no callable tools.");
      } else {
        const result = await operationClient.callTool({ name: tool.name, arguments: {} });
        addGate(
          gates,
          `authenticated-mcp-operation-${family}`,
          result.isError ? "fail" : "pass",
          result.isError
            ? `Official MCP client callTool(${tool.name}) returned an MCP error.`
            : `Official MCP client completed listTools and callTool(${tool.name}) through the ${family} delegated access grant.`,
          { tool: tool.name, resultIsError: Boolean(result.isError) },
        );
      }
    } catch (error) {
      addGate(gates, `authenticated-mcp-operation-${family}`, "fail", `Authenticated MCP operation failed: ${errorDetail(error)}`);
    } finally {
      await operationTransport.close().catch(() => undefined);
      await operationClient.close().catch(() => undefined);
    }
  } catch (error) {
    if (!gates.has(`loopback-${family}`)) {
      addGate(gates, `loopback-${family}`, loopback.callbackReceived ? "pass" : "not-proven", loopback.callbackReceived
        ? `The ${family} request-time loopback callback reached the exact registered host and callback path.`
        : "The request-time loopback callback was not observed before the loopback journey failed.");
    }
    if (!gates.has(`loopback-request-${family}`)) {
      addGate(gates, `loopback-request-${family}`, "not-proven", "The loopback journey failed before its authorization request could be proven.");
    }
    addGate(gates, `loopback-pkce-${family}`, "fail", `Loopback compatibility journey failed: ${errorDetail(error)}`);
    addFamilyDownstreamNotProven(gates, family, "The loopback compatibility journey stopped before every downstream gate was observed.");
    if (error instanceof UnauthorizedError) {
      addGate(gates, `delegated-token-validation-${family}`, "not-proven", "The official SDK remained unauthorized after the browser flow.");
    }
  } finally {
    stopBrowserTokenRequests?.();
    await initialTransport?.close().catch(() => undefined);
    await initialClient?.close().catch(() => undefined);
    await loopback.close();
    if (issuedTokens?.access_token && clientInformation?.client_id) {
      const cleanup = await revokeGrantForClient(target, clientInformation.client_id, issuedTokens, requests);
      const cleanupStatus: GateStatus = cleanup.status === "absent"
        ? "pass"
        : cleanup.status === "present"
          ? "fail"
          : "not-proven";
      addGate(
        gates,
        `consent-cleanup-${family}`,
        cleanupStatus,
        cleanupStatus === "pass"
          ? cleanup.detail
          : cleanupStatus === "fail"
            ? cleanup.detail
            : `Per-family grant cleanup was not proven: ${cleanup.detail}`,
        cleanup.evidence,
      );
    } else if (!gates.has(`consent-cleanup-${family}`)) {
      addGate(
        gates,
        `consent-cleanup-${family}`,
        "not-proven",
        "No successful public-client token exchange produced a grant that could be cleaned up through the supported user-facing boundary.",
        { issuedAccessToken: false, registeredClientIdPresent: Boolean(clientInformation?.client_id) },
      );
    }
  }

  return { clientMetadata, clientInformation, canRunConsentRejections };
}

export async function runPublicClientLoopbackConsentCompatibility(
  target: McpAccessGrantTarget,
  page: Page,
  testInfo: TestInfo,
): Promise<CompatibilityReport> {
  const startedAt = new Date().toISOString();
  const run: LiveEvidenceRun = {
    issue: "#765",
    startedAt,
    target: {
      name: target.name,
      canonicalResource: sanitizeUrl(target.canonicalResource),
      supabaseUrl: sanitizeUrl(target.supabaseUrl),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
      loopbackHosts: target.loopbackHosts ?? [...LOOPBACK_HOSTS],
    },
    versions: await collectVersions(),
    configuredSecrets: [
      ...SENSITIVE_ENV_NAMES.map((name) => process.env[name] ?? ""),
      target.email ?? "",
      target.password ?? "",
    ],
  };
  const report: CompatibilityReport = {
    issue: run.issue,
    outcome: "not-proven",
    startedAt: run.startedAt,
    finishedAt: startedAt,
    target: run.target,
    versions: run.versions,
    gates: [],
    requests: [],
  };
  const gates = new GateAccumulator();

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
  const nonProduction = isLocalHostname(target.canonicalResource) && isLocalHostname(target.supabaseUrl) &&
    isLocalHostname(target.expectedAuthorizationServer) ||
    process.env.MCP_ACCESS_GRANT_NON_PRODUCTION_ACK === "true";

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
      loopbackHosts: target.loopbackHosts ?? [...LOOPBACK_HOSTS],
      canonicalResource: sanitizeUrl(target.canonicalResource),
      supabaseUrl: sanitizeUrl(target.supabaseUrl),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
    },
  );

  const versionsComplete = Object.entries(report.versions)
    .filter(([key]) => key !== "declared-sdk-range")
    .every(([, value]) => value !== "unavailable");
  addGate(
    gates,
    "versions",
    versionsComplete ? "pass" : "not-proven",
    versionsComplete
      ? "Exact installed SDK, Supabase client, Playwright, MCP handler, CLI, and local provider image versions were recorded."
      : "One or more relevant installed versions could not be read in this environment.",
    report.versions,
  );

  if (!configured || !nonProduction) {
    addAllLoopbackFamiliesNotProven(gates, "Canonical Resource and delegated provider configuration was not ready for the loopback journeys.");
    return finishReport(run, gates, report.requests, testInfo);
  }

  const fetchRequests = report.requests;
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
    addAllLoopbackFamiliesNotProven(gates, "Canonical Resource or delegated provider discovery stopped the loopback journeys before registration.");
    return finishReport(run, gates, report.requests, testInfo);
  }

  const discoveredAuthorizationServer = resourceInfo.authorizationServerUrl;
  const resourceMetadata = resourceInfo.resourceMetadata as OAuthProtectedResourceMetadata | undefined;
  const resourceMatches = resourceMetadata?.resource === target.canonicalResource;
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
    addAllLoopbackFamiliesNotProven(gates, "Protected Resource Metadata did not select the configured delegated provider before loopback registration.");
    return finishReport(run, gates, report.requests, testInfo);
  }

  const metadata = resourceInfo.authorizationServerMetadata;
  if (!metadata) {
    addGate(gates, "provider-discovery", "not-proven", "The official SDK found the delegated issuer but could not obtain authorization-server metadata.");
    addAllLoopbackFamiliesNotProven(gates, "Delegated provider metadata was unavailable before loopback registration.");
    return finishReport(run, gates, report.requests, testInfo);
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
    addAllLoopbackFamiliesNotProven(gates, "Delegated provider metadata did not expose every required public-client capability before loopback registration.");
    return finishReport(run, gates, report.requests, testInfo);
  }

  const configuredLoopbackHosts = target.loopbackHosts ?? [...LOOPBACK_HOSTS];
  for (const host of LOOPBACK_HOSTS) {
    const family = familyName(host);
    if (!configuredLoopbackHosts.includes(host)) {
      addGate(gates, `public-client-registration-${family}`, "not-proven", "This loopback family was not configured for the parameterized compatibility target.");
      addGate(gates, `registration-negative-validation-${family}`, "not-proven", "This loopback family was not configured for the parameterized compatibility target.");
      addGate(gates, `loopback-${family}`, "not-proven", "This loopback family was not configured for the parameterized compatibility target.");
      addGate(gates, `loopback-request-${family}`, "not-proven", "This loopback family was not configured for the parameterized compatibility target.");
      addFamilyDownstreamNotProven(gates, family, "This loopback family was not configured for the parameterized compatibility target.");
      continue;
    }
    const logoFixture = new LogoFixture();
    try {
      await logoFixture.listen();
    } catch (error) {
      const detail = `Harness-controlled consent logo fixture could not be started: ${errorDetail(error)}`;
      addGate(gates, `public-client-registration-${family}`, "not-proven", detail);
      addGate(gates, `registration-negative-validation-${family}`, "not-proven", detail);
      addGate(gates, `loopback-${family}`, "not-proven", detail);
      addGate(gates, `loopback-request-${family}`, "not-proven", detail);
      addGate(gates, `untrusted-client-metadata-${family}`, "fail", detail);
      addFamilyDownstreamNotProven(gates, family, "The consent logo fixture was unavailable, so this browser journey was not attempted.");
      await logoFixture.close();
      continue;
    }

    try {
      const result = await runLoopbackFamily(
        host,
        target,
        metadata,
        resourceMetadata,
        report.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
        logoFixture.url,
        page,
        fetchRequests,
        gates,
      );
      if (result.canRunConsentRejections) {
        for (const kind of ["denial", "abandonment"] as const) {
          const consentClient = await registerConsentScenarioClient(
            kind,
            host,
            target,
            metadata,
            resourceMetadata,
            report.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
            logoFixture.url,
            fetchRequests,
            gates,
          );
          if (consentClient) {
            await runConsentRejection(
              kind,
              host,
              target,
              metadata,
              consentClient.clientMetadata,
              consentClient.clientInformation,
              consentClient.registrationEvidence,
              page,
              fetchRequests,
              gates,
            );
          }
        }
      }
    } finally {
      await logoFixture.close();
    }
  }

  for (const host of LOOPBACK_HOSTS) {
    const family = familyName(host);
    if (!gates.has(`loopback-${family}`)) {
      addGate(gates, `loopback-${family}`, "not-proven", "Loopback family was not reached.");
    }
    if (!gates.has(`loopback-request-${family}`)) {
      addGate(gates, `loopback-request-${family}`, "not-proven", "Loopback authorization request was not reached.");
    }
    if (!gates.has(`loopback-pkce-${family}`)) {
      addGate(gates, `loopback-pkce-${family}`, "not-proven", "Loopback PKCE callback and exchange were not reached.");
    }
  }
  aggregateFamilyGate(gates, "public-client-registration-both", LOOPBACK_HOSTS.map((host) => `public-client-registration-${familyName(host)}`), "Both configured loopback families must return the supported public native registration profile.");
  aggregateFamilyGate(gates, "registration-negative-validation-both", LOOPBACK_HOSTS.map((host) => `registration-negative-validation-${familyName(host)}`), "Both configured loopback registration boundaries must reject unsupported and unsafe metadata.");
  aggregateFamilyGate(gates, "loopback-both", LOOPBACK_HOSTS.map((host) => `loopback-${familyName(host)}`), "Both configured loopback families must bind a request-time callback port on the registered host and path.");
  aggregateFamilyGate(gates, "loopback-request-both", LOOPBACK_HOSTS.map((host) => `loopback-request-${familyName(host)}`), "Both configured loopback families must use the registered host and callback path with a request-time authorization port.");
  aggregateFamilyGate(gates, "untrusted-client-metadata-both", LOOPBACK_HOSTS.map((host) => `untrusted-client-metadata-${familyName(host)}`), "Both browser consent journeys must present Registered MCP Client metadata as untrusted claims.");
  aggregateFamilyGate(gates, "authorization-consent-both", LOOPBACK_HOSTS.map((host) => `authorization-consent-${familyName(host)}`), "Both browser journeys must require an authenticated user's distinct affirmative consent.");
  aggregateFamilyGate(gates, "loopback-pkce-both", LOOPBACK_HOSTS.map((host) => `loopback-pkce-${familyName(host)}`), "Both loopback families must preserve host/path-only registration, request-time ports, exact resource binding, and S256 PKCE.");
  aggregateFamilyGate(gates, "delegated-token-validation-both", LOOPBACK_HOSTS.map((host) => `delegated-token-validation-${familyName(host)}`), "Both loopback journeys must locally validate the provider-issued delegated JWT.");
  aggregateFamilyGate(gates, "authenticated-mcp-operation-both", LOOPBACK_HOSTS.map((host) => `authenticated-mcp-operation-${familyName(host)}`), "Both valid delegated tokens must complete a real official-SDK MCP operation.");
  aggregateFamilyGate(gates, "consent-denial-both", LOOPBACK_HOSTS.map((host) => `consent-denial-${familyName(host)}`), "Both explicit denial journeys must return provider authorization errors without credentials.");
  aggregateFamilyGate(gates, "consent-abandonment-both", LOOPBACK_HOSTS.map((host) => `consent-abandonment-${familyName(host)}`), "Both abandoned consent journeys must produce no callback or credentials.");
  aggregateFamilyGate(gates, "consent-cleanup-both", LOOPBACK_HOSTS.map((host) => `consent-cleanup-${familyName(host)}`), "Both successful public-client journeys must revoke their per-family grant through the supported user-facing boundary.");
  return finishReport(run, gates, report.requests, testInfo);
}
