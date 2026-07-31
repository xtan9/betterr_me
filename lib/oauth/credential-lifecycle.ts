import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";
import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from "@/lib/mcp/refresh-token";
import { issueAccessToken } from "@/lib/oauth/access-token";
import {
  createAuthorizationCodeExchanger,
  createAuthorizationCodeIssuer,
} from "@/lib/oauth/authorization-code";
import { createRefreshTokenRotator } from "@/lib/oauth/refresh-token";
import { createSupabaseAuthorizationCodeStore } from "@/lib/oauth/supabase-authorization-code-store";
import { createSupabaseRefreshTokenStore } from "@/lib/oauth/supabase-refresh-token-store";

async function cleanupRefreshTokenFamilies(client: SupabaseClient) {
  try {
    const { error } = await client.rpc("cleanup_oauth_refresh_token_families", {
      expired_before: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      revoked_before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!error) return;
    log.warn("[oauth] Refresh token cleanup failed", { error: String(error) });
  } catch (error) {
    log.warn("[oauth] Refresh token cleanup failed", { error: String(error) });
  }
}

export function createOAuthCredentialLifecycle(client: SupabaseClient) {
  const authorizationCodeStore = createSupabaseAuthorizationCodeStore(client);

  return {
    async issueAuthorizationCode(input: {
      clientId: string;
      redirectUri: string;
      userId: string;
      scopes: string[];
      codeChallenge: string;
      codeChallengeMethod: "S256";
    }) {
      const { error } = await client
        .from("oauth_codes")
        .delete()
        .lt("expires_at", new Date().toISOString());
      if (error) log.error("[oauth] Failed to clean up expired codes", error);

      return createAuthorizationCodeIssuer({
        store: authorizationCodeStore,
      }).issue(input);
    },

    exchangeAuthorizationCode(input: {
      code: string;
      clientId: string;
      redirectUri: string;
      codeVerifier: string;
    }) {
      return createAuthorizationCodeExchanger({
        store: authorizationCodeStore,
        issueCredentials: async ({ clientId, userId, scopes }) => {
          const accessToken = await issueAccessToken({ userId, clientId, scopes });
          const rawRefreshToken = generateRefreshToken();
          const { error } = await client.from("oauth_refresh_tokens").insert({
            token_hash: hashToken(rawRefreshToken),
            client_id: clientId,
            user_id: userId,
            scopes,
            expires_at: new Date(
              Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString(),
          });
          if (error) {
            throw new Error("Failed to issue refresh token", { cause: error });
          }
          await cleanupRefreshTokenFamilies(client);
          return { ...accessToken, refreshToken: rawRefreshToken };
        },
      }).exchange(input);
    },

    async rotateRefreshToken(input: {
      refreshToken: string;
      clientId: string;
    }) {
      const result = await createRefreshTokenRotator({
        store: createSupabaseRefreshTokenStore(client),
        issueAccessToken,
      }).rotate(input);
      if (result.ok) await cleanupRefreshTokenFamilies(client);
      return result;
    },
  };
}
