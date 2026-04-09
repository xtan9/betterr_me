import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/logger";
import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from "@/lib/mcp/refresh-token";
import { signMcpToken } from "@/lib/mcp/token";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cleanupExpiredTokens(client: ReturnType<typeof createClient>) {
  const { error } = await client
    .from("oauth_refresh_tokens")
    .delete()
    .or(
      `expires_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()},and(revoked.eq.true,created_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})`,
    );
  if (error) {
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
  serviceClient: ReturnType<typeof createClient>,
) {
  const { refresh_token } = body;

  if (!refresh_token) {
    return oauthError("invalid_request", "refresh_token is required");
  }

  const tokenHash = hashToken(refresh_token);

  // Look up the refresh token
  const { data: storedToken, error: lookupError } = await serviceClient
    .from("oauth_refresh_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (lookupError || !storedToken) {
    return oauthError("invalid_grant", "Invalid refresh token", 401);
  }

  // Check expiry
  if (new Date(storedToken.expires_at) < new Date()) {
    return oauthError("invalid_grant", "Refresh token expired", 401);
  }

  // Reuse detection FIRST: if already rotated, revoke ALL tokens for this user
  if (storedToken.replaced_by_hash) {
    const { error: revokeAllError } = await serviceClient
      .from("oauth_refresh_tokens")
      .update({ revoked: true })
      .eq("user_id", storedToken.user_id);

    if (revokeAllError) {
      log.error("[oauth] Failed to revoke all tokens during reuse detection", revokeAllError, {
        userId: storedToken.user_id,
      });
    }

    log.error("[oauth] Refresh token reuse detected", {
      userId: storedToken.user_id,
      tokenHash,
    });

    return oauthError(
      "invalid_grant",
      "Token reuse detected — all sessions revoked",
      401,
    );
  }

  // Then check revoked (covers manually-revoked tokens without replacement)
  if (storedToken.revoked) {
    return oauthError("invalid_grant", "Refresh token revoked", 401);
  }

  // --- Rotate: issue new refresh token ---
  const newRawToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Insert new token first (safer — if this fails, old token still valid)
  const { error: insertError } = await serviceClient
    .from("oauth_refresh_tokens")
    .insert({
      token_hash: newTokenHash,
      user_id: storedToken.user_id,
      expires_at: newExpiresAt,
    });

  if (insertError) {
    log.error("[oauth] Failed to insert new refresh token", insertError, {
      userId: storedToken.user_id,
    });
    return oauthError("server_error", "Token rotation failed", 500);
  }

  // Mark old token as replaced (atomic claim — only if still unclaimed)
  const { data: revokedRows, error: revokeError } = await serviceClient
    .from("oauth_refresh_tokens")
    .update({ revoked: true, replaced_by_hash: newTokenHash })
    .eq("token_hash", tokenHash)
    .eq("revoked", false)
    .select("id");

  if (revokeError) {
    log.error("[oauth] Failed to revoke old refresh token", revokeError, { tokenHash });
  }

  if (!revokedRows || revokedRows.length === 0) {
    // Concurrent request already claimed this token — roll back our insert
    await serviceClient
      .from("oauth_refresh_tokens")
      .delete()
      .eq("token_hash", newTokenHash);
    return oauthError("invalid_grant", "Token already consumed", 401);
  }

  // --- Issue new access token ---
  const accessToken = await signMcpToken(storedToken.user_id);

  // --- Opportunistic cleanup ---
  await cleanupExpiredTokens(serviceClient);

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: newRawToken,
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

    const { grant_type, code, code_verifier, redirect_uri } = body;

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
      return handleRefreshToken(body, serviceClient);
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

    // --- Look up authorization code ---

    const codeHash = crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");

    // Atomically claim the code (prevents TOCTOU race condition).
    // UPDATE ... WHERE used = false returns the row only if unclaimed.
    const { data: storedCode, error: claimError } = await serviceClient
      .from("oauth_codes")
      .update({ used: true })
      .eq("code_hash", codeHash)
      .eq("used", false)
      .select("*")
      .single();

    if (claimError || !storedCode) {
      return oauthError("invalid_grant", "Authorization code not found or already used");
    }

    // --- Validate code ---

    if (new Date(storedCode.expires_at) < new Date()) {
      return oauthError("invalid_grant", "Authorization code expired");
    }

    if (storedCode.redirect_uri !== redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri mismatch");
    }

    // --- PKCE verification ---

    const expectedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");

    if (expectedChallenge !== storedCode.code_challenge) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }

    // --- Issue access token ---

    const accessToken = await signMcpToken(storedCode.user_id);

    // --- Issue refresh token ---
    const rawRefreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: refreshInsertError } = await serviceClient
      .from("oauth_refresh_tokens")
      .insert({
        token_hash: refreshTokenHash,
        user_id: storedCode.user_id,
        expires_at: refreshExpiresAt,
      });

    if (refreshInsertError) {
      log.error("[oauth] Failed to store refresh token", refreshInsertError, {
        userId: storedCode.user_id,
      });
      return oauthError("server_error", "Failed to issue refresh token", 500);
    }

    // --- Opportunistic cleanup of old tokens ---
    await cleanupExpiredTokens(serviceClient);

    return NextResponse.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: rawRefreshToken,
    });
  } catch (error) {
    log.error("POST /api/oauth/token error", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Internal server error" },
      { status: 500 },
    );
  }
}
