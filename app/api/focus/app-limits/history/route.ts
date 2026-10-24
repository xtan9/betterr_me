import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { historyFailure, historyHeaders } from '@/lib/focus-history/http';
import { readAppLimitHistory } from '@/lib/app-limit-history/http';

const policy = { allowedCredentials: ['cookie'], requiredPermission: 'read' } as const;
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, policy);
    if (!auth.ok) return Response.json({ error: auth.status === 401 ? 'unauthorized' : 'unavailable' }, { status: auth.status, headers: historyHeaders });
    return await readAppLimitHistory(request, auth.client);
  } catch (error) { return historyFailure(error); }
}
