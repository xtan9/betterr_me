import {
  LOOPBACK_HOSTS,
  type LoopbackHost,
} from "./mcp-access-grant-policy";

const DEFAULT_ANON_KEY_ENV = "MCP_SUPABASE_ANON_KEY";
const DEFAULT_EMAIL_ENV = "MCP_TEST_EMAIL";
const DEFAULT_PASSWORD_ENV = "MCP_TEST_PASSWORD";

const SENSITIVE_ENV_NAMES = [
  "MCP_TEST_PASSWORD",
  "MCP_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "API_KEY_HMAC_SECRET",
] as const;

export interface McpAccessGrantTargetLocality {
  readonly canonicalResourceIsLoopback: boolean;
  readonly supabaseUrlIsLoopback: boolean;
  readonly expectedAuthorizationServerIsLoopback: boolean;
  readonly allEndpointsLoopback: boolean;
  readonly nonProductionAcknowledged: boolean;
}

export interface McpAccessGrantTarget {
  readonly name: string;
  readonly canonicalResource: string;
  readonly supabaseUrl: string;
  readonly expectedAuthorizationServer: string;
  readonly loopbackHosts: readonly LoopbackHost[];
  readonly anonKey?: string;
  readonly email?: string;
  readonly password?: string;
  readonly locality: McpAccessGrantTargetLocality;
}

export interface McpAccessGrantTargetConfiguration {
  readonly targets: readonly McpAccessGrantTarget[];
  readonly configuredValues: readonly string[];
}

export interface TargetConfigurationEvaluation {
  readonly configured: boolean;
  readonly nonProduction: boolean;
}

export class McpAccessGrantTargetConfigurationError extends Error {
  readonly code = "MCP_ACCESS_GRANT_TARGET_CONFIGURATION" as const;

  constructor(message: string) {
    super(message);
    this.name = "McpAccessGrantTargetConfigurationError";
  }
}

type RawTargetConfiguration = Record<string, unknown>;
type Environment = NodeJS.ProcessEnv;

function isRecord(value: unknown): value is RawTargetConfiguration {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configurationError(message: string): McpAccessGrantTargetConfigurationError {
  return new McpAccessGrantTargetConfigurationError(`[mcp-access-grant] ${message}`);
}

function requiredString(
  raw: RawTargetConfiguration,
  field: string,
  targetIndex: number,
): string {
  const value = raw[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw configurationError(`Target ${targetIndex + 1} field "${field}" must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  raw: RawTargetConfiguration,
  field: string,
  targetIndex: number,
): string | undefined {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw configurationError(`Target ${targetIndex + 1} field "${field}" must be a non-empty string when provided.`);
  }
  return value;
}

function environmentName(
  raw: RawTargetConfiguration,
  field: string,
  fallback: string,
  targetIndex: number,
): string {
  const value = raw[field];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw configurationError(`Target ${targetIndex + 1} field "${field}" must name a non-empty environment variable.`);
  }
  return value;
}

function validatedEndpoint(value: string, field: string, targetIndex: number): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw configurationError(`Target ${targetIndex + 1} field "${field}" must be an absolute HTTP(S) URL.`);
  }
  return value;
}

function deriveAuthorizationServer(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/auth/v1`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function configuredLoopbackHosts(value: unknown, targetIndex: number): readonly LoopbackHost[] {
  const rawHosts = value === undefined
    ? [...LOOPBACK_HOSTS]
    : typeof value === "string"
      ? value.split(",").map((host) => host.trim())
      : Array.isArray(value)
        ? value
        : undefined;

  if (!rawHosts) {
    throw configurationError(`Target ${targetIndex + 1} field "loopbackHosts" must be a supported host array or comma-separated string.`);
  }

  const hosts: LoopbackHost[] = [];
  for (const host of rawHosts) {
    if (typeof host !== "string" || !LOOPBACK_HOSTS.includes(host as LoopbackHost)) {
      throw configurationError(`Target ${targetIndex + 1} field "loopbackHosts" contains an unsupported host.`);
    }
    if (!hosts.includes(host as LoopbackHost)) hosts.push(host as LoopbackHost);
  }
  return Object.freeze(hosts);
}

function isLoopbackEndpoint(value: string): boolean {
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function configuredValue(environment: Environment, name: string): string | undefined {
  const value = environment[name];
  return value && value.length > 0 ? value : undefined;
}

function parseTarget(
  raw: RawTargetConfiguration,
  targetIndex: number,
  environment: Environment,
): McpAccessGrantTarget {
  const name = raw.name === undefined
    ? `target-${targetIndex + 1}`
    : optionalString(raw, "name", targetIndex);
  if (!name) {
    throw configurationError(`Target ${targetIndex + 1} field "name" must be a non-empty string.`);
  }

  const canonicalResource = validatedEndpoint(
    requiredString(raw, "canonicalResource", targetIndex),
    "canonicalResource",
    targetIndex,
  );
  const supabaseUrl = validatedEndpoint(
    requiredString(raw, "supabaseUrl", targetIndex),
    "supabaseUrl",
    targetIndex,
  );
  const explicitAuthorizationServer = optionalString(raw, "expectedAuthorizationServer", targetIndex);
  const expectedAuthorizationServer = validatedEndpoint(
    explicitAuthorizationServer ?? deriveAuthorizationServer(supabaseUrl),
    "expectedAuthorizationServer",
    targetIndex,
  );
  const canonicalResourceIsLoopback = isLoopbackEndpoint(canonicalResource);
  const supabaseUrlIsLoopback = isLoopbackEndpoint(supabaseUrl);
  const expectedAuthorizationServerIsLoopback = isLoopbackEndpoint(expectedAuthorizationServer);
  const allEndpointsLoopback = canonicalResourceIsLoopback &&
    supabaseUrlIsLoopback &&
    expectedAuthorizationServerIsLoopback;
  const locality: McpAccessGrantTargetLocality = Object.freeze({
    canonicalResourceIsLoopback,
    supabaseUrlIsLoopback,
    expectedAuthorizationServerIsLoopback,
    allEndpointsLoopback,
    nonProductionAcknowledged: allEndpointsLoopback || environment.MCP_ACCESS_GRANT_NON_PRODUCTION_ACK === "true",
  });

  const anonKeyEnv = environmentName(raw, "anonKeyEnv", DEFAULT_ANON_KEY_ENV, targetIndex);
  const emailEnv = environmentName(raw, "emailEnv", DEFAULT_EMAIL_ENV, targetIndex);
  const passwordEnv = environmentName(raw, "passwordEnv", DEFAULT_PASSWORD_ENV, targetIndex);
  const target: McpAccessGrantTarget = {
    name,
    canonicalResource,
    supabaseUrl,
    expectedAuthorizationServer,
    loopbackHosts: configuredLoopbackHosts(raw.loopbackHosts, targetIndex),
    anonKey: configuredValue(environment, anonKeyEnv) ?? configuredValue(environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    email: configuredValue(environment, emailEnv),
    password: configuredValue(environment, passwordEnv),
    locality,
  };
  return Object.freeze(target);
}

function configuredEnvironmentTarget(environment: Environment): RawTargetConfiguration {
  return {
    name: environment.MCP_ACCESS_GRANT_TARGET_NAME ?? "configured-target",
    canonicalResource: environment.MCP_ACCESS_GRANT_CANONICAL_RESOURCE,
    supabaseUrl: environment.MCP_SUPABASE_URL,
    expectedAuthorizationServer: environment.MCP_SUPABASE_AUTH_ISSUER,
    loopbackHosts: environment.MCP_ACCESS_GRANT_LOOPBACK_HOSTS,
  };
}

function configuredValues(
  targets: readonly McpAccessGrantTarget[],
  environment: Environment,
): readonly string[] {
  const values = new Set<string>();
  for (const target of targets) {
    for (const value of [target.anonKey, target.email, target.password]) {
      if (value) values.add(value);
    }
  }
  for (const name of SENSITIVE_ENV_NAMES) {
    const value = configuredValue(environment, name);
    if (value) values.add(value);
  }
  return Object.freeze([...values]);
}

export function loadMcpAccessGrantConfiguration(
  sourceEnvironment: Environment = process.env,
): McpAccessGrantTargetConfiguration {
  const environment = { ...sourceEnvironment };
  let rawTargets: unknown[];

  if (environment.MCP_ACCESS_GRANT_TARGETS !== undefined) {
    try {
      const parsed: unknown = JSON.parse(environment.MCP_ACCESS_GRANT_TARGETS);
      if (!Array.isArray(parsed)) throw new Error("target list is not an array");
      rawTargets = parsed;
    } catch {
      throw configurationError("MCP_ACCESS_GRANT_TARGETS must be a JSON array of target objects.");
    }
    if (rawTargets.length === 0) {
      throw configurationError("MCP_ACCESS_GRANT_TARGETS must contain at least one target.");
    }
  } else {
    rawTargets = [configuredEnvironmentTarget(environment)];
  }

  const targets = rawTargets.map((raw, targetIndex) => {
    if (!isRecord(raw)) {
      throw configurationError(`Target ${targetIndex + 1} must be an object.`);
    }
    return parseTarget(raw, targetIndex, environment);
  });

  return Object.freeze({
    targets: Object.freeze(targets),
    configuredValues: configuredValues(targets, environment),
  });
}

export function loadMcpAccessGrantTargets(
  sourceEnvironment: Environment = process.env,
): readonly McpAccessGrantTarget[] {
  return loadMcpAccessGrantConfiguration(sourceEnvironment).targets;
}

export function evaluateMcpAccessGrantTargetConfiguration(
  target: McpAccessGrantTarget,
): TargetConfigurationEvaluation {
  return {
    configured: true,
    nonProduction: target.locality.nonProductionAcknowledged,
  };
}
