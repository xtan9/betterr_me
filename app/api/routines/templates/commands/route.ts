import { templateCookieRoute } from '@/lib/fitness/template-cookie-route';
import { executeTemplateCommand } from '@/lib/fitness/template-commands';
export function POST(request: Request) {
  return templateCookieRoute(request, 'write', (client, owner) => executeTemplateCommand(request, client, owner));
}
