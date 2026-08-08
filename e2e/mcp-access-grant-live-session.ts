import { execFileSync } from "node:child_process";
import { mkdir as makeDirectory, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TestInfo } from "@playwright/test";

import {
  EVIDENCE_ARTIFACT_FILENAME,
  createEvidenceRunContext,
  minimizeResponseBody,
  sanitizeEvidence,
  sanitizeText,
  sanitizeUrl,
  type CompatibilityReportTarget,
} from "./mcp-access-grant-evidence";
import type {
  AggregateCompatibilityEvidenceOptions,
  AggregateCompatibilityArtifact,
} from "./mcp-access-grant-aggregate-profile";
import type {
  PublicClientArtifact,
  PublicClientEvidenceOptions,
} from "./mcp-access-grant-public-client-profile";
import type {
  McpAccessGrantTarget,
  McpAccessGrantTargetConfiguration,
} from "./mcp-access-grant-target";
import { s256CodeChallenge } from "./mcp-access-grant-journey";

export type LiveEvidenceProfile = "public-client" | "compatibility";

export interface LiveEvidenceResponseSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly location?: string;
}

/** A bounded request observation owned by the live request capability. */
export interface LiveEvidenceRequestObservation {
  readonly method: string;
  readonly url: string;
  readonly requestBodyFields: readonly string[];
  readonly authorizationHeaderPresent: boolean;
  readonly requestClientIdPresent?: boolean;
  readonly requestClientId?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeVerifierHash?: string;
  readonly status?: number;
  readonly responseLocation?: string;
  readonly responseBody?: Readonly<Record<string, unknown>>;
  readonly responseCredentialFields?: readonly string[];
  readonly responseContainsCredentials?: boolean;
  readonly networkError?: string;
}

/** The request shape accepted by either deterministic profile recorder. */
export interface LiveEvidenceFactRequest {
  readonly method: string;
  readonly url: string;
  readonly bodyFields: readonly string[];
  readonly authorizationHeaderPresent: boolean;
  readonly requestClientId?: string;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly status?: number;
  readonly response?: LiveEvidenceResponseSurface;
}

export interface LiveEvidenceRequestCapability {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly observe: (request: LiveEvidenceRequestObservation) => void;
  readonly snapshot: () => readonly LiveEvidenceRequestObservation[];
  readonly at: (index: number) => LiveEvidenceRequestObservation | undefined;
  readonly latest: (
    predicate?: (request: LiveEvidenceRequestObservation) => boolean,
  ) => LiveEvidenceRequestObservation | undefined;
  readonly inputAt: (index: number) => LiveEvidenceFactRequest | undefined;
  readonly latestInput: (
    predicate?: (request: LiveEvidenceRequestObservation) => boolean,
  ) => LiveEvidenceFactRequest | undefined;
  readonly inputsSince: (index: number) => readonly LiveEvidenceFactRequest[];
}

export interface LiveEvidenceClockCapability {
  readonly now: () => string;
}

export interface LiveEvidenceVersionCapability {
  readonly collect: (
    profile: LiveEvidenceProfile,
    target: McpAccessGrantTarget,
  ) => Promise<Readonly<Record<string, string>>>;
}

export interface LiveEvidenceEnvironmentCapability {
  readonly configuredValues: readonly string[];
  readonly get: (name: string) => string | undefined;
}

export interface LiveEvidenceFilesystemCapability {
  readonly readText: (filePath: string) => Promise<string>;
  readonly makeDirectory: (directoryPath: string) => Promise<void>;
  readonly writeText: (filePath: string, contents: string) => Promise<void>;
}

export interface LiveEvidenceArtifact {
  readonly filename: string;
  readonly contents: string;
}

export interface LiveEvidenceAllDestinationsWriter {
  readonly write: (artifact: LiveEvidenceArtifact) => void | Promise<void>;
}

export interface LiveEvidenceCapabilities {
  readonly clock: LiveEvidenceClockCapability;
  readonly request: LiveEvidenceRequestCapability;
  readonly versions: LiveEvidenceVersionCapability;
  readonly environment: LiveEvidenceEnvironmentCapability;
  readonly filesystem: LiveEvidenceFilesystemCapability;
  readonly writer: LiveEvidenceAllDestinationsWriter;
}

export interface LiveEvidenceCapabilityOverrides {
  readonly clock?: LiveEvidenceClockCapability;
  readonly request?: LiveEvidenceRequestCapability;
  readonly versions?: LiveEvidenceVersionCapability;
  readonly environment?: LiveEvidenceEnvironmentCapability;
  readonly filesystem?: LiveEvidenceFilesystemCapability;
  readonly writer?: LiveEvidenceAllDestinationsWriter;
}

export interface LiveEvidenceSessionInput {
  readonly target: McpAccessGrantTarget;
  readonly targetConfiguration: McpAccessGrantTargetConfiguration;
  readonly testInfo?: Pick<TestInfo, "outputPath">;
  readonly capabilities?: LiveEvidenceCapabilityOverrides;
}

interface RequestContext {
  readonly configuredSecrets: readonly string[];
}

const REQUEST_CREDENTIAL_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "code",
  "code_verifier",
]);

function contextFor(configuredSecrets: readonly string[]): RequestContext {
  return { configuredSecrets: [...configuredSecrets] };
}

function sanitizationContext(context: RequestContext) {
  return createEvidenceRunContext({
    configuredSecrets: context.configuredSecrets,
    time: { startedAt: "", finishedAt: "" },
    versions: {},
  });
}

function bodyText(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined;
}

function bodyFields(text: string | undefined): string[] {
  if (text === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.keys(parsed).sort();
  } catch {
    // OAuth bodies are form encoded and are handled below.
  }
  try {
    return [...new URLSearchParams(text).keys()].sort();
  } catch {
    return ["[unparsed body]"];
  }
}

function requestParameters(
  text: string | undefined,
  context: RequestContext,
): Pick<
  LiveEvidenceRequestObservation,
  | "requestClientIdPresent"
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
  if (text === undefined) return {};
  let parameters: URLSearchParams;
  try {
    parameters = new URLSearchParams(text);
  } catch {
    return {};
  }
  const codeVerifier = parameters.get("code_verifier");
  const evidenceContext = sanitizationContext(context);
  return {
    ...(parameters.has("client_id") ? { requestClientIdPresent: true } : {}),
    ...(parameters.get("client_id") ? { requestClientId: sanitizeText(parameters.get("client_id") as string, evidenceContext) } : {}),
    ...(parameters.get("grant_type") ? { requestGrantType: sanitizeText(parameters.get("grant_type") as string, evidenceContext) } : {}),
    ...(parameters.get("redirect_uri") ? { requestRedirectUri: sanitizeUrl(parameters.get("redirect_uri") as string, evidenceContext) } : {}),
    ...(parameters.get("resource") ? { requestResource: sanitizeUrl(parameters.get("resource") as string, evidenceContext) } : {}),
    ...(parameters.get("code_challenge_method") ? { requestCodeChallengeMethod: sanitizeText(parameters.get("code_challenge_method") as string, evidenceContext) } : {}),
    ...(parameters.has("code_challenge") ? { requestCodeChallengePresent: true } : {}),
    ...(parameters.has("code") ? { requestCodePresent: true } : {}),
    ...(parameters.has("code_verifier") ? { requestCodeVerifierPresent: true } : {}),
    ...(codeVerifier ? { requestCodeVerifierHash: s256CodeChallenge(codeVerifier) } : {}),
  };
}

function responseCredentialFields(
  text: string,
  contentType: string | null,
  location: string | null,
): string[] {
  const fields = new Set<string>();
  if (location) {
    try {
      const locationUrl = new URL(location);
      for (const key of REQUEST_CREDENTIAL_KEYS) if (locationUrl.searchParams.get(key)) fields.add(key);
    } catch {
      // The location is still retained as bounded URL evidence.
    }
  }
  if (contentType?.includes("json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of REQUEST_CREDENTIAL_KEYS) {
          const value = (parsed as Record<string, unknown>)[key];
          if (typeof value === "string" && value.length > 0) fields.add(key);
        }
      }
    } catch {
      // The bounded response body is classified as incomplete by the profile.
    }
  }
  return [...fields].sort();
}

function responseSurface(request: LiveEvidenceRequestObservation): LiveEvidenceResponseSurface | undefined {
  if (request.status === undefined && request.responseBody === undefined && request.responseLocation === undefined) return undefined;
  return {
    complete: request.status !== undefined,
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.responseBody !== undefined ? { body: request.responseBody } : {}),
    ...(request.responseLocation !== undefined ? { location: request.responseLocation } : {}),
  };
}

function factInput(request: LiveEvidenceRequestObservation | undefined): LiveEvidenceFactRequest | undefined {
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
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(response !== undefined ? { response } : {}),
  };
}

function createRequestCapability(configuredSecrets: readonly string[]): LiveEvidenceRequestCapability {
  const requests: Array<LiveEvidenceRequestObservation> = [];
  const context = contextFor(configuredSecrets);

  const snapshot = (): readonly LiveEvidenceRequestObservation[] => Object.freeze(
    requests.map((request) => Object.freeze({
      ...request,
      requestBodyFields: Object.freeze([...request.requestBodyFields]),
      ...(request.responseCredentialFields ? { responseCredentialFields: Object.freeze([...request.responseCredentialFields]) } : {}),
      ...(request.responseBody ? { responseBody: Object.freeze({ ...request.responseBody }) } : {}),
    })),
  );
  const at = (index: number): LiveEvidenceRequestObservation | undefined => snapshot()[index];
  const latest = (predicate: (request: LiveEvidenceRequestObservation) => boolean = () => true) => {
    const current = snapshot();
    return [...current].reverse().find(predicate);
  };

  const fetchWithCapture = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestObject = typeof Request !== "undefined" && input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? requestObject?.headers);
    let rawBody = bodyText(init?.body);
    if (rawBody === undefined && requestObject) {
      try {
        rawBody = await requestObject.clone().text();
      } catch {
        rawBody = undefined;
      }
    }
    const inputUrl = typeof input === "string" || input instanceof URL ? input : input.url;
    const evidenceContext = sanitizationContext(context);
    const request: LiveEvidenceRequestObservation = {
      method: (init?.method ?? requestObject?.method ?? "GET").toUpperCase(),
      url: sanitizeUrl(inputUrl, evidenceContext),
      requestBodyFields: bodyFields(rawBody),
      authorizationHeaderPresent: headers.has("authorization"),
      ...requestParameters(rawBody, context),
    };
    requests.push(request);

    try {
      const response = await fetch(input, init);
      const location = response.headers.get("location");
      let responseBody: Record<string, unknown> | undefined;
      try {
        const contentType = response.headers.get("content-type");
        const text = contentType?.includes("text/event-stream") ? "" : await response.clone().text();
        const fields = responseCredentialFields(text, contentType, location);
        const minimized = contentType?.includes("text/event-stream")
          ? { contentType, body: "[STREAM BODY NOT RECORDED]" }
          : minimizeResponseBody(text, contentType);
        responseBody = minimized
          ? sanitizeEvidence(minimized, evidenceContext).value as Record<string, unknown>
          : undefined;
        Object.assign(request, {
          responseCredentialFields: fields,
          responseContainsCredentials: fields.length > 0,
          ...(responseBody !== undefined ? { responseBody } : {}),
        });
      } catch {
        responseBody = { body: "[UNAVAILABLE RESPONSE BODY]" };
        Object.assign(request, { responseBody });
      }
      Object.assign(request, {
        status: response.status,
        ...(location ? { responseLocation: sanitizeUrl(location, evidenceContext) } : {}),
      });
      return response;
    } catch (error) {
      Object.assign(request, { networkError: sanitizeText(error instanceof Error ? error.message : String(error), evidenceContext) });
      throw error;
    }
  };

  return Object.freeze({
    fetch: fetchWithCapture,
    observe: (request: LiveEvidenceRequestObservation) => {
      requests.push(Object.freeze({
        ...request,
        requestBodyFields: Object.freeze([...request.requestBodyFields]),
        ...(request.responseCredentialFields ? { responseCredentialFields: Object.freeze([...request.responseCredentialFields]) } : {}),
        ...(request.responseBody ? { responseBody: Object.freeze({ ...request.responseBody }) } : {}),
      }));
    },
    snapshot,
    at,
    latest,
    inputAt: (index: number) => factInput(at(index)),
    latestInput: (predicate: (request: LiveEvidenceRequestObservation) => boolean = () => true) => factInput(latest(predicate)),
    inputsSince: (index: number) => snapshot().slice(index).map((request) => factInput(request) as LiveEvidenceFactRequest),
  });
}

function defaultFilesystem(): LiveEvidenceFilesystemCapability {
  return {
    readText: (filePath) => readFile(filePath, "utf8"),
    makeDirectory: (directoryPath) => makeDirectory(directoryPath, { recursive: true }).then(() => undefined),
    writeText: (filePath, contents) => writeFile(filePath, contents, "utf8"),
  };
}

function defaultEnvironment(
  targetConfiguration: McpAccessGrantTargetConfiguration,
): LiveEvidenceEnvironmentCapability {
  return Object.freeze({
    configuredValues: [...targetConfiguration.configuredValues],
    get: (name: string) => process.env[name],
  });
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

async function readJsonFile(
  filesystem: LiveEvidenceFilesystemCapability,
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await filesystem.readText(filePath));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function createVersionCapability(filesystem: LiveEvidenceFilesystemCapability): LiveEvidenceVersionCapability {
  return {
    collect: async (profile, target) => {
      const root = process.cwd();
      const packageJson = await readJsonFile(filesystem, path.join(root, "package.json"));
      const versions: Record<string, string> = { "supabase-cli": commandVersion("supabase", ["--version"]) };
      for (const dependency of ["@modelcontextprotocol/sdk", "@playwright/test", "@supabase/supabase-js", "mcp-handler"]) {
        versions[dependency] = packageVersion(await readJsonFile(filesystem, path.join(root, "node_modules", dependency, "package.json")));
      }

      const dockerImages = commandVersion("docker", ["ps", "--format", "{{.Names}}|{{.Image}}"]).split(/\r?\n/);
      const authImage = dockerImages.find((line) => line.startsWith("supabase_auth_"))?.split("|")[1];
      versions["supabase-auth-provider-image"] = profile === "compatibility" && !target.locality.supabaseUrlIsLoopback
        ? "not-applicable"
        : authImage ?? "unavailable";
      if (profile === "compatibility") {
        versions["supabase-hosted-provider-version"] = target.locality.supabaseUrlIsLoopback
          ? "not-applicable"
          : "not-publicly-exposed";
      }
      const devDependencies = packageJson.devDependencies;
      versions["declared-sdk-range"] = devDependencies && typeof devDependencies === "object" && !Array.isArray(devDependencies) &&
        typeof (devDependencies as Record<string, unknown>)["@modelcontextprotocol/sdk"] === "string"
        ? (devDependencies as Record<string, string>)["@modelcontextprotocol/sdk"]
        : "unavailable";
      return Object.freeze({ ...versions });
    },
  };
}

function defaultClock(): LiveEvidenceClockCapability {
  return { now: () => new Date().toISOString() };
}

function defaultWriter(
  filesystem: LiveEvidenceFilesystemCapability,
  environment: LiveEvidenceEnvironmentCapability,
  testInfo: Pick<TestInfo, "outputPath"> | undefined,
): LiveEvidenceAllDestinationsWriter {
  return {
    write: async (artifact) => {
      if (!testInfo) throw new Error("MCP evidence artifact destination is unavailable.");
      const primaryPath = testInfo.outputPath(artifact.filename);
      await filesystem.makeDirectory(path.dirname(primaryPath));
      await filesystem.writeText(primaryPath, artifact.contents);
      const mirror = environment.get("MCP_ACCESS_GRANT_EVIDENCE_PATH");
      if (mirror) {
        const mirrorPath = path.resolve(mirror);
        if (path.resolve(primaryPath) !== mirrorPath) {
          await filesystem.makeDirectory(path.dirname(mirrorPath));
          await filesystem.writeText(mirrorPath, artifact.contents);
        }
      }
    },
  };
}

function snapshotTarget(target: McpAccessGrantTarget): McpAccessGrantTarget {
  return Object.freeze({
    name: target.name,
    canonicalResource: target.canonicalResource,
    supabaseUrl: target.supabaseUrl,
    expectedAuthorizationServer: target.expectedAuthorizationServer,
    loopbackHosts: Object.freeze([...target.loopbackHosts]),
    ...(target.anonKey !== undefined ? { anonKey: target.anonKey } : {}),
    ...(target.email !== undefined ? { email: target.email } : {}),
    ...(target.password !== undefined ? { password: target.password } : {}),
    locality: Object.freeze({ ...target.locality }),
  });
}

function reportTarget(target: McpAccessGrantTarget): CompatibilityReportTarget {
  return Object.freeze({
    name: target.name,
    canonicalResource: target.canonicalResource,
    supabaseUrl: target.supabaseUrl,
    expectedAuthorizationServer: target.expectedAuthorizationServer,
    loopbackHosts: Object.freeze([...target.loopbackHosts]),
  });
}

export class LiveEvidenceSession {
  readonly target: McpAccessGrantTarget;
  readonly reportTarget: CompatibilityReportTarget;
  readonly capabilities: LiveEvidenceCapabilities;

  constructor(input: LiveEvidenceSessionInput, capabilities: LiveEvidenceCapabilities) {
    this.target = snapshotTarget(input.target);
    this.reportTarget = reportTarget(this.target);
    this.capabilities = Object.freeze(capabilities);
  }

  async publicClientOptions(): Promise<PublicClientEvidenceOptions> {
    const versions = await this.capabilities.versions.collect("public-client", this.target);
    return {
      target: this.reportTarget,
      versions,
      configuredSecrets: this.capabilities.environment.configuredValues,
      clock: this.capabilities.clock.now,
      writer: (artifact: PublicClientArtifact) => this.capabilities.writer.write(artifact),
      requestSource: { snapshot: this.capabilities.request.snapshot },
    };
  }

  async aggregateCompatibilityOptions(): Promise<AggregateCompatibilityEvidenceOptions> {
    const versions = await this.capabilities.versions.collect("compatibility", this.target);
    return {
      target: this.reportTarget,
      versions,
      configuredSecrets: this.capabilities.environment.configuredValues,
      clock: this.capabilities.clock.now,
      writer: (artifact: AggregateCompatibilityArtifact) => this.capabilities.writer.write(artifact),
      requestSource: { snapshot: this.capabilities.request.snapshot },
    };
  }
}

export function createLiveEvidenceSession(input: LiveEvidenceSessionInput): LiveEvidenceSession {
  const overrides = input.capabilities ?? {};
  const environment = overrides.environment ?? defaultEnvironment(input.targetConfiguration);
  const filesystem = overrides.filesystem ?? defaultFilesystem();
  const request = overrides.request ?? createRequestCapability(environment.configuredValues);
  const capabilities: LiveEvidenceCapabilities = {
    clock: overrides.clock ?? defaultClock(),
    request,
    versions: overrides.versions ?? createVersionCapability(filesystem),
    environment,
    filesystem,
    writer: overrides.writer ?? defaultWriter(filesystem, environment, input.testInfo),
  };
  return new LiveEvidenceSession(input, capabilities);
}

export const MCP_ACCESS_GRANT_LIVE_EVIDENCE_ARTIFACT = EVIDENCE_ARTIFACT_FILENAME;
