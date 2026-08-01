import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { ApiKeysDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { apiKeyCreateSchema } from '@/lib/validations/api-key';
import { generateApiKey } from '@/lib/auth/api-key';
import { log } from '@/lib/logger';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const apiKeysDB = new ApiKeysDB(supabase);
    const keys = await apiKeysDB.getUserKeys(userId);
    return NextResponse.json({ keys });
  } catch (error) {
    log.error('GET /api/api-keys error', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/api-keys
 * Create a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, apiKeyCreateSchema);
    if (!validation.success) return validation.response;

    const apiKeysDB = new ApiKeysDB(supabase);

    // Check key count limit
    const keyCount = await apiKeysDB.getKeyCount(userId);
    if (keyCount >= 10) {
      return NextResponse.json(
        { error: 'Maximum of 10 API keys allowed' },
        { status: 400 }
      );
    }

    // Validate expires_at is in the future if provided
    if (validation.data.expires_at) {
      const expiresAt = new Date(validation.data.expires_at);
      if (expiresAt <= new Date()) {
        return NextResponse.json(
          { error: 'Expiration date must be in the future' },
          { status: 400 }
        );
      }
    }

    // Generate key
    const { fullKey, keyPrefix, keyHash } = generateApiKey();

    // Create in database
    const key = await apiKeysDB.createKey({
      user_id: userId,
      name: validation.data.name.trim(),
      key_hash: keyHash,
      key_prefix: keyPrefix,
      permissions: validation.data.permissions ?? 'read_write',
      expires_at: validation.data.expires_at ?? null,
    });

    // Return the created key with the full key (only time it's returned)
    return NextResponse.json({ key: { ...key, full_key: fullKey } }, { status: 201 });
  } catch (error) {
    log.error('POST /api/api-keys error', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}
