import crypto from "node:crypto";

export const REFRESH_TOKEN_EXPIRY_DAYS = 180;

/** Generate a cryptographically random refresh token (96-char hex string). */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

/** SHA-256 hash of a token string (hex digest). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
