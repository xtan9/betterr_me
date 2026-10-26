import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { log } from '@/lib/logger';
import { priorResultFailure, priorResultRoute } from '@/lib/fitness/prior-result-route';
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { allowedCredentials: ['cookie'], requiredPermission: 'read' });
    if (!auth.ok) return priorResultFailure('unauthenticated', auth.status);
    return await priorResultRoute(request, auth.client, auth.principal.userId);
  } catch {
    log.error('[train] Prior result authentication unavailable', undefined, { classification: 'auth_failure' });
    return priorResultFailure('unavailable', 503);
  }
}
