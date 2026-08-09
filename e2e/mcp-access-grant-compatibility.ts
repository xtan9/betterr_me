import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { Page, Request as PlaywrightRequest, TestInfo } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  discoverOAuthServerInfo,
  refreshAuthorization,
  registerClient,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildLoopbackUrls,
  buildPublicNativeClientMetadata,
  grantClientId,
  type LoopbackHost,
} from "./mcp-access-grant-journey";
import {
  createLiveEvidenceSession,
  type LiveEvidenceRequestCapability,
  type LiveEvidenceRequestObservation,
  type LiveEvidenceSession,
} from "./mcp-access-grant-live-session";
import {
  runAggregateCompatibilityEvidence,
  type AggregateCompatibilityFact,
  type AggregateCompatibilityJsonValue,
  type AggregateCompatibilityRequest,
  type AggregateCompatibilityResponseSurface,
} from "./mcp-access-grant-aggregate-profile";
import { runPublicClientJourney } from "./mcp-access-grant-public-client";
import type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
} from "./mcp-access-grant-target";

export type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
  McpAccessGrantTargetLocality,
} from "./mcp-access-grant-target";

interface CallbackResult {
  readonly callbackUrl?: string;
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}

interface CompatibilityJourneyOptions {
  readonly target: McpAccessGrantTarget;
  readonly page: Page;
  readonly request: LiveEvidenceRequestCapability;
  readonly sdkVersion: string;
  readonly record: (fact: AggregateCompatibilityFact) => Promise<void>;
}

interface RefreshAttempt {
  readonly tokens?: OAuthTokens;
  readonly request?: AggregateCompatibilityRequest;
}

function responseSurface(request: LiveEvidenceRequestObservation | undefined): AggregateCompatibilityResponseSurface | undefined {
  if (!request || (request.status === undefined && request.responseBody === undefined && request.responseLocation === undefined)) return undefined;
  return {
    complete: request.status !== undefined,
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.responseBody !== undefined ? { body: request.responseBody as AggregateCompatibilityJsonValue } : {}),
    ...(request.responseLocation !== undefined ? { location: request.responseLocation } : {}),
  };
}

function requestInput(request: LiveEvidenceRequestObservation | undefined): AggregateCompatibilityRequest | undefined {
  if (!request) return undefined;
  const response = responseSurface(request);
  return {
    method: request.method,
    url: request.url,
    bodyFields: request.requestBodyFields,
    authorizationHeaderPresent: request.authorizationHeaderPresent,
    ...(request.requestClientId !== undefined ? { requestClientId: request.requestClientId } : {}),
    ...(request.requestGrantType !== undefined ? { requestGrantType: request.requestGrantType } : {}),
    ...(request.requestRedirectUri !== undefined ? { requestRedirectUri: request.requestRedirectUri } : {}),
    ...(request.requestResource !== undefined ? { requestResource: request.requestResource } : {}),
    ...(request.requestCodeChallengeMethod !== undefined ? { requestCodeChallengeMethod: request.requestCodeChallengeMethod } : {}),
    ...(request.requestCodeChallengePresent !== undefined ? { requestCodeChallengePresent: request.requestCodeChallengePresent } : {}),
    ...(request.requestCodePresent !== undefined ? { requestCodePresent: request.requestCodePresent } : {}),
    ...(request.requestCodeVerifierPresent !== undefined ? { requestCodeVerifierPresent: request.requestCodeVerifierPresent } : {}),
    ...(request.requestCodeVerifierHash !== undefined ? { requestCodeVerifierHash: request.requestCodeVerifierHash } : {}),
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(response !== undefined ? { response } : {}),
  };
}

function requestFromUrl(url: URL): AggregateCompatibilityRequest {
  return { method: "GET", url: url.toString(), bodyFields: [], authorizationHeaderPresent: false };
}

function endpointRequest(request: LiveEvidenceRequestCapability, method: string, endpoint: string): LiveEvidenceRequestObservation | undefined {
  return request.latest((current) => current.method === method && current.url === endpoint);
}

function requestFields(body: string | null | undefined): string[] {
  if (!body) return [];
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.keys(parsed).sort();
  } catch {
    // OAuth request bodies are usually form encoded.
  }
  return [...new URLSearchParams(body).keys()].sort();
}

function observeBrowserRequest(request: LiveEvidenceRequestCapability, browserRequest: PlaywrightRequest): void {
  const headers = browserRequest.headers();
  request.observe({
    method: browserRequest.method(),
    url: browserRequest.url(),
    requestBodyFields: requestFields(browserRequest.postData()),
    authorizationHeaderPresent: Object.keys(headers).some((key) => key.toLowerCase() === "authorization"),
  });
}

class LoopbackCallback {
  private readonly server = createServer((request, response) => this.handleRequest(request, response));
  private readonly resultPromise: Promise<CallbackResult>;
  private resolveResult!: (result: CallbackResult) => void;
  private result?: CallbackResult;
  private port = 0;

  constructor(private readonly host: LoopbackHost = "127.0.0.1") {
    this.resultPromise = new Promise<CallbackResult>((resolve) => { this.resolveResult = resolve; });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        this.server.removeListener("listening", handleListening);
        reject(error);
      };
      const handleListening = (): void => {
        this.server.removeListener("error", handleError);
        this.port = (this.server.address() as AddressInfo).port;
        resolve();
      };
      this.server.once("error", handleError);
      this.server.once("listening", handleListening);
      this.server.listen(0, this.host);
    });
  }

  get url(): string { return buildLoopbackUrls(this.host, this.port).callbackUrl; }

  async wait(timeoutMs = 60_000): Promise<CallbackResult> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.resultPromise,
        new Promise<CallbackResult>((resolve) => { timeout = setTimeout(() => resolve({ callbackUrl: this.url }), timeoutMs); }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const result: CallbackResult = {
      callbackUrl: requestUrl.toString(),
      code: requestUrl.searchParams.get("code") ?? undefined,
      state: requestUrl.searchParams.get("state") ?? undefined,
      error: requestUrl.searchParams.get("error") ?? undefined,
    };
    if (result.code || result.error) {
      if (!this.result) { this.result = result; this.resolveResult(result); }
      response.writeHead(result.error ? 400 : 200, { "content-type": "text/plain" });
      response.end(result.error ? "Authorization was not completed." : "Authorization callback received.");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found.");
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
    private readonly clientMetadataValue: OAuthClientMetadata,
  ) {}

  get redirectUrl(): string { return this.callbackUrl; }
  get clientMetadata(): OAuthClientMetadata { return this.clientMetadataValue; }
  state(): string { return randomUUID(); }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.clientInfo; }
  saveClientInformation(value: OAuthClientInformationMixed): void { this.clientInfo = value; }
  tokens(): OAuthTokens | undefined { return this.tokenInfo; }
  saveTokens(value: OAuthTokens): void { this.tokenInfo = value; }
  redirectToAuthorization(value: URL): void { this.authorizationUrl = value; }
  saveCodeVerifier(value: string): void { this.verifier = value; }
  codeVerifier(): string {
    if (!this.verifier) throw new Error("OAuth SDK did not save a PKCE verifier");
    return this.verifier;
  }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery; }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.discovery = value; }
  get authorizationRequestUrl(): URL | undefined { return this.authorizationUrl; }
}

function familyMetadata(target: McpAccessGrantTarget, callbackUrl: string, sdkVersion: string): OAuthClientMetadata {
  return buildPublicNativeClientMetadata({
    registrationRedirectUri: callbackUrl,
    clientName: `MCP Compatibility Client ${target.name}`,
    clientUri: "https://mcp-compatibility.example.test/aggregate/about",
    logoUri: "https://mcp-compatibility.example.test/aggregate/logo.svg",
    softwareId: "betterr-me-mcp-access-grant-compatibility",
    softwareVersion: sdkVersion,
  });
}

function tokenRequest(request: LiveEvidenceRequestCapability, endpoint: string): LiveEvidenceRequestObservation | undefined {
  return endpointRequest(request, "POST", endpoint);
}

function credentialSnapshot(tokens: OAuthTokens | undefined): Record<string, string> {
  return {
    ...(tokens?.access_token ? { accessToken: tokens.access_token } : {}),
    ...(tokens?.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
  };
}

async function refreshAttempt(
  metadata: AuthorizationServerMetadata,
  clientInformation: OAuthClientInformationMixed,
  target: McpAccessGrantTarget,
  refreshTokenValue: string,
  request: LiveEvidenceRequestCapability,
): Promise<RefreshAttempt> {
  try {
    const tokens = await refreshAuthorization(metadata.issuer, {
      metadata,
      clientInformation,
      refreshToken: refreshTokenValue,
      resource: new URL(target.canonicalResource),
      fetchFn: request.fetch,
    });
    return { tokens, request: requestInput(tokenRequest(request, metadata.token_endpoint)) };
  } catch {
    return { request: requestInput(tokenRequest(request, metadata.token_endpoint)) };
  }
}

async function runGrantBoundary(
  target: McpAccessGrantTarget,
  clientInformation: OAuthClientInformationMixed,
  tokens: OAuthTokens,
  request: LiveEvidenceRequestCapability,
  record: (fact: AggregateCompatibilityFact) => Promise<void>,
): Promise<void> {
  if (!target.anonKey) return;
  const createManagementClient = async (): Promise<SupabaseClient | undefined> => {
    const client = createClient(target.supabaseUrl, target.anonKey as string, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch: request.fetch },
    });
    const result = await client.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? "" });
    return result.error ? undefined : client;
  };
  const client = await createManagementClient();
  if (!client) return;
  try {
    const listed = await client.auth.oauth.listGrants();
    const grants = (listed.data ?? []) as readonly unknown[];
    const listRequest = request.latest((current) => current.method === "GET" && current.url.includes("/auth/v1/user/oauth/grants"));
    const grant = grants.find((candidate) => grantClientId(candidate) === clientInformation.client_id);
    await record({
      kind: "grant",
      role: "identify",
      observation: {
        listRequestObserved: listRequest !== undefined,
        listResponse: responseSurface(listRequest),
        listResponseStatus: listRequest?.status,
        listedClientIds: grants.map(grantClientId).filter((id): id is string => id !== undefined),
        listedGrantIds: grants.map((candidate) => candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).id === "string" ? (candidate as Record<string, string>).id : undefined).filter((id): id is string => id !== undefined),
        grantId: grant && typeof grant === "object" && typeof (grant as Record<string, unknown>).id === "string" ? (grant as Record<string, string>).id : undefined,
        grantClientId: grant ? grantClientId(grant) : clientInformation.client_id,
        clientId: clientInformation.client_id,
        grantPresent: grant !== undefined,
      },
      request: requestInput(listRequest),
    });
    if (grant) {
      const revoke = await client.auth.oauth.revokeGrant({ clientId: clientInformation.client_id });
      const revokeRequest = request.latest((current) => current.method === "DELETE" && current.url.includes("/auth/v1/user/oauth/grants"));
      await record({
        kind: "grant",
        role: "revoke",
        observation: {
          listRequestObserved: listRequest !== undefined,
          listResponse: responseSurface(listRequest),
          listResponseStatus: listRequest?.status,
          listedClientIds: [clientInformation.client_id],
          grantId: typeof (grant as Record<string, unknown>).id === "string" ? (grant as Record<string, string>).id : undefined,
          grantClientId: clientInformation.client_id,
          clientId: clientInformation.client_id,
          grantPresent: true,
          revokeRequestObserved: revokeRequest !== undefined,
          revokeObserved: revokeRequest !== undefined,
          revokeResponse: responseSurface(revokeRequest),
          revokeResponseStatus: revokeRequest?.status,
        },
        request: requestInput(revokeRequest) ?? requestInput(listRequest),
      });
      void revoke;
    }
    const afterResult = await client.auth.oauth.listGrants();
    const after = (afterResult.data ?? []) as readonly unknown[];
    const afterRequest = request.latest((current) => current.method === "GET" && current.url.includes("/auth/v1/user/oauth/grants"));
    await record({
      kind: "cleanup",
      role: "final",
      observation: {
        listRequestObserved: afterRequest !== undefined,
        remainingClientIds: after.map(grantClientId).filter((id): id is string => id !== undefined),
        remainingGrantIds: after.map((candidate) => candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).id === "string" ? (candidate as Record<string, string>).id : undefined).filter((id): id is string => id !== undefined),
        grantPresent: after.some((candidate) => grantClientId(candidate) === clientInformation.client_id),
        requestStatus: afterRequest?.status,
        response: responseSurface(afterRequest),
      },
      request: requestInput(afterRequest),
    });
  } catch {
    // The capability retains any partial list/revoke request observations.
  }
}

async function recordNegativeRequests(
  options: CompatibilityJourneyOptions,
  authorizationUrl: URL,
  authorizationCode: string | undefined,
  clientInformation: OAuthClientInformationMixed,
  metadata: AuthorizationServerMetadata,
): Promise<void> {
  const { target, request, record } = options;
  const pkceCases: Array<{ readonly id: "missing-code-challenge" | "plain-code-challenge-method" | "missing-code-verifier" | "incorrect-code-verifier"; readonly url?: URL; readonly body?: URLSearchParams }> = [
    { id: "missing-code-challenge", url: new URL(authorizationUrl) },
    { id: "plain-code-challenge-method", url: new URL(authorizationUrl) },
    { id: "missing-code-verifier", body: new URLSearchParams({ client_id: clientInformation.client_id, code: authorizationCode ?? "", grant_type: "authorization_code", redirect_uri: authorizationUrl.searchParams.get("redirect_uri") ?? "", resource: target.canonicalResource }) },
    { id: "incorrect-code-verifier", body: new URLSearchParams({ client_id: clientInformation.client_id, code: authorizationCode ?? "", code_verifier: "A".repeat(43), grant_type: "authorization_code", redirect_uri: authorizationUrl.searchParams.get("redirect_uri") ?? "", resource: target.canonicalResource }) },
  ];
  pkceCases[0].url?.searchParams.delete("code_challenge");
  pkceCases[0].url?.searchParams.delete("code_challenge_method");
  pkceCases[1].url?.searchParams.set("code_challenge_method", "plain");
  for (const current of pkceCases) {
    const start = request.snapshot().length;
    try {
      await request.fetch(current.url ?? metadata.token_endpoint, current.body ? { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: current.body } : undefined);
    } catch {
      // Raw failure remains in the request capability.
    }
    const observed = request.snapshot().slice(start).at(-1);
    await record({ kind: "pkce", role: "negative", caseId: current.id, response: responseSurface(observed), request: requestInput(observed) });
  }

  const resourceCases: Array<{ readonly id: "missing-resource" | "generic-resource" | "inferred-resource" | "unrelated-resource"; readonly value?: string }> = [
    { id: "missing-resource" },
    { id: "generic-resource", value: "mcp" },
    { id: "inferred-resource", value: authorizationUrl.origin },
    { id: "unrelated-resource", value: "https://unrelated.example/mcp" },
  ];
  for (const current of resourceCases) {
    const url = new URL(authorizationUrl);
    url.searchParams.delete("resource");
    if (current.value !== undefined) url.searchParams.set("resource", current.value);
    const start = request.snapshot().length;
    try { await request.fetch(url); } catch { /* Boundary response is retained. */ }
    const observed = request.snapshot().slice(start).at(-1);
    await record({ kind: "resource-binding", role: "negative", caseId: current.id, response: responseSurface(observed), request: requestInput(observed) });
  }

  const delegatedCases = [
    "modified-signature", "unexpected-algorithm", "unexpected-key", "wrong-issuer", "missing-subject", "missing-audience", "generic-audience", "inferred-resource-audience", "unrelated-resource-audience", "invalid-time", "missing-client-context",
  ] as const;
  for (const caseId of delegatedCases) {
    const start = request.snapshot().length;
    try {
      await request.fetch(target.canonicalResource, { method: "POST", headers: { authorization: `Bearer ${caseId}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: caseId, method: "tools/list", params: {} }) });
    } catch {
      // Boundary response is retained.
    }
    const observed = request.snapshot().slice(start).at(-1);
    await record({ kind: "delegated-token", role: "negative", caseId, response: responseSurface(observed), request: requestInput(observed) });
  }
}

async function runCompatibilityJourney(options: CompatibilityJourneyOptions): Promise<void> {
  const { target, page, request, record, sdkVersion } = options;
  let resourceInfo: Awaited<ReturnType<typeof discoverOAuthServerInfo>> | undefined;
  try { resourceInfo = await discoverOAuthServerInfo(new URL(target.canonicalResource), { fetchFn: request.fetch }); } catch { /* Primitive discovery facts remain below. */ }
  const resourceMetadata = resourceInfo?.resourceMetadata as OAuthProtectedResourceMetadata | undefined;
  const metadata = resourceInfo?.authorizationServerMetadata;
  const resourceRequest = request.latest((current) => { try { return new URL(current.url).pathname.endsWith("/.well-known/oauth-protected-resource"); } catch { return false; } });
  const providerRequest = request.latest((current) => { try { return new URL(current.url).pathname.endsWith("/.well-known/oauth-authorization-server"); } catch { return false; } });
  await record({ kind: "resource-discovery", role: "primary", advertisedResource: resourceMetadata?.resource, advertisedAuthorizationServer: resourceInfo?.authorizationServerUrl, response: responseSurface(resourceRequest), request: requestInput(resourceRequest) });
  await record({ kind: "provider-discovery", role: "primary", issuer: metadata?.issuer, authorizationEndpoint: metadata?.authorization_endpoint, registrationEndpoint: metadata?.registration_endpoint, tokenEndpoint: metadata?.token_endpoint, jwksUri: typeof metadata?.jwks_uri === "string" ? metadata.jwks_uri : undefined, grantTypesSupported: metadata?.grant_types_supported, responseTypesSupported: metadata?.response_types_supported, tokenEndpointAuthMethodsSupported: metadata?.token_endpoint_auth_methods_supported, codeChallengeMethodsSupported: metadata?.code_challenge_methods_supported, response: responseSurface(providerRequest), request: requestInput(providerRequest) });
  if (!metadata?.issuer || !metadata.authorization_endpoint || !metadata.registration_endpoint || !metadata.token_endpoint) return;

  const callback = new LoopbackCallback();
  try { await callback.listen(); } catch { return; }
  let client: Client | undefined;
  let transport: StreamableHTTPClientTransport | undefined;
  let provider: CompatibilityOAuthProvider | undefined;
  let clientInformation: OAuthClientInformationMixed | undefined;
  try {
    const clientMetadata = familyMetadata(target, callback.url, sdkVersion);
    const registrationStart = request.snapshot().length;
    try {
      clientInformation = await registerClient(metadata.issuer, { metadata, clientMetadata, scope: resourceMetadata?.scopes_supported?.join(" "), fetchFn: request.fetch });
    } catch { /* Primitive request retains the failed registration. */ }
    const registrationRequest = request.snapshot().slice(registrationStart).find((current) => current.method === "POST" && current.url === metadata.registration_endpoint);
    await record({ kind: "registration", role: "primary", response: responseSurface(registrationRequest), request: requestInput(registrationRequest) });
    if (!clientInformation) return;
    provider = new CompatibilityOAuthProvider(callback.url, clientMetadata);
    provider.saveClientInformation(clientInformation);
    client = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: sdkVersion });
    transport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), { authProvider: provider, fetch: request.fetch });
    try { await client.connect(transport); } catch { /* OAuth redirect is retained by the provider. */ }
    const authorizationUrl = provider.authorizationRequestUrl;
    if (!authorizationUrl) {
      await record({ kind: "authorization", role: "primary", observation: { authorizationRequestObserved: false, callbackReceived: false } });
      return;
    }
    const authorizationRequest = requestFromUrl(authorizationUrl);
    await record({ kind: "loopback", role: "request", observation: { registeredRedirectUri: callback.url, requestCallbackUrl: authorizationUrl.searchParams.get("redirect_uri") ?? callback.url, requestResource: authorizationUrl.searchParams.get("resource") ?? undefined, portSelectedAtRequest: Boolean(new URL(callback.url).port) }, request: authorizationRequest });
    if (!target.email || !target.password) {
      await recordNegativeRequests(options, authorizationUrl, undefined, clientInformation, metadata);
      await record({ kind: "authorization", role: "primary", observation: { authorizationRequestObserved: true, authorizationEndpoint: authorizationUrl.origin + authorizationUrl.pathname, responseType: authorizationUrl.searchParams.get("response_type") ?? undefined, redirectUri: authorizationUrl.searchParams.get("redirect_uri") ?? undefined, resource: authorizationUrl.searchParams.get("resource") ?? undefined, codeChallenge: authorizationUrl.searchParams.get("code_challenge") ?? undefined, codeChallengeMethod: authorizationUrl.searchParams.get("code_challenge_method") ?? undefined, callbackReceived: false }, request: authorizationRequest });
      return;
    }
    const tokenListener = (browserRequest: PlaywrightRequest): void => {
      try {
        const endpoint = new URL(metadata.token_endpoint);
        const actual = new URL(browserRequest.url());
        if (browserRequest.method() === "POST" && actual.origin === endpoint.origin && actual.pathname === endpoint.pathname) observeBrowserRequest(request, browserRequest);
      } catch { /* Non-token browser request. */ }
    };
    page.on("request", tokenListener);
    try {
      await page.goto(authorizationUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      const email = page.locator('input[type="email"], input[name="email"], #email').first();
      const password = page.locator('input[type="password"], input[name="password"], #password').first();
      if (await email.count() > 0) await email.fill(target.email);
      if (await password.count() > 0) await password.fill(target.password);
      if (await email.count() > 0 || await password.count() > 0) {
        const submit = page.getByRole("button", { name: /sign in|log in|continue|submit/i }).first();
        if (await submit.count() > 0) { await submit.click(); await page.waitForLoadState("domcontentloaded").catch(() => undefined); }
      }
      const approve = page.getByRole("button", { name: /^(allow|approve|authorize|grant|continue)$/i }).first();
      if (await approve.count() === 0) return;
      await approve.click();
      const callbackResultValue = await callback.wait();
      const authorizationObservation = { authorizationRequestObserved: true, authorizationEndpoint: authorizationUrl.origin + authorizationUrl.pathname, responseType: authorizationUrl.searchParams.get("response_type") ?? undefined, redirectUri: authorizationUrl.searchParams.get("redirect_uri") ?? undefined, resource: authorizationUrl.searchParams.get("resource") ?? undefined, codeChallenge: authorizationUrl.searchParams.get("code_challenge") ?? undefined, codeChallengeMethod: authorizationUrl.searchParams.get("code_challenge_method") ?? undefined, callbackReceived: Boolean(callbackResultValue.code || callbackResultValue.error), callbackUrl: callbackResultValue.callbackUrl, callbackState: callbackResultValue.state };
      // The authorization fact is recorded once after the browser boundary settles.
      await record({ kind: "authorization", role: "primary", observation: authorizationObservation, request: authorizationRequest });
      await record({ kind: "loopback", role: "callback", observation: { registeredRedirectUri: callback.url, callbackUrl: callbackResultValue.callbackUrl, callbackReceived: Boolean(callbackResultValue.code || callbackResultValue.error) } });
      if (!callbackResultValue.code || callbackResultValue.error) return;
      await recordNegativeRequests(options, authorizationUrl, callbackResultValue.code, clientInformation, metadata);
      await transport.finishAuth(callbackResultValue.code);
      const tokens = provider.tokens();
      const tokenObservation = tokenRequest(request, metadata.token_endpoint);
      await record({ kind: "pkce", role: "positive", observation: { method: authorizationUrl.searchParams.get("code_challenge_method") ?? undefined, requestResource: tokenObservation?.requestResource, redirectUri: tokenObservation?.requestRedirectUri, authorizationRequest }, request: requestInput(tokenObservation) });
      let jwks: string | AggregateCompatibilityJsonValue | undefined;
      if (metadata.jwks_uri) {
        try { const response = await request.fetch(String(metadata.jwks_uri)); jwks = await response.clone().text(); } catch { /* Raw JWKS request is retained. */ }
      }
      await record({ kind: "delegated-token", role: "validation", token: tokens?.access_token, jwks, request: requestInput(tokenObservation) });
      if (!tokens?.access_token) return;

      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      client = undefined;
      transport = undefined;
      const operationClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: sdkVersion });
      const operationTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), { authProvider: provider, fetch: request.fetch });
      try {
        await operationClient.connect(operationTransport);
        const listed = await operationClient.listTools();
        const tool = listed.tools.find((candidate) => candidate.name === "getProjects") ?? listed.tools[0];
        const result = tool ? await operationClient.callTool({ name: tool.name, arguments: {} }) : undefined;
        const operationRequest = request.latest((current) => current.method === "POST" && current.url === target.canonicalResource);
        await record({ kind: "mcp-operation", role: "authenticated", observation: { operationUrl: target.canonicalResource, operationResource: target.canonicalResource, connected: true, listToolsCompleted: true, callToolCompleted: tool !== undefined, resultIsError: result ? Boolean(result.isError) : true }, request: requestInput(operationRequest) });
      } finally {
        await operationTransport.close().catch(() => undefined);
        await operationClient.close().catch(() => undefined);
      }

      const rootTokens = tokens;
      await record({ kind: "refresh", role: "root", observation: { initial: credentialSnapshot(rootTokens) }, request: requestInput(tokenObservation) });
      if (rootTokens.refresh_token && clientInformation) {
        const registeredClient = clientInformation;
        const first = await refreshAttempt(metadata, registeredClient, target, rootTokens.refresh_token, request);
        const second = first.tokens?.refresh_token ? await refreshAttempt(metadata, registeredClient, target, first.tokens.refresh_token, request) : undefined;
        await record({ kind: "refresh", role: "replacement", observation: { firstReplacement: { previous: credentialSnapshot(rootTokens), replacement: credentialSnapshot(first.tokens), response: first.request?.response }, secondReplacement: second ? { previous: credentialSnapshot(first.tokens), replacement: credentialSnapshot(second.tokens), response: second.request?.response } : undefined } });
        const replayCandidates = [
          { label: "root", refreshToken: rootTokens.refresh_token },
          { label: "replacement", refreshToken: first.tokens?.refresh_token },
          { label: "second-replacement", refreshToken: second?.tokens?.refresh_token },
        ].filter((candidate): candidate is { readonly label: string; readonly refreshToken: string } => candidate.refreshToken !== undefined);
        const attempts = await replayCandidates.reduce<Promise<readonly { readonly label: string; readonly refreshToken: string; readonly response?: AggregateCompatibilityResponseSurface }[]>>(async (pending, candidate) => {
          const current = await pending;
          const replay = await refreshAttempt(metadata, registeredClient, target, candidate.refreshToken, request);
          return [...current, { label: candidate.label, refreshToken: candidate.refreshToken, response: replay.request?.response }];
        }, Promise.resolve([]));
        await record({ kind: "refresh", role: "replay", observation: { attempts } });
        const latestTokens = second?.tokens ?? first.tokens ?? rootTokens;
        await runGrantBoundary(target, registeredClient, latestTokens, request, record);
        if (latestTokens.refresh_token) {
          const postRefresh = await refreshAttempt(metadata, registeredClient, target, latestTokens.refresh_token, request);
          await record({ kind: "post-revocation", role: "refresh", observation: { response: postRefresh.request?.response }, request: postRefresh.request });
        }
        const postAccessRequestStart = request.snapshot().length;
        try { await request.fetch(target.canonicalResource, { method: "POST", headers: { authorization: `Bearer ${latestTokens.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "post-revocation", method: "tools/list", params: {} }) }); } catch { /* Boundary response retained. */ }
        const postAccess = request.snapshot().slice(postAccessRequestStart).at(-1);
        await record({ kind: "post-revocation", role: "access", observation: { response: responseSurface(postAccess), accessToken: latestTokens.access_token }, request: requestInput(postAccess) });
      }
    } finally {
      page.off("request", tokenListener);
    }
  } finally {
    await transport?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await callback.close();
  }
}

export async function runMcpAccessGrantCompatibility(
  target: McpAccessGrantTarget,
  page: Page,
  testInfo: TestInfo,
  targetConfiguration: McpAccessGrantTargetConfiguration,
): Promise<Awaited<ReturnType<typeof runAggregateCompatibilityEvidence>>["report"]> {
  const session: LiveEvidenceSession = createLiveEvidenceSession({ target, targetConfiguration, testInfo });
  const options = await session.aggregateCompatibilityOptions();
  const result = await runAggregateCompatibilityEvidence(options, async (recorders) => {
    await recorders.compatibility.record({ kind: "configuration", role: "snapshot", observation: { loopbackHosts: session.target.loopbackHosts, providerCredentialsAvailable: Boolean(session.target.email && session.target.password) } });
    await recorders.compatibility.record({ kind: "versions", role: "snapshot", values: options.versions });
    await runPublicClientJourney({
      target: session.target,
      page,
      request: session.capabilities.request,
      sdkVersion: options.versions["@modelcontextprotocol/sdk"] ?? "unavailable",
      record: recorders.publicClient.record,
    });
    await runCompatibilityJourney({ target: session.target, page, request: session.capabilities.request, sdkVersion: options.versions["@modelcontextprotocol/sdk"] ?? "unavailable", record: recorders.compatibility.record });
  });
  return result.report;
}
