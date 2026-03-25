/**
 * API key utilities and request authentication helper.
 *
 * Server-only — uses Node.js crypto and environment variables.
 */

import crypto from 'node:crypto';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { log } from '@/lib/logger';
import { createClient as createServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthResult = {
  userId: string;
  permissions: 'read' | 'read_write';
  supabase: SupabaseClient;
};

export type AuthError = {
  error: string;
  status: 401 | 403 | 500;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHmacSecret(): string {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error('API_KEY_HMAC_SECRET environment variable is not set');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// generateApiKey
// ---------------------------------------------------------------------------

/**
 * Generate a new API key with prefix and HMAC-SHA-256 hash.
 *
 * The full key is returned **once** so it can be shown to the user.
 * Only the hash should be persisted in the database.
 */
export function generateApiKey(): {
  fullKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const secret = getHmacSecret();
  const randomBytes = crypto.randomBytes(16);
  const fullKey = `brm_${randomBytes.toString('hex')}`;
  const keyPrefix = fullKey.slice(0, 12);
  const keyHash = crypto
    .createHmac('sha256', secret)
    .update(fullKey)
    .digest('hex');

  return { fullKey, keyPrefix, keyHash };
}

// ---------------------------------------------------------------------------
// hashApiKey
// ---------------------------------------------------------------------------

/**
 * Hash an API key with HMAC-SHA-256 for database lookup.
 */
export function hashApiKey(key: string): string {
  const secret = getHmacSecret();
  return crypto.createHmac('sha256', secret).update(key).digest('hex');
}

// ---------------------------------------------------------------------------
// authenticateRequest
// ---------------------------------------------------------------------------

/** Write HTTP methods that require `read_write` permission. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Authenticate an incoming API request.
 *
 * Supports two authentication paths:
 * 1. **API key** — `Authorization: Bearer brm_xxx` header
 * 2. **Cookie** — Supabase session cookie (existing web auth)
 *
 * @returns `AuthResult` on success, `AuthError` on failure.
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<AuthResult | AuthError> {
  const authHeader = request.headers.get('authorization');

  // ---- API key path -------------------------------------------------------
  if (authHeader?.startsWith('Bearer brm_')) {
    const apiKey = authHeader.slice('Bearer '.length);

    let keyHash: string;
    try {
      keyHash = hashApiKey(apiKey);
    } catch (err) {
      log.error('API key authentication failed: could not hash API key', err);
      return { error: 'Internal server error', status: 500 };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      log.error(
        'API key authentication failed: Supabase service role not configured',
      );
      return { error: 'Internal server error', status: 500 };
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    const { data: keyRow, error: dbError } = await serviceClient
      .from('api_keys')
      .select('id, user_id, permissions, expires_at')
      .eq('key_hash', keyHash)
      .single();

    if (dbError) {
      log.error('API key lookup failed', dbError);
      return { error: 'Internal server error', status: 500 };
    }
    if (!keyRow) {
      return { error: 'Invalid API key', status: 401 };
    }

    // Check expiration
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      return { error: 'API key has expired', status: 401 };
    }

    // Check permissions for write methods
    const permissions = keyRow.permissions as 'read' | 'read_write';
    if (permissions === 'read' && WRITE_METHODS.has(request.method)) {
      return {
        error: 'API key does not have write permission',
        status: 403,
      };
    }

    // Fire-and-forget last_used_at update (non-blocking).
    // NOTE: Supabase resolves with { error } rather than rejecting, so we must
    // check the resolved value — .then(null, handler) would miss DB errors.
    serviceClient
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id)
      .then(
        ({ error: updateError }) => {
          if (updateError) log.error('Failed to update last_used_at', updateError);
        },
        (err: unknown) => log.error('Failed to update last_used_at (network)', err),
      );

    return {
      userId: keyRow.user_id,
      permissions,
      supabase: serviceClient,
    };
  }

  // ---- Cookie fallback path -----------------------------------------------
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Unauthorized', status: 401 };
    }

    return {
      userId: user.id,
      permissions: 'read_write',
      supabase,
    };
  } catch (err) {
    log.error('Cookie authentication failed', err);
    return { error: 'Unauthorized', status: 401 };
  }
}
