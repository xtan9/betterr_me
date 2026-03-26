import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors @modelcontextprotocol/sdk AuthInfo so we don't need the SDK installed yet. */
export interface McpAuthInfo {
  token: string;
  scopes: string[];
  clientId: string;
  extra: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

/** Lazy singleton – only created when first needed. */
let _serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!_serviceClient) {
    _serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _serviceClient;
}

// ---------------------------------------------------------------------------
// signMcpToken
// ---------------------------------------------------------------------------

/**
 * Create an HS256 JWT access token for the MCP OAuth flow.
 *
 * - `sub`  = userId
 * - `aud`  = "mcp"
 * - `exp`  = now + 24 h
 *
 * Signed with `API_KEY_HMAC_SECRET` using Node.js native crypto.
 */
export async function signMcpToken(userId: string): Promise<string> {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error("API_KEY_HMAC_SECRET not configured");
  }

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      aud: "mcp",
      iat: now,
      exp: now + 86400, // 24 hours
    }),
  );

  const data = `${header}.${payload}`;
  const signature = base64url(
    crypto.createHmac("sha256", secret).update(data).digest(),
  );

  return `${data}.${signature}`;
}

// ---------------------------------------------------------------------------
// verifyMcpToken
// ---------------------------------------------------------------------------

/**
 * Verify an MCP JWT token and return `{ userId }` or `null` on failure.
 *
 * Checks performed:
 * 1. Structural validity (3 parts)
 * 2. HMAC-SHA-256 signature
 * 3. `aud === "mcp"`
 * 4. Token not expired (`exp > now`)
 * 5. User exists in the `profiles` table (via service-role client)
 */
export async function verifyMcpToken(
  bearerToken: string,
): Promise<{ userId: string } | null> {
  try {
    const secret = process.env.API_KEY_HMAC_SECRET;
    if (!secret) {
      log.error("API_KEY_HMAC_SECRET not configured");
      return null;
    }

    // 1. Split & decode
    const parts = bearerToken.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // 2. Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = base64url(
      crypto.createHmac("sha256", secret).update(data).digest(),
    );

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signatureB64),
        Buffer.from(expectedSig),
      )
    ) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    ) as {
      sub?: string;
      aud?: string;
      exp?: number;
    };

    // 3. Audience check
    if (payload.aud !== "mcp") return null;

    // 4. Expiry check
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) return null;

    // 5. Subject (userId) must exist
    const userId = payload.sub;
    if (!userId) return null;

    // 6. Verify user exists in profiles
    const supabase = getServiceClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (error || !profile) return null;

    return { userId };
  } catch (err) {
    log.error("Failed to verify MCP token", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// verifyMcpAuth  –  adapter for withMcpAuth integration
// ---------------------------------------------------------------------------

/**
 * Verify the bearer token from an MCP request and return an AuthInfo-shaped
 * object, or `undefined` if authentication fails.
 */
export async function verifyMcpAuth(
  _req: Request,
  bearerToken?: string,
): Promise<McpAuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const result = await verifyMcpToken(bearerToken);
  if (!result) return undefined;

  return {
    token: bearerToken,
    scopes: ["read", "write"],
    clientId: result.userId,
    extra: { userId: result.userId },
  };
}
