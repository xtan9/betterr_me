import {
  createClient as createSupabaseClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type AuthError,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { authenticateApiKeyCredential } from "@/lib/auth/api-key";
import {
  resolveAuthenticatedRequestContext,
  sanitizedAuthFailureContext,
  type AuthenticatedRequestAdapters,
  type AuthenticatedRequestPolicy,
  type CredentialOutcome,
} from "@/lib/auth/request-context";
import { log } from "@/lib/logger";
import { verifyMcpTokenCredential } from "@/lib/mcp/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const USER_API_READ_POLICY = {
  allowedCredentials: ["apiKey", "cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

export const USER_API_WRITE_POLICY = {
  allowedCredentials: ["apiKey", "cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

export const ADMIN_REQUEST_POLICY = {
  allowedCredentials: ["admin"],
  requiredPermission: "admin",
} as const satisfies AuthenticatedRequestPolicy;

export const MCP_REQUEST_POLICY = {
  allowedCredentials: ["mcp"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

function classifyUserError(
  error: AuthError,
  credential: "cookie" | "admin",
): CredentialOutcome<SupabaseClient> {
  if (isAuthSessionMissingError(error)) return { outcome: "anonymous" };
  if (
    isAuthApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return { outcome: "invalid" };
  }
  log.error("[auth] Credential validation failed", undefined, {
    credential,
    ...sanitizedAuthFailureContext(error),
  });
  return { outcome: "misconfigured" };
}

export async function authenticateCookieCredential(
  request: Request,
): Promise<CredentialOutcome<SupabaseClient>> {
  if (request.headers.get("authorization")?.startsWith("Bearer brm_")) {
    return { outcome: "anonymous" };
  }

  const client = await createServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) return classifyUserError(error, "cookie");
  if (!user) return { outcome: "anonymous" };

  return {
    outcome: "authenticated",
    principal: { userId: user.id, credential: "cookie" },
    permissions: ["read", "write"],
    client,
  };
}

export async function authenticateAdminCredential(
  request: Request,
): Promise<CredentialOutcome<SupabaseClient>> {
  if (request.headers.has("authorization")) return { outcome: "anonymous" };

  const client = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError) return classifyUserError(userError, "admin");
  if (!user) return { outcome: "anonymous" };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    if (profileError.code === "PGRST116") return { outcome: "forbidden" };
    log.error(
      "[auth] Admin profile lookup failed",
      undefined,
      sanitizedAuthFailureContext(profileError),
    );
    return { outcome: "misconfigured" };
  }
  if (profile?.role !== "admin") return { outcome: "forbidden" };

  return {
    outcome: "authenticated",
    principal: { userId: user.id, credential: "admin" },
    permissions: ["read", "write", "admin"],
    client: createAdminClient(),
  };
}

export async function authenticateMcpCredential(
  request: Request,
): Promise<CredentialOutcome<SupabaseClient>> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { outcome: "anonymous" };

  const token = authorization.slice("Bearer ".length);
  if (!token || token.startsWith("brm_")) return { outcome: "anonymous" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.API_KEY_HMAC_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !tokenSecret) {
    log.error("[auth] MCP credential configuration is incomplete");
    return { outcome: "misconfigured" };
  }

  const verified = await verifyMcpTokenCredential(token);
  if (verified.outcome !== "authenticated") return verified;

  const permissions = verified.scopes.filter(
    (scope): scope is "read" | "write" =>
      scope === "read" || scope === "write",
  );

  return {
    outcome: "authenticated",
    principal: {
      userId: verified.userId,
      credential: "mcp",
      clientId: verified.clientId,
    },
    permissions,
    client: createSupabaseClient(supabaseUrl, serviceRoleKey),
  };
}

export const authenticatedRequestAdapters: AuthenticatedRequestAdapters = {
  cookie: authenticateCookieCredential,
  apiKey: authenticateApiKeyCredential,
  admin: authenticateAdminCredential,
  mcp: authenticateMcpCredential,
};

export function authenticateRequest(
  request: Request,
  policy: AuthenticatedRequestPolicy,
) {
  return resolveAuthenticatedRequestContext(
    request,
    policy,
    authenticatedRequestAdapters,
  );
}
