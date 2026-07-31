import { createClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/oauth/access-token";

/** Mirrors @modelcontextprotocol/sdk AuthInfo. */
export interface McpAuthInfo {
  token: string;
  scopes: string[];
  clientId: string;
  extra: Record<string, unknown>;
}

let serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return serviceClient;
}

export type McpTokenCredentialOutcome =
  | {
      outcome: "authenticated";
      userId: string;
      clientId: string;
      scopes: string[];
    }
  | { outcome: "invalid" }
  | { outcome: "misconfigured" };

/** Apply the shared access-token policy and ensure its subject still exists. */
export async function verifyMcpTokenCredential(
  bearerToken: string,
): Promise<McpTokenCredentialOutcome> {
  const verified = await verifyAccessToken(bearerToken);
  if (verified.outcome === "misconfigured") {
    log.error("MCP token verification failed: API_KEY_HMAC_SECRET not configured");
    return verified;
  }
  if (verified.outcome === "invalid") {
    log.warn("[mcp] Token rejected by access-token policy");
    return verified;
  }

  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      log.error("[mcp] Token verification configuration is incomplete");
      return { outcome: "misconfigured" };
    }
    const { data: profile, error } = await getServiceClient()
      .from("profiles")
      .select("id")
      .eq("id", verified.userId)
      .single();

    if (error) {
      log.error("MCP token verification: profile lookup failed", error);
      return error.code === "PGRST116"
        ? { outcome: "invalid" }
        : { outcome: "misconfigured" };
    }
    if (!profile) return { outcome: "invalid" };
  } catch (error) {
    log.error("MCP token verification: Supabase connection error", error);
    return { outcome: "misconfigured" };
  }

  return {
    outcome: "authenticated",
    userId: verified.userId,
    clientId: verified.clientId,
    scopes: verified.scopes,
  };
}

export async function verifyMcpToken(
  bearerToken: string,
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
  const result = await verifyMcpTokenCredential(bearerToken);
  if (result.outcome !== "authenticated") return null;
  return {
    userId: result.userId,
    clientId: result.clientId,
    scopes: result.scopes,
  };
}

export async function verifyMcpAuth(
  _request: Request,
  bearerToken?: string,
): Promise<McpAuthInfo | undefined> {
  if (!bearerToken) {
    log.error("verifyMcpAuth: no bearer token provided");
    return undefined;
  }

  const result = await verifyMcpToken(bearerToken);
  if (!result) {
    log.error("verifyMcpAuth: token verification failed");
    return undefined;
  }

  return {
    token: bearerToken,
    scopes: result.scopes,
    clientId: result.clientId,
    extra: { userId: result.userId },
  };
}
