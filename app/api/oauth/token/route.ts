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
  } catch {
    return null;
  }
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

    // --- Validate required params ---

    if (grant_type !== "authorization_code") {
      return oauthError(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code'",
      );
    }

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

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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

    await serviceClient.from("oauth_refresh_tokens").insert({
      token_hash: refreshTokenHash,
      user_id: storedCode.user_id,
      expires_at: refreshExpiresAt,
    });

    // --- Opportunistic cleanup of old tokens ---
    await serviceClient
      .from("oauth_refresh_tokens")
      .delete()
      .or(
        `expires_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()},and(revoked.eq.true,created_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})`,
      );

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
