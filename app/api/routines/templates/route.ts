import { templateCookieRoute } from '@/lib/fitness/template-cookie-route';
import { readTemplates } from '@/lib/fitness/template-read';
export function GET(request: Request) {
  return templateCookieRoute(request, 'read', (client, owner) => readTemplates(client, owner, null, new URL(request.url).searchParams.get('after')));
}
