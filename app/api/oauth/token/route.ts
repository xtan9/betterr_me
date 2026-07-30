import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/logger";
import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from "@/lib/mcp/refresh-token";
import { signMcpToken } from "@/lib/mcp/token";
import { createAuthorizationCodeExchanger } from "@/lib/oauth/authorization-code";
import { createRefreshTokenRotator } from "@/lib/oauth/refresh-token";
import { createSupabaseAuthorizationCodeStore } from "@/lib/oauth/supabase-authorization-code-store";
import { createSupabaseRefreshTokenStore } from "@/lib/oauth/supabase-refresh-token-store";
import { oauthRefreshGrantSchema } from "@/lib/validations/oauth";



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

async function cleanupExpiredTokens(client: ServiceClient) {
  try {
    const { error } = await client.rpc("cleanup_oauth_refresh_token_families", {
      expired_before: new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString(),
      revoked_before: new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (!error) return;
    log.warn("[oauth] Refresh token cleanup failed", { error: String(error) });
  } catch (error) {
    log.warn("[oauth] Refresh token cleanup failed", { error: String(error) });
  }
}

function oauthError(
  error: string,
  errorDescription: string,
  status = 400,
) {
  return NextResponse.json({ error, error_description: errorDescription }, { status });
}

async function parseBody(
  request: NextRequest,
): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // Default: try JSON
  try {
    return (await request.json()) as Record<string, string>;
  } catch (err) {
    log.warn("[oauth] Could not parse request body as JSON", { error: String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Refresh token exchange
// ---------------------------------------------------------------------------

async function handleRefreshToken(
  body: Record<string, string>,
  serviceClient: ServiceClient,
) {
  const parsed = oauthRefreshGrantSchema.safeParse(body);
  if (!parsed.success) {
    const invalidFields = new Set(
      parsed.error.issues.map(({ path }) => path[0]),
    );
    if (invalidFields.has("refresh_token")) {
      return oauthError("invalid_request", "refresh_token is required");
    }
    if (invalidFields.has("client_id")) {
      return oauthError("invalid_request", "client_id is required");
    }
    return oauthError("invalid_request", "Invalid refresh-token request");
  }
  const { refresh_token, client_id } = parsed.data;

  const rotator = createRefreshTokenRotator({
    store: createSupabaseRefreshTokenStore(serviceClient),
    issueAccessToken: ({ userId, clientId, scopes }) =>
      signMcpToken(userId, clientId, scopes),
  });
  const result = await rotator.rotate({
    refreshToken: refresh_token,
    clientId: client_id,
  });
  if (!result.ok) {
    const descriptions = {
      invalid_token: "Invalid refresh token",
      expired_token: "Refresh token expired",
      mismatched_context: "Refresh token context mismatch",
      revoked_token: "Refresh token revoked",
      reused_token: "Token reuse detected — token family revoked",
    } satisfies Record<typeof result.error, string>;
    return oauthError("invalid_grant", descriptions[result.error], 401);
  }

  await cleanupExpiredTokens(serviceClient);

  return NextResponse.json({
    access_token: result.credentials.accessToken,
    token_type: result.credentials.tokenType,
    expires_in: result.credentials.expiresIn,
    refresh_token: result.credentials.refreshToken,
    scope: result.credentials.scope,
  });
}

// ---------------------------------------------------------------------------
// POST /api/oauth/token
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    if (!body) {
      return oauthError("invalid_request", "Could not parse request body");
    }

    const { grant_type, code, code_verifier, redirect_uri, client_id } = body;

    // --- Validate grant_type ---

    if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
      return oauthError(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code' or 'refresh_token'",
      );
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (grant_type === "refresh_token") {
      return await handleRefreshToken(body, serviceClient);
    }

    // --- authorization_code flow ---

    if (!code) {
      return oauthError("invalid_request", "code is required");
    }

    if (!code_verifier) {
      return oauthError("invalid_request", "code_verifier is required");
    }

    if (!redirect_uri) {
      return oauthError("invalid_request", "redirect_uri is required");
    }

    if (!client_id) {
      return oauthError("invalid_request", "client_id is required");
    }

    const exchanger = createAuthorizationCodeExchanger({
      store: createSupabaseAuthorizationCodeStore(serviceClient),
      issueCredentials: async ({ clientId, userId, scopes }) => {
        const accessToken = await signMcpToken(userId, clientId, scopes);
        const rawRefreshToken = generateRefreshToken();
        const refreshTokenHash = hashToken(rawRefreshToken);
        const refreshExpiresAt = new Date(
          Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { error } = await serviceClient
          .from("oauth_refresh_tokens")
          .insert({
            token_hash: refreshTokenHash,
            client_id: clientId,
            user_id: userId,
            scopes,
            expires_at: refreshExpiresAt,
          });
        if (error) throw new Error("Failed to issue refresh token", { cause: error });
        await cleanupExpiredTokens(serviceClient);
        return {
          accessToken,
          tokenType: "bearer" as const,
          expiresIn: 3600,
          refreshToken: rawRefreshToken,
          scope: scopes.join(" "),
        };
      },
    });
    const result = await exchanger.exchange({
      code,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeVerifier: code_verifier,
    });
    if (!result.ok) {
      return oauthError("invalid_grant", result.error);
    }
    return NextResponse.json({
      access_token: result.credentials.accessToken,
      token_type: result.credentials.tokenType,
      expires_in: result.credentials.expiresIn,
      refresh_token: result.credentials.refreshToken,
      scope: result.credentials.scope,
    });
  } catch (error) {
    log.error("POST /api/oauth/token error", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Internal server error" },
      { status: 500 },
    );
  }
}
