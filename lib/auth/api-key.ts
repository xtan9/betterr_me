/**
 * API key utilities and request authentication helper.
 *
 * Server-only — uses Node.js crypto and environment variables.
 */

import crypto from 'node:crypto';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { log } from '@/lib/logger';
import type { CredentialOutcome } from '@/lib/auth/request-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// authenticateApiKeyCredential
// ---------------------------------------------------------------------------

/**
 * Resolve a BetterR.Me API-key credential at the request adapter boundary.
 */
export async function authenticateApiKeyCredential(
  request: Request,
): Promise<CredentialOutcome<SupabaseClient>> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer brm_')) {
    return { outcome: 'anonymous' };
  }

  const apiKey = authHeader.slice('Bearer '.length);

  let keyHash: string;
  try {
    keyHash = hashApiKey(apiKey);
  } catch (err) {
    log.error('[api-key] Authentication failed: could not hash API key', err);
    return { outcome: 'misconfigured' };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    log.error(
      '[api-key] Authentication failed: Supabase service role not configured',
    );
    return { outcome: 'misconfigured' };
  }

  const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const { data: keyRow, error: dbError } = await serviceClient
    .from('api_keys')
    .select('id, user_id, permissions, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (dbError) {
    log.error('[api-key] Lookup failed', dbError);
    return { outcome: 'misconfigured' };
  }
  if (!keyRow) {
    return { outcome: 'invalid' };
  }

  // Check expiration
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return { outcome: 'invalid' };
  }

  const permissions = keyRow.permissions as 'read' | 'read_write';

  return {
    outcome: 'authenticated',
    principal: { userId: keyRow.user_id, credential: 'apiKey' },
    permissions:
      permissions === 'read_write' ? ['read', 'write'] : ['read'],
    client: serviceClient,
    onAuthorized: () => {
      // Fire-and-forget last_used_at update only after route authorization.
      // Supabase resolves with { error }, so handle both DB and network errors.
      try {
        serviceClient
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', keyRow.id)
          .then(
            ({ error: updateError }) => {
              if (updateError) {
                log.error('[api-key] Failed to update last_used_at', updateError);
              }
            },
            (err: unknown) =>
              log.error('[api-key] Failed to update last_used_at (network)', err),
          );
      } catch (error) {
        log.error('[api-key] Failed to update last_used_at (setup)', error);
      }
    },
  };
}
