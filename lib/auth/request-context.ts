import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";

export type CredentialKind =
  | "cookie"
  | "apiKey"
  | "admin"
  | "adminSecret"
  | "mcp";
export type RequestPermission = "read" | "write" | "admin";

type UserCredentialKind = Exclude<CredentialKind, "adminSecret">;

type AuthenticatedUserPrincipal = {
  [Credential in UserCredentialKind]: {
    type: "user";
    userId: string;
    credential: Credential;
    clientId?: string;
  };
}[UserCredentialKind];

export type AuthenticatedPrincipal =
  | AuthenticatedUserPrincipal
  | {
      type: "service";
      serviceId: string;
      credential: "adminSecret";
      clientId?: string;
    };

type AuthenticatedCredential<Client> = {
  outcome: "authenticated";
  principal: AuthenticatedPrincipal;
  permissions: readonly RequestPermission[];
  client: Client;
  onAuthorized?: () => void;
};

export type CredentialOutcome<Client> =
  | AuthenticatedCredential<Client>
  | { outcome: "anonymous" }
  | { outcome: "invalid" }
  | { outcome: "forbidden" }
  | { outcome: "misconfigured" };

export type CredentialAdapter<Client> = (
  request: Request,
) => Promise<CredentialOutcome<Client>>;

export type AuthenticatedRequestAdapters<Client = SupabaseClient> = Record<
  CredentialKind,
  CredentialAdapter<Client>
>;

export type AuthenticatedRequestPolicy = {
  allowedCredentials: readonly CredentialKind[];
  requiredPermission: RequestPermission;
};

export type AuthenticatedRequestContext<
  Client = SupabaseClient,
  Credential extends CredentialKind = CredentialKind,
> = {
  ok: true;
  outcome: "authenticated";
  principal: Extract<AuthenticatedPrincipal, { credential: Credential }>;
  permissions: readonly RequestPermission[];
  requiredPermission: RequestPermission;
  client: Client;
};

export type AuthenticatedRequestError = {
  ok: false;
  outcome: "anonymous" | "invalid" | "forbidden" | "misconfigured";
  error: "Unauthorized" | "Invalid credentials" | "Forbidden" | "Server misconfigured";
  status: 401 | 403 | 500;
};

export function sanitizedAuthFailureContext(
  error: unknown,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    failureType:
      error === null
        ? "null"
        : error instanceof Error
          ? error.name
          : typeof error,
  };
  if (typeof error !== "object" || error === null) return context;

  for (const key of ["code", "status"] as const) {
    const value = Object.getOwnPropertyDescriptor(error, key)?.value;
    if (typeof value === "string" || typeof value === "number") {
      context[key] = value;
    }
  }
  return context;
}

export async function resolveAuthenticatedRequestContext<
  Client,
  Policy extends AuthenticatedRequestPolicy,
>(
  request: Request,
  policy: Policy,
  adapters: AuthenticatedRequestAdapters<Client>,
): Promise<
  | AuthenticatedRequestContext<Client, Policy["allowedCredentials"][number]>
  | AuthenticatedRequestError
> {
  if (policy.allowedCredentials.length === 0) {
    log.error("[auth] Request policy has no allowed credentials");
    return {
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    };
  }

  for (const credential of policy.allowedCredentials) {
    let result: CredentialOutcome<Client>;
    try {
      result = await adapters[credential](request);
    } catch (error) {
      log.error("[auth] Credential adapter failed", undefined, {
        credential,
        ...sanitizedAuthFailureContext(error),
      });
      return {
        ok: false,
        outcome: "misconfigured",
        error: "Server misconfigured",
        status: 500,
      };
    }
    if (result.outcome === "anonymous") continue;
    if (result.outcome === "invalid") {
      return {
        ok: false,
        outcome: "invalid",
        error: "Invalid credentials",
        status: 401,
      };
    }
    if (result.outcome === "forbidden") {
      return {
        ok: false,
        outcome: "forbidden",
        error: "Forbidden",
        status: 403,
      };
    }
    if (result.outcome === "misconfigured") {
      log.error(
        "[auth] Credential adapter reported misconfiguration",
        undefined,
        { credential },
      );
      return {
        ok: false,
        outcome: "misconfigured",
        error: "Server misconfigured",
        status: 500,
      };
    }
    if (result.principal.credential !== credential) {
      log.error(
        "[auth] Credential adapter returned a mismatched principal",
        undefined,
        {
          adapterCredential: credential,
          principalCredential: result.principal.credential,
        },
      );
      return {
        ok: false,
        outcome: "misconfigured",
        error: "Server misconfigured",
        status: 500,
      };
    }
    if (!result.permissions.includes(policy.requiredPermission)) {
      return {
        ok: false,
        outcome: "forbidden",
        error: "Forbidden",
        status: 403,
      };
    }

    result.onAuthorized?.();

    return {
      ok: true,
      outcome: "authenticated",
      principal: result.principal as Extract<
        AuthenticatedPrincipal,
        { credential: Policy["allowedCredentials"][number] }
      >,
      permissions: result.permissions,
      requiredPermission: policy.requiredPermission,
      client: result.client,
    };
  }

  if (request.headers.has("authorization")) {
    return {
      ok: false,
      outcome: "invalid",
      error: "Invalid credentials",
      status: 401,
    };
  }

  return {
    ok: false,
    outcome: "anonymous",
    error: "Unauthorized",
    status: 401,
  };
}
