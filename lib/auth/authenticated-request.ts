import {
  createClient as createSupabaseClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type AuthError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

import { authenticateApiKeyCredential } from "@/lib/auth/api-key";
import {
  resolveAuthenticatedRequestContext,
  sanitizedAuthFailureContext,
  type AuthenticatedRequestAdapters,
  type AuthenticatedRequestError,
  type AuthenticatedRequestPolicy,
  type CredentialOutcome,
} from "@/lib/auth/request-context";
import { log } from "@/lib/logger";
import { verifyMcpTokenCredential } from "@/lib/mcp/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

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

export function verifiedIdentityEmail(user: User): string | null {
  return user.email && user.email_confirmed_at ? user.email : null;
}

function authenticatedUserProfile(user: User) {
  const fullName = user.user_metadata?.full_name;
  const avatarUrl = user.user_metadata?.avatar_url;
  if (user.email === undefined && fullName === undefined && avatarUrl === undefined) {
    return undefined;
  }
  return {
    email: verifiedIdentityEmail(user),
    fullName: typeof fullName === "string" ? fullName : null,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
  };
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
  const profile = authenticatedUserProfile(user);

  return {
    outcome: "authenticated",
    principal: {
      type: "user",
      userId: user.id,
      credential: "cookie",
      ...(profile && { profile }),
    },
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
    principal: { type: "user", userId: user.id, credential: "admin" },
    permissions: ["read", "write", "admin"],
    client: createAdminClient(),
  };
}

export async function authenticateAdminSecretCredential(
  request: Request,
): Promise<CredentialOutcome<SupabaseClient>> {
  const suppliedAdminSecret = request.headers.get("x-admin-secret");
  if (suppliedAdminSecret === null) return { outcome: "anonymous" };

  const configuredAdminSecret = process.env.ADMIN_SYNC_SECRET;
  if (!configuredAdminSecret) {
    log.error("[auth] Admin secret credential is not configured");
    return { outcome: "misconfigured" };
  }
  if (suppliedAdminSecret !== configuredAdminSecret) {
    return { outcome: "invalid" };
  }

  return {
    outcome: "authenticated",
    principal: {
      type: "service",
      serviceId: "admin-sync",
      credential: "adminSecret",
    },
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
      type: "user",
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
  adminSecret: authenticateAdminSecretCredential,
  mcp: authenticateMcpCredential,
};

/** Preserve the public error contract of cookie-only browser routes. */
export function cookieRouteErrorMessage(error: AuthenticatedRequestError) {
  return error.status === 401 ? "Unauthorized" : error.error;
}

export function authenticateRequest<Policy extends AuthenticatedRequestPolicy>(
  request: Request,
  policy: Policy,
) {
  return resolveAuthenticatedRequestContext(
    request,
    policy,
    authenticatedRequestAdapters,
  );
}
