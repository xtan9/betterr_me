import type {
  AuthorizationCodeExchangeMatch,
  AuthorizationCodeFailure,
  AuthorizationCodeRecord,
  AuthorizationCodeStore,
  ConsumeAuthorizationCodeResult,
} from "@/lib/oauth/authorization-code";

interface SupabaseResult<T> {
  data: T;
  error: unknown;
}

interface SupabaseAuthorizationCodeClient {
  from(table: "oauth_codes"): {
    insert(values: Record<string, unknown>): Promise<SupabaseResult<unknown>>;
  };
  rpc(
    name: "consume_oauth_authorization_code",
    parameters: Record<string, unknown>,
  ): Promise<SupabaseResult<StoredConsumeResult[] | null>>;
}

interface StoredConsumeResult {
  outcome: AuthorizationCodeFailure | "consumed";
  code_hash: string | null;
  client_id: string | null;
  redirect_uri: string | null;
  user_id: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  code_challenge: string | null;
  code_challenge_method: "S256" | null;
  used: boolean | null;
}

function storeError(operation: string, error: unknown): Error {
  return new Error(`Failed to ${operation} authorization code`, {
    cause: error,
  });
}

export function createSupabaseAuthorizationCodeStore(
  supabaseClient: unknown,
): AuthorizationCodeStore {
  const client = supabaseClient as SupabaseAuthorizationCodeClient;
  return {
    async save(record: AuthorizationCodeRecord): Promise<void> {
      const { error } = await client.from("oauth_codes").insert({
        code_hash: record.codeHash,
        client_id: record.clientId,
        redirect_uri: record.redirectUri,
        user_id: record.userId,
        scopes: record.scopes,
        expires_at: record.expiresAt.toISOString(),
        code_challenge: record.codeChallenge,
        code_challenge_method: record.codeChallengeMethod,
        used: record.used,
      });

      if (error) throw storeError("save", error);
    },

    async consume(
      codeHash: string,
      matches: AuthorizationCodeExchangeMatch,
    ): Promise<ConsumeAuthorizationCodeResult> {
      const { data, error } = await client.rpc(
        "consume_oauth_authorization_code",
        {
          requested_code_hash: codeHash,
          requested_client_id: matches.clientId,
          requested_redirect_uri: matches.redirectUri,
          requested_code_challenge: matches.codeChallenge,
          requested_code_challenge_method: matches.codeChallengeMethod,
          requested_at: matches.now.toISOString(),
        },
      );

      if (error) throw storeError("consume", error);
      const result = data?.[0];
      if (!result) throw storeError("consume", "empty database result");
      if (result.outcome !== "consumed") {
        return { ok: false, error: result.outcome };
      }
      if (
        !result.code_hash ||
        !result.client_id ||
        !result.redirect_uri ||
        !result.user_id ||
        !result.scopes ||
        !result.expires_at ||
        !result.code_challenge ||
        !result.code_challenge_method
      ) {
        throw storeError("consume", "incomplete database result");
      }

      return {
        ok: true,
        record: {
          codeHash: result.code_hash,
          clientId: result.client_id,
          redirectUri: result.redirect_uri,
          userId: result.user_id,
          scopes: result.scopes,
          expiresAt: new Date(result.expires_at),
          codeChallenge: result.code_challenge,
          codeChallengeMethod: result.code_challenge_method,
          used: result.used ?? true,
        },
      };
    },
  };
}
