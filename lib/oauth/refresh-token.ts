import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from "@/lib/mcp/refresh-token";

const ACCESS_TOKEN_EXPIRY_SECONDS = 3600;
const REFRESH_TOKEN_EXPIRY_MS =
  REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const UNUSED_REUSE_REPLACEMENT_HASH = "0".repeat(64);

export interface RefreshTokenContext {
  clientId: string;
  userId: string;
  scopes: string[];
}

export interface RotateStoredRefreshToken {
  currentTokenHash: string;
  nextTokenHash: string;
  nextExpiresAt: Date;
  clientId: string;
  now: Date;
}

export interface ResolveStoredRefreshToken {
  currentTokenHash: string;
  clientId: string;
  now: Date;
}

export type RefreshTokenRotationFailure =
  | "invalid_token"
  | "expired_token"
  | "mismatched_context"
  | "revoked_token"
  | "reused_token";

export type StoredRefreshTokenRotationResult =
  | { ok: true; context: RefreshTokenContext }
  | { ok: false; error: RefreshTokenRotationFailure };

export type StoredRefreshTokenResolutionResult =
  | { ok: true; context: RefreshTokenContext }
  | { ok: false; error: RefreshTokenRotationFailure };

export interface RefreshTokenRotationStore {
  resolve(
    input: ResolveStoredRefreshToken,
  ): Promise<StoredRefreshTokenResolutionResult>;
  rotate(
    input: RotateStoredRefreshToken,
  ): Promise<StoredRefreshTokenRotationResult>;
}

export interface RefreshTokenRotatorDependencies {
  store: RefreshTokenRotationStore;
  now?: () => Date;
  generateToken?: () => string;
  issueAccessToken(context: RefreshTokenContext): Promise<string>;
}

export interface RotateRefreshToken {
  refreshToken: string;
  clientId: string;
}

export type RefreshTokenRotationResult =
  | {
      ok: true;
      credentials: {
        accessToken: string;
        tokenType: "bearer";
        expiresIn: number;
        refreshToken: string;
        scope: string;
      };
    }
  | { ok: false; error: RefreshTokenRotationFailure };

export function createRefreshTokenRotator({
  store,
  now = () => new Date(),
  generateToken = generateRefreshToken,
  issueAccessToken,
}: RefreshTokenRotatorDependencies) {
  return {
    async rotate(input: RotateRefreshToken): Promise<RefreshTokenRotationResult> {
      const rotatedAt = now();
      const currentTokenHash = hashToken(input.refreshToken);
      const resolution = await store.resolve({
        currentTokenHash,
        clientId: input.clientId,
        now: rotatedAt,
      });

      if (!resolution.ok) {
        if (resolution.error !== "reused_token") return resolution;

        const reuseResult = await store.rotate({
          currentTokenHash,
          // The database exits through its reuse response before insertion.
          // Keep family revocation independent of the randomness boundary.
          nextTokenHash: UNUSED_REUSE_REPLACEMENT_HASH,
          nextExpiresAt: new Date(
            rotatedAt.getTime() + REFRESH_TOKEN_EXPIRY_MS,
          ),
          clientId: input.clientId,
          now: rotatedAt,
        });
        if (!reuseResult.ok) return reuseResult;
        throw new Error("Consumed refresh token unexpectedly rotated");
      }

      const nextRefreshToken = generateToken();
      const result = await store.rotate({
        currentTokenHash,
        nextTokenHash: hashToken(nextRefreshToken),
        nextExpiresAt: new Date(
          rotatedAt.getTime() + REFRESH_TOKEN_EXPIRY_MS,
        ),
        clientId: input.clientId,
        now: rotatedAt,
      });
      if (!result.ok) return result;
      const accessToken = await issueAccessToken(result.context);

      return {
        ok: true,
        credentials: {
          accessToken,
          tokenType: "bearer",
          expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
          refreshToken: nextRefreshToken,
          scope: result.context.scopes.join(" "),
        },
      };
    },
  };
}
