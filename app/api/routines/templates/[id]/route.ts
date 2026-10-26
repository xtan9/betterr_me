import { templateCookieRoute } from '@/lib/fitness/template-cookie-route';
import { readTemplates } from '@/lib/fitness/template-read';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return templateCookieRoute(request, 'read', (client, owner) => readTemplates(client, owner, id, null));
}
