import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/logger";
import { ACCESS_TOKEN_POLICY } from "@/lib/oauth/access-token";
import { createOAuthCredentialLifecycle } from "@/lib/oauth/credential-lifecycle";
import { authenticateRequest } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";

const AUTHORIZE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;
function isValidRedirectUri(uri: string): boolean {
  return LOCALHOST_RE.test(uri);
}

function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET /api/oauth/authorize
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");
    const responseType = searchParams.get("response_type");
    const state = searchParams.get("state");
    const codeChallenge = searchParams.get("code_challenge");
    const codeChallengeMethod = searchParams.get("code_challenge_method");

    // --- Validate required params ---

    if (!clientId) {
      return errorJson("client_id is required");
    }

    if (!redirectUri) {
      return errorJson("redirect_uri is required");
    }

    if (!isValidRedirectUri(redirectUri)) {
      return errorJson(
        "redirect_uri must match http://localhost or http://127.0.0.1 (with any port/path)",
      );
    }

    if (responseType !== "code") {
      return errorJson("response_type must be 'code'");
    }

    if (!state) {
      return errorJson("state is required");
    }

    if (!codeChallenge) {
      return errorJson("code_challenge is required");
    }

    if (codeChallengeMethod !== "S256") {
      return errorJson("code_challenge_method must be 'S256'");
    }

    // --- Check session ---

    const auth = await authenticateRequest(request, AUTHORIZE_REQUEST_POLICY);
    if (!auth.ok) {
      // Redirect to login with returnTo so user comes back after auth
      const currentUrl = request.nextUrl.toString();
      const loginUrl = new URL("/auth/login", request.nextUrl.origin);
      loginUrl.searchParams.set("returnTo", currentUrl);
      return NextResponse.redirect(loginUrl.toString(), 302);
    }

    // --- Generate authorization code ---

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { code } = await createOAuthCredentialLifecycle(
      serviceClient,
    ).issueAuthorizationCode({
      clientId,
      redirectUri,
      userId: auth.principal.userId,
      scopes: [...ACCESS_TOKEN_POLICY.defaultScopes],
      codeChallenge,
      codeChallengeMethod: "S256",
    });

    // Redirect back to client with code and state
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);

    return NextResponse.redirect(callbackUrl.toString(), 302);
  } catch (error) {
    log.error("GET /api/oauth/authorize error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
