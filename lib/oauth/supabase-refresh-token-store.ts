import type {
  RefreshTokenRotationFailure,
  RefreshTokenRotationStore,
  StoredRefreshTokenResolutionResult,
} from "@/lib/oauth/refresh-token";

interface SupabaseResult<T> {
  data: T;
  error: unknown;
}

interface SupabaseRefreshTokenClient {
  rpc(
    name:
      | "resolve_oauth_refresh_token_context"
      | "rotate_oauth_refresh_token",
    parameters: Record<string, unknown>,
  ): Promise<SupabaseResult<StoredRotationResult[] | null>>;
}

interface StoredRotationResult {
  outcome: RefreshTokenRotationFailure | "valid_token" | "rotated";
  client_id: string | null;
  user_id: string | null;
  scopes: string[] | null;
}

function rotationError(error: unknown): Error {
  return new Error("Failed to rotate refresh token", { cause: error });
}

function mapResolution(
  result: StoredRotationResult | undefined,
): StoredRefreshTokenResolutionResult {
  if (!result) throw rotationError("empty database result");
  if (result.outcome !== "valid_token") {
    return {
      ok: false,
      error: result.outcome as RefreshTokenRotationFailure,
    };
  }
  if (!result.client_id || !result.user_id || !result.scopes) {
    throw rotationError("incomplete database result");
  }
  return {
    ok: true,
    context: {
      clientId: result.client_id,
      userId: result.user_id,
      scopes: result.scopes,
    },
  };
}

function mapRotation(
  result: StoredRotationResult | undefined,
): Awaited<ReturnType<RefreshTokenRotationStore["rotate"]>> {
  if (!result) throw rotationError("empty database result");
  if (result.outcome !== "rotated") {
    return {
      ok: false,
      error: result.outcome as RefreshTokenRotationFailure,
    };
  }
  if (!result.client_id || !result.user_id || !result.scopes) {
    throw rotationError("incomplete database result");
  }
  return {
    ok: true,
    context: {
      clientId: result.client_id,
      userId: result.user_id,
      scopes: result.scopes,
    },
  };
}

export function createSupabaseRefreshTokenStore(
  supabaseClient: unknown,
): RefreshTokenRotationStore {
  const client = supabaseClient as SupabaseRefreshTokenClient;
  return {
    async resolve(input) {
      const { data, error } = await client.rpc(
        "resolve_oauth_refresh_token_context",
        {
          requested_token_hash: input.currentTokenHash,
          requested_client_id: input.clientId,
          requested_at: input.now.toISOString(),
        },
      );

      if (error) throw rotationError(error);
      return mapResolution(data?.[0]);
    },

    async rotate(input) {
      const { data, error } = await client.rpc("rotate_oauth_refresh_token", {
        requested_token_hash: input.currentTokenHash,
        replacement_token_hash: input.nextTokenHash,
        replacement_expires_at: input.nextExpiresAt.toISOString(),
        requested_client_id: input.clientId,
        requested_at: input.now.toISOString(),
      });

      if (error) throw rotationError(error);
      return mapRotation(data?.[0]);
    },
  };
}
