import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { createOAuthCredentialLifecycle } from "@/lib/oauth/credential-lifecycle";
import { oauthRefreshGrantSchema } from "@/lib/validations/oauth";



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

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

  const result = await createOAuthCredentialLifecycle(
    serviceClient,
  ).rotateRefreshToken({
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

    const result = await createOAuthCredentialLifecycle(
      serviceClient,
    ).exchangeAuthorizationCode({
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
