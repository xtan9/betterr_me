import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { ApiKeysDB } from '@/lib/db/api-keys';
import { log } from '@/lib/logger';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * DELETE /api/api-keys/[id]
 * Delete an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const apiKeysDB = new ApiKeysDB(supabase);
    await apiKeysDB.deleteKey(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/api-keys/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
