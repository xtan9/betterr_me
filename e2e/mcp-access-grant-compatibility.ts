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

import {
  evaluateDelegatedJwtPolicy,
  isExactCanonicalResource,
  publicBoundaryRejects,
  s256CodeChallenge,
  selectDelegatedSigningJwk,
  type DelegatedJwk,
  type DelegatedJwtClaims,
  type DelegatedJwtHeader,
} from "./mcp-access-grant-policy";

export type GateStatus = "pass" | "fail" | "not-proven";

export interface CompatibilityGate {
  id: string;
  status: GateStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface McpAccessGrantTarget {
  name: string;
  canonicalResource: string;
  supabaseUrl: string;
  expectedAuthorizationServer: string;
  email?: string;
  password?: string;
}

export interface CompatibilityReport {
  issue: string;
  outcome: "passed" | "blocked" | "not-proven";
  startedAt: string;
  finishedAt: string;
  target: {
    name: string;
    canonicalResource: string;
    supabaseUrl: string;
    expectedAuthorizationServer: string;
  };
  versions: Record<string, string>;
  gates: CompatibilityGate[];
  requests: RequestEvidence[];
}

interface RequestEvidence {
  method: string;
  url: string;
  requestBodyFields: string[];
  authorizationHeaderPresent: boolean;
  requestClientIdPresent?: boolean;
  requestCodeChallengeMethod?: string;
  requestCodeChallengePresent?: boolean;
  requestCodePresent?: boolean;
  requestCodeVerifierPresent?: boolean;
  requestGrantType?: string;
  requestRedirectUri?: string;
  requestResource?: string;
  requestCodeVerifierMatchesChallenge?: boolean;
  status?: number;
  responseLocation?: string;
  responseBody?: Record<string, unknown>;
  responseCredentialFields?: string[];
  responseContainsCredentials?: boolean;
  networkError?: string;
}

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
  "reproducible-configuration",
  "sanitized-evidence",
  "versions",
] as const;

const SAFE_RESPONSE_KEYS = new Set([
  "authorization_endpoint",
  "authorization_servers",
  "code_challenge_methods_supported",
  "error",
  "error_code",
  "grant_types_supported",
  "issuer",
  "jwks_uri",
  "msg",
  "registration_endpoint",
  "resource",
  "response_types_supported",
  "scopes_supported",
  "token_endpoint",
  "token_endpoint_auth_methods_supported",
]);

const SENSITIVE_ENV_NAMES = [
  "MCP_TEST_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "API_KEY_HMAC_SECRET",
];

let activeTargetSecrets: string[] = [];
const requestCodeVerifierChallenges = new WeakMap<RequestEvidence, string>();
const requestRawClientIds = new WeakMap<RequestEvidence, string>();
const requestRawResources = new WeakMap<RequestEvidence, string>();

function addGate(
  gates: CompatibilityGate[],
  id: string,
  status: GateStatus,
  detail: string,
  evidence?: Record<string, unknown>,
): void {
  const existing = gates.findIndex((gate) => gate.id === id);
  const gate = { id, status, detail, ...(evidence ? { evidence } : {}) };

  if (existing === -1) {
    gates.push(gate);
  } else {
    gates[existing] = gate;
  }
}

function sanitizeText(value: string): string {
  let sanitized = value;

  const configuredSecrets = SENSITIVE_ENV_NAMES.map((name) => process.env[name]);
  for (const secret of [...configuredSecrets, ...activeTargetSecrets]) {
    if (secret && secret.length >= 4) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }

  return sanitized
    .replace(/(access_token|refresh_token|client_secret|code_verifier|password|authorization)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT REDACTED]");
}

function sanitizeUrl(value: string | URL): string {
  try {
    const url = new URL(value.toString());
    const safeQueryKeys = new Set([
      "code_challenge_method",
      "grant_type",
      "redirect_uri",
      "response_type",
      "resource",
      "scope",
    ]);
    const query = new URLSearchParams();

    for (const [key, queryValue] of url.searchParams) {
      query.set(
        key,
        safeQueryKeys.has(key)
          ? key === "redirect_uri" || key === "resource"
            ? sanitizeUrl(queryValue)
            : sanitizeText(queryValue)
          : "[REDACTED]",
      );
    }

    const queryText = query.toString();
    return `${url.origin}${url.pathname}${queryText ? `?${queryText}` : ""}`;
  } catch {
    return sanitizeText(value.toString()).replace(/([?&](?:code|state|client_id|code_challenge)=[^&]+)/gi, "$1=[REDACTED]");
  }
}

function safeBodyValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeBodyValue(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^(access_token|refresh_token|client_secret|code_verifier|password|cookie|authorization|secret|token|code)$/i.test(key)) {
        result[key] = "[REDACTED]";
      } else if (SAFE_RESPONSE_KEYS.has(key)) {
        result[key] = safeBodyValue(item);
      }
    }
    return result;
  }

  return value;
}

function summarizeResponseBody(text: string, contentType: string | null): Record<string, unknown> | undefined {
  if (!text) {
    return undefined;
  }

  if (contentType?.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const safe = safeBodyValue(parsed);
      return safe && typeof safe === "object" && !Array.isArray(safe)
        ? (safe as Record<string, unknown>)
        : { type: Array.isArray(safe) ? "array" : typeof safe };
    } catch {
      return { body: "[REDACTED NON-JSON RESPONSE]" };
    }
  }

  return { contentType: contentType ?? "unknown", body: "[REDACTED RESPONSE BODY]" };
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

function createEvidenceFetch(requests: RequestEvidence[]) {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const bodyMetadata = requestBodyMetadata(init?.body);
    const parameters = bodyMetadata.parameters;
    const codeVerifier = parameters?.get("code_verifier");
    const request: RequestEvidence = {
      method: init?.method ?? "GET",
      url: sanitizeUrl(input),
      requestBodyFields: bodyMetadata.fields,
      authorizationHeaderPresent: headers.has("authorization"),
      ...(parameters?.has("client_id") && { requestClientIdPresent: true }),
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
    };
    if (codeVerifier) {
      requestCodeVerifierChallenges.set(request, s256CodeChallenge(codeVerifier));
    }
    const clientId = parameters?.get("client_id");
    if (clientId) requestRawClientIds.set(request, clientId);
    const resource = parameters?.get("resource");
    if (resource) requestRawResources.set(request, resource);
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
          : summarizeResponseBody(responseText, contentType);
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

  return {
    name: typeof raw.name === "string" ? raw.name : `target-${index + 1}`,
    canonicalResource: typeof raw.canonicalResource === "string" ? raw.canonicalResource : "",
    supabaseUrl,
    expectedAuthorizationServer:
      typeof raw.expectedAuthorizationServer === "string" && raw.expectedAuthorizationServer.length > 0
        ? raw.expectedAuthorizationServer
        : deriveAuthorizationServer(supabaseUrl),
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
    private readonly callbackUrl: string,
    private readonly sdkVersion: string,
    private readonly canonicalResource: string,
  ) {}

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "BetterR.Me MCP Access Grant Compatibility Client",
      redirect_uris: [this.callbackUrl],
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

async function writeReport(report: CompatibilityReport, testInfo: TestInfo): Promise<boolean> {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = testInfo.outputPath("mcp-access-grant-evidence.json");
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");

    const configuredPath = process.env.MCP_ACCESS_GRANT_EVIDENCE_PATH;
    if (configuredPath) {
      await mkdir(path.dirname(path.resolve(configuredPath)), { recursive: true });
      await writeFile(path.resolve(configuredPath), serialized, "utf8");
    }

    return !/(Bearer\s+[A-Za-z0-9._~-]{20,}|\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b)/i.test(serialized) &&
      ![...SENSITIVE_ENV_NAMES.map((name) => process.env[name]), ...activeTargetSecrets].some(
        (secret) => Boolean(secret && secret.length >= 4 && serialized.includes(secret)),
      );
  } catch {
    return false;
  }
}

function completeReport(report: CompatibilityReport, gates: CompatibilityGate[]): void {
  for (const id of REQUIRED_GATE_IDS) {
    if (!gates.some((gate) => gate.id === id)) {
      addGate(gates, id, "not-proven", "Gate was not reached because an earlier compatibility gate stopped the run.");
    }
  }

  report.gates = gates;
  report.outcome = gates.some((gate) => gate.status === "fail")
    ? "blocked"
    : gates.some((gate) => gate.status === "not-proven")
      ? "not-proven"
      : "passed";
  report.finishedAt = new Date().toISOString();
}

async function finishReport(
  report: CompatibilityReport,
  gates: CompatibilityGate[],
  testInfo: TestInfo,
): Promise<CompatibilityReport> {
  completeReport(report, gates);
  const sanitized = await writeReport(report, testInfo);
  addGate(
    gates,
    "sanitized-evidence",
    sanitized ? "pass" : "fail",
    sanitized
      ? "Evidence artifact was written without bearer tokens, JWTs, passwords, cookies, or reusable credentials."
      : "Evidence artifact could not be proven free of bearer tokens, JWTs, passwords, cookies, or reusable credentials.",
  );
  completeReport(report, gates);
  await writeReport(report, testInfo);
  return report;
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
  const observedChallenge = request ? requestCodeVerifierChallenges.get(request) : undefined;
  const exactMatch = Boolean(
    request &&
      request.requestCodeVerifierPresent &&
      observedChallenge &&
      challenge &&
      observedChallenge === challenge,
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
  gates: CompatibilityGate[],
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

async function validateProviderToken(
  tokens: OAuthTokens,
  metadata: AuthorizationServerMetadata,
  clientInfo: OAuthClientInformationMixed,
  target: McpAccessGrantTarget,
  tokenRequest: RequestEvidence | undefined,
  requests: RequestEvidence[],
  fetchFn: ReturnType<typeof createEvidenceFetch>,
): Promise<{ status: GateStatus; detail: string; evidence?: Record<string, unknown> }> {
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
    const policyResult = evaluateDelegatedJwtPolicy(
      protectedHeader,
      verified.payload as DelegatedJwtClaims,
      {
        canonicalResource: target.canonicalResource,
        expectedClientId: clientInfo.client_id,
        expectedIssuer: target.expectedAuthorizationServer,
        nowSeconds: Math.floor(Date.now() / 1000),
        tokenRequest: {
          clientId: tokenRequest ? requestRawClientIds.get(tokenRequest) : undefined,
          grantType: tokenRequest?.requestGrantType,
          resource: tokenRequest ? requestRawResources.get(tokenRequest) : undefined,
        },
      },
    );
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

    return {
      status: policyResult.valid && jwksRequestObserved && !providerValidationRoundTrip ? "pass" : "fail",
      detail: policyResult.valid && jwksRequestObserved && !providerValidationRoundTrip
        ? "Provider-issued access token was verified locally with the advertised asymmetric JWKS, allowed algorithm/key, exact issuer/resource audience, subject, time bounds, and registered-client authorization-code context."
        : "Provider JWT verification did not satisfy every local asymmetric-key, claim, or client/grant context gate.",
      evidence,
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
  activeTargetSecrets = [target.email, target.password].filter(
    (secret): secret is string => Boolean(secret),
  );
  const startedAt = new Date().toISOString();
  const report: CompatibilityReport = {
    issue: "#766",
    outcome: "not-proven",
    startedAt,
    finishedAt: startedAt,
    target: {
      name: target.name,
      canonicalResource: sanitizeUrl(target.canonicalResource),
      supabaseUrl: sanitizeUrl(target.supabaseUrl),
      expectedAuthorizationServer: sanitizeUrl(target.expectedAuthorizationServer),
    },
    versions: await collectVersions(),
    gates: [],
    requests: [],
  };
  const gates: CompatibilityGate[] = [];

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
    return finishReport(report, gates, testInfo);
  }

  const loopback = new LoopbackCallback();
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
    return finishReport(report, gates, testInfo);
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
    return finishReport(report, gates, testInfo);
  }

  const metadata = resourceInfo.authorizationServerMetadata;
  if (!metadata) {
    addGate(gates, "provider-discovery", "not-proven", "The official SDK found the delegated issuer but could not obtain authorization-server metadata.");
    return finishReport(report, gates, testInfo);
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
    return finishReport(report, gates, testInfo);
  }

  await loopback.listen();
  const provider = new CompatibilityOAuthProvider(
    loopback.url,
    report.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
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
    addGate(gates, "loopback-pkce", "not-proven", "No authorization redirect was produced because the endpoint did not challenge the client.");
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(report, gates, testInfo);
  }

  if (!provider.authorizationRequestUrl) {
    addGate(gates, "authorization-consent", "fail", `Official SDK did not produce an authorization redirect: ${errorDetail(initialConnectError)}`);
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(report, gates, testInfo);
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
  addGate(
    gates,
    "loopback-pkce",
    pkceRequestValid ? "pass" : "fail",
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
  );

  if (!pkceRequestValid) {
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
    return finishReport(report, gates, testInfo);
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
    return finishReport(report, gates, testInfo);
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
      return finishReport(report, gates, testInfo);
    }

    await approve.click();
    const callback = await loopback.wait();
    if (callback.error || !callback.code) {
      addGate(gates, "authorization-consent", "fail", callback.error ?? "Provider did not return an authorization code to the loopback callback.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
      return finishReport(report, gates, testInfo);
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
      return finishReport(report, gates, testInfo);
    }

    if (!clientInfo) {
      addGate(gates, "pkce-negative-proof", "not-proven", "Registered client context was unavailable for negative proof requests.");
      addGate(gates, "delegated-token-validation", "not-proven", "Registered client context was unavailable for provider-token validation.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
      return finishReport(report, gates, testInfo);
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
          requestRawResources.get(tokenRequest),
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
    addGate(
      gates,
      "loopback-pkce",
      tokenRequestIsPublicPkce ? "pass" : "fail",
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
    );

    if (!tokenRequestIsPublicPkce) {
      addGate(gates, "delegated-token-validation", "not-proven", "Provider-token validation was not attempted after the public PKCE/resource exchange gate failed.");
      addGate(gates, "delegated-token-negative-boundary", "not-proven", "MCP-boundary token probes were not attempted after the public PKCE/resource exchange gate failed.");
      addGate(gates, "authenticated-mcp-operation", "not-proven", "Authenticated MCP operation was not attempted after the public PKCE/resource exchange gate failed.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
      return finishReport(report, gates, testInfo);
    }

    if (!tokens?.access_token || !clientInfo) {
      addGate(gates, "delegated-token-validation", "not-proven", "Provider token exchange did not return an access token and registered client context.");
      addGate(gates, "authenticated-mcp-operation", "not-proven", "Provider token exchange did not return an access token.");
      await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
      return finishReport(report, gates, testInfo);
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
    addGate(gates, "delegated-token-validation", tokenValidation.status, tokenValidation.detail, tokenValidation.evidence);

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
      return finishReport(report, gates, testInfo);
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
  } catch (error) {
    addGate(gates, "authorization-consent", "fail", `Browser authorization flow failed: ${errorDetail(error)}`);
    if (error instanceof UnauthorizedError) {
      addGate(gates, "delegated-token-validation", "not-proven", "The official SDK remained unauthorized after the browser flow.");
    }
  } finally {
    await closeAuthorizationAttempt(initialTransport, initialClient, loopback);
  }

  return finishReport(report, gates, testInfo);
}
