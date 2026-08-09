import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { Page, Request as PlaywrightRequest, TestInfo } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
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
  DEFAULT_LOOPBACK_CALLBACK_PATH,
  buildLoopbackUrls,
  buildPublicNativeClientMetadata,
  buildRegistrationNegativeCases,
  grantClientId,
  LOOPBACK_HOSTS,
  type LoopbackHost,
} from "./mcp-access-grant-journey";
import {
  createLiveEvidenceSession,
  type LiveEvidenceRequestCapability,
  type LiveEvidenceRequestObservation,
  type LiveEvidenceSession,
} from "./mcp-access-grant-live-session";
import { runPublicClientEvidence } from "./mcp-access-grant-public-client-profile";
import type {
  PublicClientAuthorizationOutcomeObservation,
  PublicClientConsentObservation,
  PublicClientGrantObservation,
  PublicClientJourneyFact,
  PublicClientJsonValue,
  PublicClientMcpOperationObservation,
  PublicClientNegativeRegistrationCase,
  PublicClientRequestInput,
  PublicClientResponseSurface,
} from "./mcp-access-grant-public-client-semantics";
import type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
} from "./mcp-access-grant-target";

export type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
  McpAccessGrantTargetLocality,
} from "./mcp-access-grant-target";

const CALLBACK_WAIT_TIMEOUT_MS = 10_000;
const LOGO_FIXTURE_PATH = "/mcp-client-logo.svg";
const LOGO_FIXTURE_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f766e"/><path d="M18 32h28M32 18v28" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`;

interface CallbackResult {
  readonly callbackUrl?: string;
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  readonly oauthError?: boolean;
  readonly accessTokenPresent?: boolean;
  readonly refreshTokenPresent?: boolean;
  readonly idTokenPresent?: boolean;
}

interface ConsentPageSnapshot extends PublicClientConsentObservation {
  readonly bodyText: string;
  readonly affirmativeControlVisible: boolean;
  readonly denialControlVisible: boolean;
}

interface PublicClientJourneyOptions {
  readonly target: McpAccessGrantTarget;
  readonly page: Page;
  readonly request: LiveEvidenceRequestCapability;
  readonly sdkVersion: string;
  readonly record: (fact: PublicClientJourneyFact) => Promise<void>;
}

interface GrantSnapshot {
  readonly grants: readonly unknown[];
  readonly response?: PublicClientResponseSurface;
  readonly request?: PublicClientRequestInput;
  readonly error?: unknown;
}

interface GrantCleanupSnapshot {
  readonly before: GrantSnapshot;
  readonly after: GrantSnapshot;
  readonly grant?: unknown;
  readonly revokeResponse?: PublicClientResponseSurface;
  readonly revokeRequest?: PublicClientRequestInput;
}

function responseSurface(request: LiveEvidenceRequestObservation | undefined): PublicClientResponseSurface | undefined {
  if (!request || (request.status === undefined && request.responseBody === undefined && request.responseLocation === undefined)) return undefined;
  return {
    complete: request.status !== undefined,
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.responseBody !== undefined ? { body: request.responseBody as PublicClientJsonValue } : {}),
    ...(request.responseLocation !== undefined ? { location: request.responseLocation } : {}),
  };
}

function requestInput(request: LiveEvidenceRequestObservation | undefined): PublicClientRequestInput | undefined {
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

function latestInput(
  request: LiveEvidenceRequestCapability,
  predicate: (current: LiveEvidenceRequestObservation) => boolean,
): PublicClientRequestInput | undefined {
  return requestInput(request.latest(predicate));
}

function requestFromUrl(url: URL): PublicClientRequestInput {
  return {
    method: "GET",
    url: url.toString(),
    bodyFields: [],
    authorizationHeaderPresent: false,
  };
}

function requestFields(body: string | null | undefined): string[] {
  if (body === undefined || body === null) return [];
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.keys(parsed).sort();
  } catch {
    // OAuth requests are normally form encoded.
  }
  return [...new URLSearchParams(body).keys()].sort();
}

function observeBrowserRequest(requestCapability: LiveEvidenceRequestCapability, request: PlaywrightRequest): void {
  const headers = request.headers();
  requestCapability.observe({
    method: request.method(),
    url: request.url(),
    requestBodyFields: requestFields(request.postData()),
    authorizationHeaderPresent: Object.keys(headers).some((key) => key.toLowerCase() === "authorization"),
  });
}

function isEndpointRequest(request: LiveEvidenceRequestObservation, method: string, endpoint: string): boolean {
  return request.method === method && request.url === endpoint;
}

function endpointPredicate(method: string, endpoint: string): (request: LiveEvidenceRequestObservation) => boolean {
  return (request) => isEndpointRequest(request, method, endpoint);
}

function metadataRequest(request: LiveEvidenceRequestCapability, suffix: string): PublicClientRequestInput | undefined {
  return latestInput(request, (current) => {
    try {
      return new URL(current.url).pathname.endsWith(suffix);
    } catch {
      return false;
    }
  });
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
          timeout = setTimeout(() => resolve({ callbackUrl: this.url, oauthError: false }), timeoutMs);
        }),
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
    if (requestUrl.pathname !== this.callbackPath) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found.");
      return;
    }
    this.callbackRequestSeen = true;
    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const result = {
      callbackUrl: requestUrl.toString(),
      ...(code ? { code } : {}),
      ...(requestUrl.searchParams.get("state") ? { state: requestUrl.searchParams.get("state") as string } : {}),
      ...(error ? { error, oauthError: true } : {}),
      accessTokenPresent: requestUrl.searchParams.has("access_token"),
      refreshTokenPresent: requestUrl.searchParams.has("refresh_token"),
      idTokenPresent: requestUrl.searchParams.has("id_token"),
    } satisfies CallbackResult;
    if (error) {
      this.resolveOnce(result);
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Authorization was not completed.");
      return;
    }
    if (code) {
      this.resolveOnce(result);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Authorization callback received. You may close this tab.");
      return;
    }
    if (result.accessTokenPresent || result.refreshTokenPresent || result.idTokenPresent) {
      this.resolveOnce(result);
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Authorization callback contained an unexpected credential.");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found.");
  }

  private resolveOnce(result: CallbackResult): void {
    if (this.result) return;
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
    response.writeHead(200, { "cache-control": "no-store", "content-type": "image/svg+xml" });
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
        this.port = (this.server.address() as AddressInfo).port;
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
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

class CompatibilityOAuthProvider {
  private clientInfo?: OAuthClientInformationMixed;
  private tokenInfo?: OAuthTokens;
  private verifier?: string;
  private authorizationUrl?: URL;
  private discovery?: OAuthDiscoveryState;

  constructor(
    private readonly callbackUrl: string,
    private readonly registeredMetadata: OAuthClientMetadata,
  ) {}

  get redirectUrl(): string { return this.callbackUrl; }
  get clientMetadata(): OAuthClientMetadata { return this.registeredMetadata; }
  state(): string { return randomUUID(); }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.clientInfo; }
  saveClientInformation(value: OAuthClientInformationMixed): void { this.clientInfo = value; }
  tokens(): OAuthTokens | undefined { return this.tokenInfo; }
  saveTokens(value: OAuthTokens): void { this.tokenInfo = value; }
  redirectToAuthorization(value: URL): void { this.authorizationUrl = value; }
  saveCodeVerifier(value: string): void { this.verifier = value; }
  codeVerifier(): string {
    if (!this.verifier) throw new Error("OAuth SDK did not save a PKCE code verifier");
    return this.verifier;
  }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery; }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.discovery = value; }
  get authorizationRequestUrl(): URL | undefined { return this.authorizationUrl; }
}

function metadataFor(
  target: McpAccessGrantTarget,
  host: LoopbackHost,
  redirectUri: string,
  sdkVersion: string,
  logoUri: string,
  scenario: "approval" | "denial" | "abandonment" = "approval",
): OAuthClientMetadata {
  const family = host === "127.0.0.1" ? "ipv4" : "ipv6";
  const suffix = `${target.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "target"}-${family}-${scenario}`;
  return buildPublicNativeClientMetadata({
    registrationRedirectUri: redirectUri,
    clientName: `MCP Compatibility Client ${suffix}`,
    clientUri: `https://mcp-compatibility.example.test/${suffix}/about`,
    logoUri,
    softwareId: "betterr-me-mcp-access-grant-compatibility",
    softwareVersion: sdkVersion,
  });
}

function familyOf(host: LoopbackHost): "ipv4" | "ipv6" {
  return host === "127.0.0.1" ? "ipv4" : "ipv6";
}

function clientIds(grants: readonly unknown[]): string[] {
  return grants.map((grant) => grantClientId(grant)).filter((id): id is string => id !== undefined);
}

function grantIds(grants: readonly unknown[]): string[] {
  return grants.map((grant) => {
    if (!grant || typeof grant !== "object") return undefined;
    const value = (grant as Record<string, unknown>).id;
    return typeof value === "string" ? value : undefined;
  }).filter((id): id is string => id !== undefined);
}

function grantClient(grant: unknown): string | undefined {
  return grantClientId(grant);
}

async function createGrantClient(
  target: McpAccessGrantTarget,
  tokens: OAuthTokens | undefined,
  request: LiveEvidenceRequestCapability,
): Promise<{ client?: SupabaseClient; error?: unknown }> {
  if (!target.anonKey) return { error: new Error("Supabase anon key is unavailable") };
  if (!tokens && (!target.email || !target.password)) return { error: new Error("Dedicated grant credentials are unavailable") };
  const client = createClient(target.supabaseUrl, target.anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: request.fetch },
  });
  const result = tokens
    ? await client.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? "" })
    : await client.auth.signInWithPassword({ email: target.email as string, password: target.password as string });
  return result.error ? { error: result.error } : { client };
}

async function listGrants(
  target: McpAccessGrantTarget,
  tokens: OAuthTokens | undefined,
  request: LiveEvidenceRequestCapability,
): Promise<GrantSnapshot> {
  try {
    const result = await createGrantClient(target, tokens, request);
    if (!result.client) return { grants: [], error: result.error };
    const grantsResult = await result.client.auth.oauth.listGrants();
    const grants = (grantsResult.data ?? []) as readonly unknown[];
    const latest = request.latest((current) => {
      try { return current.method === "GET" && new URL(current.url).pathname.endsWith("/auth/v1/user/oauth/grants"); } catch { return false; }
    });
    return { grants, response: responseSurface(latest), request: requestInput(latest), error: grantsResult.error ?? undefined };
  } catch (error) {
    return { grants: [], error };
  }
}

async function cleanupGrant(
  target: McpAccessGrantTarget,
  clientId: string,
  tokens: OAuthTokens,
  request: LiveEvidenceRequestCapability,
): Promise<GrantCleanupSnapshot> {
  const before = await listGrants(target, tokens, request);
  const grant = before.grants.find((candidate) => grantClient(candidate) === clientId);
  let revokeResponse: PublicClientResponseSurface | undefined;
  let revokeRequest: PublicClientRequestInput | undefined;
  if (grant) {
    try {
      const clientResult = await createGrantClient(target, tokens, request);
      if (clientResult.client) {
        await clientResult.client.auth.oauth.revokeGrant({ clientId });
        const latest = request.latest((current) => {
          try { return current.method === "DELETE" && new URL(current.url).pathname.endsWith("/auth/v1/user/oauth/grants"); } catch { return false; }
        });
        revokeResponse = responseSurface(latest);
        revokeRequest = requestInput(latest);
      }
    } catch {
      // The raw request capability retains any boundary response or network error.
    }
  }
  const after = await listGrants(target, tokens, request);
  return { before, after, grant, revokeResponse, revokeRequest };
}

function consentObservation(snapshot: ConsentPageSnapshot): PublicClientConsentObservation {
  return {
    clientNameVisible: snapshot.clientNameVisible,
    clientUriVisible: snapshot.clientUriVisible,
    logoVisible: snapshot.logoVisible,
    softwareIdVisible: snapshot.softwareIdVisible,
    softwareVersionVisible: snapshot.softwareVersionVisible,
    untrustedDisclaimerVisible: snapshot.untrustedDisclaimerVisible,
    endorsementText: snapshot.endorsementText,
  };
}

async function inspectConsentPage(page: Page, metadata: OAuthClientMetadata): Promise<ConsentPageSnapshot> {
  const bodyText = await page.locator("body").innerText();
  const clientUri = typeof metadata.client_uri === "string" ? metadata.client_uri : "";
  const logoUri = typeof metadata.logo_uri === "string" ? metadata.logo_uri : "";
  const softwareId = typeof metadata.software_id === "string" ? metadata.software_id : "";
  const softwareVersion = typeof metadata.software_version === "string" ? metadata.software_version : "";
  const clientName = typeof metadata.client_name === "string" ? metadata.client_name : "";
  const clientNameIndex = clientName ? bodyText.indexOf(clientName) : -1;
  const clientDisclosureText = clientNameIndex === -1 ? "" : bodyText.slice(Math.max(0, clientNameIndex - 600), clientNameIndex + clientName.length + 900);
  const affirmativeControlVisible = await page.getByRole("button", { name: /^(allow|approve|authorize|grant|continue)$/i }).count() > 0;
  const denialControlVisible = await page.getByRole("button", { name: /^(deny|reject|cancel)$/i }).count() > 0;
  const clientUriLinkVisible = clientUri.length > 0 && await page.locator("a").evaluateAll(
    (elements, expectedUri) => elements.some((element) => element.getAttribute("href") === expectedUri && Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight)),
    clientUri,
  );
  const logoVisible = logoUri.length > 0 && await page.locator("img").evaluateAll(
    (elements, expectedUri) => elements.some((element) => element.getAttribute("src") === expectedUri && Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight) && (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0 && (element as HTMLImageElement).naturalHeight > 0),
    logoUri,
  );
  return {
    bodyText,
    affirmativeControlVisible,
    denialControlVisible,
    clientNameVisible: clientName.length > 0 && bodyText.includes(clientName),
    clientUriVisible: clientUriLinkVisible || bodyText.includes(clientUri),
    logoVisible,
    softwareIdVisible: softwareId.length > 0 && bodyText.includes(softwareId),
    softwareVersionVisible: softwareVersion.length > 0 && bodyText.includes(softwareVersion),
    untrustedDisclaimerVisible: /\b(?:unverified|untrusted|not verified|not endorsed|cannot verify|not approved|not trusted)\b/i.test(clientDisclosureText),
    endorsementText: clientDisclosureText,
  };
}

async function navigateToConsent(page: Page, url: URL, target: McpAccessGrantTarget, metadata: OAuthClientMetadata): Promise<ConsentPageSnapshot> {
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const email = page.locator('input[type="email"], input[name="email"], #email').first();
  const password = page.locator('input[type="password"], input[name="password"], #password').first();
  if (await email.count() > 0 && target.email) await email.fill(target.email);
  if (await password.count() > 0 && target.password) await password.fill(target.password);
  if (await email.count() > 0 || await password.count() > 0) {
    const submit = page.getByRole("button", { name: /sign in|log in|continue|submit/i }).first();
    if (await submit.count() > 0) {
      await submit.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
  }
  return inspectConsentPage(page, metadata);
}

function tokenEndpointRequest(request: LiveEvidenceRequestCapability, endpoint: string): LiveEvidenceRequestObservation | undefined {
  return request.latest(endpointPredicate("POST", endpoint));
}

async function recordConsentOutcome(
  kind: "denial" | "abandonment",
  host: LoopbackHost,
  target: McpAccessGrantTarget,
  metadata: AuthorizationServerMetadata,
  clientMetadata: OAuthClientMetadata,
  clientInformation: OAuthClientInformationMixed,
  page: Page,
  request: LiveEvidenceRequestCapability,
  record: (fact: PublicClientJourneyFact) => Promise<void>,
): Promise<void> {
  const family = familyOf(host);
  const callback = new LoopbackCallback(host);
  const stopTokenCapture = (current: PlaywrightRequest): void => {
    try {
      const endpoint = new URL(metadata.token_endpoint);
      const actual = new URL(current.url());
      if (current.method() === "POST" && actual.origin === endpoint.origin && actual.pathname === endpoint.pathname) observeBrowserRequest(request, current);
    } catch {
      // The browser request is outside the token endpoint boundary.
    }
  };
  page.on("request", stopTokenCapture);
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
    const authorizationRequest = requestFromUrl(authorization.authorizationUrl);
    const snapshot = await navigateToConsent(page, authorization.authorizationUrl, target, clientMetadata);
    await record({ kind: "consent", role: "metadata", family, observation: consentObservation(snapshot) });
    if (kind === "denial") {
      const deny = page.getByRole("button", { name: /^(deny|reject|cancel)$/i }).first();
      if (await deny.count() > 0) await deny.click();
    } else {
      await page.goto("about:blank");
    }
    const callbackResult = await callback.wait(kind === "denial" ? CALLBACK_WAIT_TIMEOUT_MS : 1_000);
    const tokenRequest = tokenEndpointRequest(request, metadata.token_endpoint);
    const outcome: PublicClientAuthorizationOutcomeObservation = {
      callbackComplete: true,
      callbackReceived: callback.callbackReceived,
      callbackUrl: callbackResult.callbackUrl,
      browserUrl: page.url(),
      callbackState: callbackResult.state,
      authorizationError: callbackResult.oauthError === true,
      tokenRequestObserved: tokenRequest !== undefined,
      tokenResponse: responseSurface(tokenRequest),
    };
    await record({ kind: "authorization", role: kind, family, observation: outcome, request: authorizationRequest });
  } catch {
    await record({
      kind: "authorization",
      role: kind,
      family,
      observation: { callbackComplete: true, callbackReceived: callback.callbackReceived, browserUrl: page.url() },
    });
  } finally {
    page.off("request", stopTokenCapture);
    await callback.close();
  }
}

async function registerScenarioClient(
  kind: "denial" | "abandonment",
  host: LoopbackHost,
  target: McpAccessGrantTarget,
  metadata: AuthorizationServerMetadata,
  resourceMetadata: OAuthProtectedResourceMetadata | undefined,
  sdkVersion: string,
  logoUri: string,
  request: LiveEvidenceRequestCapability,
): Promise<{ clientMetadata: OAuthClientMetadata; clientInformation: OAuthClientInformationMixed } | undefined> {
  const clientMetadata = metadataFor(target, host, buildLoopbackUrls(host, 0).registrationUrl, sdkVersion, logoUri, kind);
  try {
    const clientInformation = await registerClient(metadata.issuer, {
      metadata,
      clientMetadata,
      scope: resourceMetadata?.scopes_supported?.join(" "),
      fetchFn: request.fetch,
    });
    if (!clientInformation) return undefined;
    return { clientMetadata, clientInformation };
  } catch {
    return undefined;
  }
}

async function runFamily(
  host: LoopbackHost,
  options: PublicClientJourneyOptions,
  metadata: AuthorizationServerMetadata,
  resourceMetadata: OAuthProtectedResourceMetadata | undefined,
  logoUri: string,
): Promise<void> {
  const family = familyOf(host);
  const { target, page, request, record, sdkVersion } = options;
  const registrationRedirectUri = buildLoopbackUrls(host, 0).registrationUrl;
  const clientMetadata = metadataFor(target, host, registrationRedirectUri, sdkVersion, logoUri);
  const registrationStart = request.snapshot().length;
  let clientInformation: OAuthClientInformationMixed | undefined;
  try {
    clientInformation = await registerClient(metadata.issuer, {
      metadata,
      clientMetadata,
      scope: resourceMetadata?.scopes_supported?.join(" "),
      fetchFn: request.fetch,
    });
  } catch {
    // The request capability retains the boundary attempt.
  }
  const registrationRequest = request.snapshot().slice(registrationStart).find((current) => current.method === "POST" && current.url === metadata.registration_endpoint);
  await record({ kind: "registration", role: "primary", family, response: responseSurface(registrationRequest), request: requestInput(registrationRequest) });

  if (metadata.registration_endpoint) {
    for (const registrationCase of buildRegistrationNegativeCases(metadataFor(target, host, registrationRedirectUri, sdkVersion, logoUri))) {
      const start = request.snapshot().length;
      try {
        await request.fetch(metadata.registration_endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(registrationCase.metadata),
        });
      } catch {
        // The captured request is still a primitive negative observation.
      }
      const negativeRequest = request.snapshot().slice(start).find((current) => current.method === "POST" && current.url === metadata.registration_endpoint);
      await record({
        kind: "registration",
        role: "negative",
        family,
        caseId: registrationCase.id as PublicClientNegativeRegistrationCase,
        response: responseSurface(negativeRequest),
        request: requestInput(negativeRequest),
      });
    }
  }

  const callback = new LoopbackCallback(host);
  try {
    await callback.listen();
  } catch {
    await record({ kind: "loopback", role: "callback", family, observation: { registeredRedirectUri: registrationRedirectUri, callbackReceived: false } });
    return;
  }

  let provider: CompatibilityOAuthProvider | undefined;
  let client: Client | undefined;
  let transport: StreamableHTTPClientTransport | undefined;
  let tokens: OAuthTokens | undefined;
  let stopTokenCapture: (() => void) | undefined;
  try {
    if (!clientInformation) return;
    provider = new CompatibilityOAuthProvider(callback.url, clientMetadata);
    provider.saveClientInformation(clientInformation);
    client = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
    transport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), { authProvider: provider, fetch: request.fetch });
    try { await client.connect(transport); } catch { /* OAuth challenge is retained by the provider. */ }
    const authorizationUrl = provider.authorizationRequestUrl;
    if (!authorizationUrl) {
      await record({ kind: "loopback", role: "callback", family, observation: { registeredRedirectUri: registrationRedirectUri, callbackReceived: false } });
      return;
    }
    const authorizationRequest = requestFromUrl(authorizationUrl);
    const callbackUrls = buildLoopbackUrls(host, Number(new URL(callback.url).port));
    await record({
      kind: "loopback",
      role: "request",
      family,
      observation: {
        registeredRedirectUri: registrationRedirectUri,
        requestCallbackUrl: callbackUrls.callbackUrl,
        requestResource: authorizationUrl.searchParams.get("resource") ?? undefined,
        portSelectedAtRequest: Boolean(new URL(callbackUrls.callbackUrl).port),
      },
      request: authorizationRequest,
    });
    stopTokenCapture = () => undefined;
    const tokenListener = (browserRequest: PlaywrightRequest): void => {
      try {
        const endpoint = new URL(metadata.token_endpoint);
        const actual = new URL(browserRequest.url());
        if (browserRequest.method() === "POST" && actual.origin === endpoint.origin && actual.pathname === endpoint.pathname) observeBrowserRequest(request, browserRequest);
      } catch {
        // Ignore browser requests outside the token endpoint.
      }
    };
    page.on("request", tokenListener);
    stopTokenCapture = () => page.off("request", tokenListener);
    const snapshot = await navigateToConsent(page, authorizationUrl, target, clientMetadata);
    await record({ kind: "consent", role: "metadata", family, observation: consentObservation(snapshot) });
    const approve = page.getByRole("button", { name: /^(allow|approve|authorize|grant|continue)$/i }).first();
    await record({
      kind: "authorization",
      role: "approval",
      family,
      observation: {
        affirmativeControlVisible: snapshot.affirmativeControlVisible,
        denialControlVisible: snapshot.denialControlVisible,
        callbackBeforeDecision: callback.callbackReceived,
        decision: "affirmative",
      },
      request: authorizationRequest,
    });
    if (await approve.count() === 0 || callback.callbackReceived) return;
    await approve.click();
    const callbackResult = await callback.wait();
    await record({ kind: "loopback", role: "callback", family, observation: { registeredRedirectUri: registrationRedirectUri, callbackUrl: callbackResult.callbackUrl, callbackReceived: callback.callbackReceived } });
    if (!callbackResult.code || callbackResult.oauthError) return;
    await transport.finishAuth(callbackResult.code);
    tokens = provider.tokens();
    const tokenRequest = tokenEndpointRequest(request, metadata.token_endpoint);
    await record({
      kind: "pkce",
      role: "exchange",
      family,
      observation: {
        method: authorizationUrl.searchParams.get("code_challenge_method") ?? undefined,
        requestResource: tokenRequest?.requestResource,
        authorizationRequest,
      },
      request: requestInput(tokenRequest),
    });
    let jwks: string | PublicClientJsonValue | undefined;
    if (metadata.jwks_uri) {
      try {
        const jwksResponse = await request.fetch(String(metadata.jwks_uri));
        const text = await jwksResponse.clone().text();
        jwks = text;
      } catch {
        // The request capability retains the failed JWKS request.
      }
    }
    await record({
      kind: "delegated-token",
      role: "validation",
      family,
      token: tokens?.access_token,
      jwks,
      request: requestInput(tokenRequest),
    });

    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    client = undefined;
    transport = undefined;
    const operationClient = new Client({ name: "betterr-me-mcp-access-grant-compatibility", version: "1.0.0" });
    const operationTransport = new StreamableHTTPClientTransport(new URL(target.canonicalResource), { authProvider: provider, fetch: request.fetch });
    let operation: PublicClientMcpOperationObservation = { operationUrl: target.canonicalResource, operationResource: target.canonicalResource, connected: false, listToolsCompleted: false, callToolCompleted: false, resultIsError: true };
    try {
      await operationClient.connect(operationTransport);
      const listed = await operationClient.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === "getProjects") ?? listed.tools[0];
      if (tool) {
        const result = await operationClient.callTool({ name: tool.name, arguments: {} });
        operation = { operationUrl: target.canonicalResource, operationResource: target.canonicalResource, connected: true, listToolsCompleted: true, callToolCompleted: true, resultIsError: Boolean(result.isError), sdk: { connected: true, listToolsCompleted: true, callToolCompleted: true, resultIsError: Boolean(result.isError), toolName: tool.name } };
      } else {
        operation = { operationUrl: target.canonicalResource, operationResource: target.canonicalResource, connected: true, listToolsCompleted: true, callToolCompleted: false, resultIsError: true };
      }
    } catch {
      // The primitive operation remains an attempted, unsuccessful operation.
    } finally {
      await operationTransport.close().catch(() => undefined);
      await operationClient.close().catch(() => undefined);
    }
    await record({ kind: "mcp-operation", role: "authenticated", family, observation: operation, request: latestInput(request, (current) => current.method === "POST" && current.url === target.canonicalResource) });
  } catch {
    await record({ kind: "loopback", role: "callback", family, observation: { registeredRedirectUri: registrationRedirectUri, callbackReceived: callback.callbackReceived, callbackUrl: callback.url } });
  } finally {
    stopTokenCapture?.();
    await transport?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await callback.close();
    if (tokens?.access_token && clientInformation?.client_id) {
      const cleanup = await cleanupGrant(target, clientInformation.client_id, tokens, request);
      const beforeGrant = cleanup.grant;
      const before = cleanup.before;
      const after = cleanup.after;
      const grantObservation: PublicClientGrantObservation = {
        listRequestObserved: before.request !== undefined,
        grantListObserved: before.response !== undefined,
        listResponse: before.response,
        listResponseStatus: before.response?.status,
        listedClientIds: clientIds(before.grants),
        listedGrantIds: grantIds(before.grants),
        grantId: beforeGrant && typeof beforeGrant === "object" && typeof (beforeGrant as Record<string, unknown>).id === "string" ? (beforeGrant as Record<string, string>).id : undefined,
        grantClientId: beforeGrant ? grantClient(beforeGrant) : clientInformation.client_id,
        clientId: clientInformation.client_id,
        grantPresent: beforeGrant !== undefined,
        revokeRequestObserved: cleanup.revokeRequest !== undefined,
        revokeObserved: cleanup.revokeResponse !== undefined,
        revokeResponse: cleanup.revokeResponse,
        revokeResponseStatus: cleanup.revokeResponse?.status,
        request: before.request ?? cleanup.revokeRequest,
      };
      await record({ kind: "grant", role: "cleanup", family, observation: grantObservation, request: before.request ?? cleanup.revokeRequest });
      await record({
        kind: "cleanup",
        role: "family",
        family,
        observation: {
          listRequestObserved: after.request !== undefined,
          remainingClientIds: clientIds(after.grants),
          remainingGrantIds: grantIds(after.grants),
          grantPresent: after.grants.some((candidate) => grantClient(candidate) === clientInformation?.client_id),
          requestStatus: after.response?.status,
          response: after.response,
        },
      });
    }
  }
}

export async function runPublicClientJourney(options: PublicClientJourneyOptions): Promise<void> {
  const { target, page, request, record, sdkVersion } = options;
  let resourceInfo: Awaited<ReturnType<typeof discoverOAuthServerInfo>> | undefined;
  try {
    resourceInfo = await discoverOAuthServerInfo(new URL(target.canonicalResource), { fetchFn: request.fetch });
  } catch {
    // The two discovery facts below retain the attempted request boundaries.
  }
  const resourceMetadata = resourceInfo?.resourceMetadata as OAuthProtectedResourceMetadata | undefined;
  const metadata = resourceInfo?.authorizationServerMetadata;
  await record({
    kind: "resource-discovery",
    role: "primary",
    advertisedResource: resourceMetadata?.resource,
    advertisedAuthorizationServer: resourceInfo?.authorizationServerUrl,
    response: responseSurface(request.latest((current) => {
      try { return new URL(current.url).pathname.endsWith("/.well-known/oauth-protected-resource"); } catch { return false; }
    })),
    request: metadataRequest(request, "/.well-known/oauth-protected-resource"),
  });
  await record({
    kind: "provider-discovery",
    role: "primary",
    issuer: metadata?.issuer,
    authorizationEndpoint: metadata?.authorization_endpoint,
    registrationEndpoint: metadata?.registration_endpoint,
    tokenEndpoint: metadata?.token_endpoint,
    ...(typeof metadata?.jwks_uri === "string" ? { jwksUri: metadata.jwks_uri } : {}),
    grantTypesSupported: metadata?.grant_types_supported,
    responseTypesSupported: metadata?.response_types_supported,
    tokenEndpointAuthMethodsSupported: metadata?.token_endpoint_auth_methods_supported,
    codeChallengeMethodsSupported: metadata?.code_challenge_methods_supported,
    response: responseSurface(request.latest((current) => {
      try { return new URL(current.url).pathname.endsWith("/.well-known/oauth-authorization-server"); } catch { return false; }
    })),
    request: metadataRequest(request, "/.well-known/oauth-authorization-server"),
  });
  if (!metadata?.issuer || !metadata.registration_endpoint || !metadata.authorization_endpoint || !metadata.token_endpoint) return;

  for (const host of LOOPBACK_HOSTS) {
    if (!target.loopbackHosts.includes(host)) continue;
    const logo = new LogoFixture();
    try {
      await logo.listen();
      await runFamily(host, options, metadata, resourceMetadata, logo.url);
      if (target.email && target.password) {
        for (const kind of ["denial", "abandonment"] as const) {
          const scenario = await registerScenarioClient(kind, host, target, metadata, resourceMetadata, sdkVersion, logo.url, request);
          if (scenario) {
            await recordConsentOutcome(kind, host, target, metadata, scenario.clientMetadata, scenario.clientInformation, page, request, record);
          }
        }
      }
    } catch {
      // Missing journey facts remain deterministic not-proven outcomes.
    } finally {
      await logo.close();
    }
  }
}

/** Standalone public-client Candidate 2 operation. */
export async function runMcpAccessGrantPublicClient(
  target: McpAccessGrantTarget,
  page: Page,
  testInfo: TestInfo,
  targetConfiguration: McpAccessGrantTargetConfiguration,
): Promise<Awaited<ReturnType<typeof runPublicClientEvidence>>["report"]> {
  const session: LiveEvidenceSession = createLiveEvidenceSession({ target, targetConfiguration, testInfo });
  const options = await session.publicClientOptions();
  const result = await runPublicClientEvidence(options, async (recorder) => {
    await recorder.recordProfileFact({ kind: "configuration", role: "snapshot", observation: { loopbackHosts: session.target.loopbackHosts, providerCredentialsAvailable: Boolean(session.target.email && session.target.password) } });
    await recorder.recordProfileFact({ kind: "versions", role: "snapshot", values: options.versions });
    await runPublicClientJourney({ target: session.target, page, request: session.capabilities.request, sdkVersion: options.versions["@modelcontextprotocol/sdk"] ?? "unavailable", record: recorder.record });
  });
  return result.report;
}
