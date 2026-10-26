import { templateCookieRoute } from '@/lib/fitness/template-cookie-route';
import { readTemplateDefinitions } from '@/lib/fitness/template-read';
export function GET(request: Request) {
  return templateCookieRoute(request, 'read', (client, owner) => readTemplateDefinitions(client, owner, new URL(request.url).searchParams.get('after')));
}
