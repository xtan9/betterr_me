import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { historyHeaders } from '@/lib/focus-history/http';
import { continuationFailure, readContinuation } from '@/lib/app-limit-continuations/http';
const policy = { allowedCredentials: ['cookie'], requiredPermission: 'read' } as const;
export async function GET(request: Request) {
  try { const auth = await authenticateRequest(request, policy);
    if (!auth.ok) return Response.json({ error: auth.status === 401 ? 'unauthorized' : 'unavailable' }, { status: auth.status, headers: historyHeaders });
    return await readContinuation(request, auth.client);
  } catch (error) { return continuationFailure(error); }
}
