import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { log } from '@/lib/logger';
import { priorResultFailure, priorResultHeaders, priorResultUnavailable } from '@/lib/fitness/prior-result-route';
import { webPriorRequestSchema } from '@/lib/validations/web-prior-results';
import { readWebPriorResults } from '@/lib/fitness/web-prior-results';
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { allowedCredentials: ['cookie'], requiredPermission: 'read' });
    if (!auth.ok) return priorResultFailure('unauthenticated', auth.status);
    const body: unknown = await request.json().catch(() => null);
    const parsed = webPriorRequestSchema.safeParse(body);
    if (!parsed.success) return priorResultFailure('invalid_request', 400);
    if (parsed.data.ownerId !== auth.principal.userId) return priorResultFailure('owner_mismatch', 403);
    try { return Response.json(await readWebPriorResults(auth.client, parsed.data), { headers: priorResultHeaders }); }
    catch { return priorResultUnavailable(auth.principal.userId); }
  } catch {
    log.error('[train] Prior result authentication unavailable', undefined, { classification: 'auth_failure' });
    return priorResultFailure('unavailable', 503);
  }
}
