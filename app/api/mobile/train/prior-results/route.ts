import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { log } from '@/lib/logger';
import { priorResultFailure, priorResultHeaders, priorResultRoute } from '@/lib/fitness/prior-result-route';
export function OPTIONS() { return new Response(null, { status: 204, headers: priorResultHeaders }); }
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return priorResultFailure('unauthenticated', 401);
    return await priorResultRoute(request, auth.client, auth.userId);
  } catch {
    log.error('[train] Prior result authentication unavailable', undefined, { classification: 'auth_failure' });
    return priorResultFailure('unavailable', 503);
  }
}
