import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { templateCapabilities, templateFailure, templateHeaders, templateUnavailable } from '@/lib/fitness/template-commands';
export function OPTIONS() { return new Response(null, { status: 204, headers: templateHeaders }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return templateFailure('unauthenticated', 401);
    const result = await templateCapabilities(auth.client);
    return result.ok ? Response.json(result.value, { headers: templateHeaders }) : result.response;
  } catch { return templateUnavailable('unexpected_exception'); }
}
