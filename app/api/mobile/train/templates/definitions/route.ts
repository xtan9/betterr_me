import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { templateFailure, templateHeaders, templateUnavailable } from '@/lib/fitness/template-commands';
import { readTemplateDefinitions } from '@/lib/fitness/template-read';
export function OPTIONS() { return new Response(null, { status: 204, headers: templateHeaders }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return templateFailure('unauthenticated', 401);
    return await readTemplateDefinitions(auth.client, auth.userId, new URL(request.url).searchParams.get('after'));
  } catch { return templateUnavailable('unexpected_exception'); }
}
