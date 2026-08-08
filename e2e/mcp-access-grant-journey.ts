import crypto from "node:crypto";

import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

import {
  MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG,
  type RequestRecipeDefinition,
} from "./mcp-access-grant-catalogs";

/**
 * Adapter-safe mechanics for constructing MCP authorization requests.
 *
 * This module deliberately contains no gate, status, classifier, report, or
 * evidence operation. Its outputs are request inputs and control-flow guards;
 * live adapters remain responsible for observing and judging the resulting
 * protocol exchanges.
 */

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

/**
 * Stop an OAuth SDK request before it can use a resource other than the
 * configured Canonical MCP Resource. A guard intentionally throws instead of
 * returning a verdict that could be recorded as evidence.
 */
export function assertExactCanonicalResource(
  canonicalResource: string,
  candidate: string | undefined,
): void {
  if (!candidate || candidate !== canonicalResource) {
    throw new Error("OAuth resource must equal the configured Canonical MCP Resource");
  }
}

export function s256CodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export interface PublicNativeClientMetadataInput {
  registrationRedirectUri: string;
  clientName: string;
  clientUri: string;
  logoUri: string;
  softwareId: string;
  softwareVersion: string;
}

function requireRecipe(
  recipeKey: string,
  expected: Pick<RequestRecipeDefinition, "profile" | "source" | "method" | "operation">,
): RequestRecipeDefinition {
  const recipe = MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG[recipeKey];
  if (!recipe || recipe.profile !== expected.profile || recipe.source !== expected.source ||
    recipe.method !== expected.method || recipe.operation !== expected.operation) {
    throw new Error(`MCP request recipe ${recipeKey} is not compatible with the journey mechanic.`);
  }
  return recipe;
}

export function buildPublicNativeClientMetadata({
  registrationRedirectUri,
  clientName,
  clientUri,
  logoUri,
  softwareId,
  softwareVersion,
}: PublicNativeClientMetadataInput): OAuthClientMetadata {
  requireRecipe("public.registration.primary", {
    profile: "public-client",
    source: "public-client",
    method: "POST",
    operation: "dynamic-registration",
  });

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

export interface RegistrationNegativeCase {
  id: string;
  metadata: Record<string, unknown>;
}

const REGISTRATION_NEGATIVE_RECIPE_PREFIX = "public.registration.negative.";

const REGISTRATION_NEGATIVE_METADATA_OVERRIDES: Readonly<Record<string, (metadata: OAuthClientMetadata) => Record<string, unknown>>> = {
  [`${REGISTRATION_NEGATIVE_RECIPE_PREFIX}unsupported-client-auth-method`]: (metadata) => ({
    ...metadata,
    token_endpoint_auth_method: "client_secret_post",
  }),
  [`${REGISTRATION_NEGATIVE_RECIPE_PREFIX}unsupported-grant-type`]: (metadata) => ({
    ...metadata,
    grant_types: ["client_credentials"],
  }),
  [`${REGISTRATION_NEGATIVE_RECIPE_PREFIX}unsupported-response-type`]: (metadata) => ({
    ...metadata,
    response_types: ["token"],
  }),
  [`${REGISTRATION_NEGATIVE_RECIPE_PREFIX}malformed-metadata`]: (metadata) => ({
    ...metadata,
    redirect_uris: ["not-a-loopback-uri"],
  }),
  [`${REGISTRATION_NEGATIVE_RECIPE_PREFIX}unsafe-redirect-metadata`]: (metadata) => ({
    ...metadata,
    redirect_uris: ["https://untrusted-client.example.test/callback"],
  }),
};

function registrationNegativeRecipes(): Array<[string, RequestRecipeDefinition]> {
  const catalogEntries = Object.entries(MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG)
    .filter(([key]) => key.startsWith(REGISTRATION_NEGATIVE_RECIPE_PREFIX));
  const expectedKeys = Object.keys(REGISTRATION_NEGATIVE_METADATA_OVERRIDES);
  const catalogKeys = catalogEntries.map(([key]) => key);
  const sameKeys = catalogKeys.length === expectedKeys.length &&
    catalogKeys.every((key) => expectedKeys.includes(key));

  if (!sameKeys) {
    throw new Error("MCP registration negative recipes must match the closed Candidate 2 catalog.");
  }

  return catalogEntries.map(([recipeKey]) => [
    recipeKey,
    requireRecipe(recipeKey, {
      profile: "public-client",
      source: "public-client",
      method: "POST",
      operation: "negative-registration",
    }),
  ]);
}

export function buildRegistrationNegativeCases(
  metadata: OAuthClientMetadata,
): RegistrationNegativeCase[] {
  return registrationNegativeRecipes().map(([recipeKey]) => {
    const override = REGISTRATION_NEGATIVE_METADATA_OVERRIDES[recipeKey];
    if (!override) {
      throw new Error(`MCP registration recipe ${recipeKey} has no request mechanic.`);
    }

    return {
      id: recipeKey.slice(REGISTRATION_NEGATIVE_RECIPE_PREFIX.length),
      metadata: override(metadata),
    };
  });
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
