import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { templateFailure, templateUnavailable } from './template-commands';

export async function templateCookieRoute(request: Request, permission: 'read' | 'write',
  handle: (client: SupabaseClient, owner: string) => Promise<Response>) {
  try {
    const auth = await authenticateRequest(request, { allowedCredentials: ['cookie'], requiredPermission: permission });
    if (!auth.ok) return templateFailure('unauthenticated', auth.status);
    if (permission === 'write' && request.headers.get('X-Train-Owner') !== auth.principal.userId) return templateFailure('unauthenticated', 403);
    return await handle(auth.client, auth.principal.userId);
  } catch { return templateUnavailable('unexpected_exception'); }
}
