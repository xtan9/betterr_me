import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { executeTemplateCommand, templateCapabilities, templateFailure, templateHeaders, templateUnavailable } from '@/lib/fitness/template-commands';
export function OPTIONS() { return new Response(null, { status: 204, headers: templateHeaders }); }
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return templateFailure('unauthenticated', 401);
    const capabilities = await templateCapabilities(auth.client);
    if (!capabilities.ok) return capabilities.response;
    if (!capabilities.value.templates.ready) return templateFailure('not_ready', 503);
    return await executeTemplateCommand(request, auth.client, auth.userId);
  } catch { return templateUnavailable('unexpected_exception'); }
}
