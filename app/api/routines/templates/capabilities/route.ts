import { templateCookieRoute } from '@/lib/fitness/template-cookie-route';
import { templateCapabilities, templateHeaders } from '@/lib/fitness/template-commands';
export function GET(request: Request) {
  return templateCookieRoute(request, 'read', async client => {
    const result = await templateCapabilities(client);
    return result.ok ? Response.json(result.value, { headers: templateHeaders }) : result.response;
  });
}
