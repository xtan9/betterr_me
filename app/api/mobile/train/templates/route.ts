import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { templateFailure, templateHeaders, templateUnavailable } from '@/lib/fitness/template-commands';
import { readTemplates } from '@/lib/fitness/template-read';
export function OPTIONS() { return new Response(null, { status: 204, headers: templateHeaders }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return templateFailure('unauthenticated', 401);
    return await readTemplates(auth.client, auth.userId, null, new URL(request.url).searchParams.get('after'));
  } catch { return templateUnavailable('unexpected_exception'); }
}
