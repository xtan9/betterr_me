import crypto from "node:crypto";

export const ACCESS_TOKEN_POLICY = {
  audience: "mcp",
  defaultScopes: ["read", "write"],
  allowedScopes: ["read", "write"],
  lifetimeSeconds: 60 * 60,
  clockSkewSeconds: 30,
} as const;

export type AccessTokenScope =
  (typeof ACCESS_TOKEN_POLICY.allowedScopes)[number];

export interface AccessTokenContext {
  userId: string;
  clientId: string;
  scopes: readonly string[];
}

export interface AccessTokenCredential {
  accessToken: string;
  tokenType: "bearer";
  expiresIn: number;
  scope: string;
}

export type AccessTokenVerification =
  | {
      outcome: "verified";
      userId: string;
      clientId: string;
      scopes: AccessTokenScope[];
    }
  | { outcome: "invalid" }
  | { outcome: "misconfigured" };

type AccessTokenClaims = {
  iss: string;
  aud: typeof ACCESS_TOKEN_POLICY.audience;
  sub: string;
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
};

function base64url(data: Buffer | string): string {
  return (typeof data === "string" ? Buffer.from(data) : data).toString(
    "base64url",
  );
}

export function getOAuthIssuer(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://betterr.me").replace(
    /\/$/,
    "",
  );
}

export function resolveAccessTokenScopes(
  scopes: readonly string[],
): AccessTokenScope[] {
  if (scopes.length === 0) {
    throw new Error("Access token requires at least one scope");
  }

  const allowedScopes = new Set<string>(ACCESS_TOKEN_POLICY.allowedScopes);
  const resolved = [...new Set(scopes)];
  if (resolved.some((scope) => !allowedScopes.has(scope))) {
    throw new Error("Unsupported access-token scope");
  }
  return resolved as AccessTokenScope[];
}

export async function issueAccessToken(
  context: AccessTokenContext,
  now: () => Date = () => new Date(Date.now()),
): Promise<AccessTokenCredential> {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) throw new Error("API_KEY_HMAC_SECRET not configured");
  if (!context.userId || !context.clientId) {
    throw new Error("Access token requires a subject and client");
  }

  const scopes = resolveAccessTokenScopes(context.scopes);
  const issuedAt = Math.floor(now().getTime() / 1000);
  const claims: AccessTokenClaims = {
    iss: getOAuthIssuer(),
    aud: ACCESS_TOKEN_POLICY.audience,
    sub: context.userId,
    client_id: context.clientId,
    scope: scopes.join(" "),
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_POLICY.lifetimeSeconds,
  };
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signedContent = `${header}.${payload}`;
  const signature = base64url(
    crypto.createHmac("sha256", secret).update(signedContent).digest(),
  );

  return {
    accessToken: `${signedContent}.${signature}`,
    tokenType: "bearer",
    expiresIn: ACCESS_TOKEN_POLICY.lifetimeSeconds,
    scope: scopes.join(" "),
  };
}

function isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const claims = value as Record<string, unknown>;
  return (
    claims.iss === getOAuthIssuer() &&
    claims.aud === ACCESS_TOKEN_POLICY.audience &&
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.client_id === "string" &&
    claims.client_id.length > 0 &&
    typeof claims.scope === "string" &&
    claims.scope.length > 0 &&
    typeof claims.iat === "number" &&
    Number.isInteger(claims.iat) &&
    typeof claims.exp === "number" &&
    Number.isInteger(claims.exp) &&
    claims.exp - claims.iat === ACCESS_TOKEN_POLICY.lifetimeSeconds
  );
}

export async function verifyAccessToken(
  bearerToken: string,
  now: () => Date = () => new Date(Date.now()),
): Promise<AccessTokenVerification> {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) return { outcome: "misconfigured" };

  const parts = bearerToken.split(".");
  if (parts.length !== 3) return { outcome: "invalid" };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return { outcome: "invalid" };
  }
  if (
    typeof header !== "object" ||
    header === null ||
    Array.isArray(header) ||
    (header as Record<string, unknown>).alg !== "HS256" ||
    (header as Record<string, unknown>).typ !== "JWT"
  ) {
    return { outcome: "invalid" };
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const suppliedSignature = Buffer.from(signatureB64, "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return { outcome: "invalid" };
  }
  if (!isAccessTokenClaims(claims)) return { outcome: "invalid" };

  const currentTime = Math.floor(now().getTime() / 1000);
  if (claims.exp + ACCESS_TOKEN_POLICY.clockSkewSeconds <= currentTime) {
    return { outcome: "invalid" };
  }
  if (claims.iat - ACCESS_TOKEN_POLICY.clockSkewSeconds > currentTime) {
    return { outcome: "invalid" };
  }

  let scopes: AccessTokenScope[];
  try {
    scopes = resolveAccessTokenScopes(claims.scope.split(/\s+/).filter(Boolean));
  } catch {
    return { outcome: "invalid" };
  }

  return {
    outcome: "verified",
    userId: claims.sub,
    clientId: claims.client_id,
    scopes,
  };
}
