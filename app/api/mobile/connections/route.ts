import { z } from 'zod';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { googleConfig, googleRuntime } from '@/lib/google/runtime';
import { googleServices, GoogleConnectionError } from '@/lib/google/contracts';
import { publicConnection } from '@/lib/google/connections';
import { GoogleReads } from '@/lib/google/reads';
import { log } from '@/lib/logger';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const service = z.enum(googleServices);
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), service }).strict(),
  z.object({ action: z.literal('finish'), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(4096) }).strict(),
  z.object({ action: z.literal('select-calendars'), ids: z.array(z.string().min(1).max(1024)).min(1).max(20) }).strict(),
  z.object({ action: z.literal('disconnect'), service }).strict(),
  z.object({ action: z.literal('revoke'), service }).strict(),
]);
function failure(error: unknown) {
  const reason = error instanceof GoogleConnectionError ? error.reason : 'unavailable';
  if (reason === 'unavailable' || reason === 'not-configured') log.error('[mobile-connections] Request failed', undefined, { reason });
  return reply({ error: reason }, reason === 'invalid' ? 400 : reason === 'conflict' ? 409 : reason === 'limited' ? 429 : 503);
}
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return reply({ error: 'unauthorized' }, 401);
    const url = new URL(request.url), action = url.searchParams.get('action') ?? 'status';
    if (!['status', 'calendars', 'events'].includes(action)) return reply({ error: 'invalid' }, 400);
    if (action === 'status' && !googleConfig()) return reply({ configured: false, connections: [] });
    const connections = googleRuntime(), reads = new GoogleReads(connections);
    if (action === 'status') return reply({ configured: true, connections: (await connections.store.list(auth.userId)).map(publicConnection) });
    if (action === 'calendars') return reply({ calendars: await reads.calendars(auth.userId) });
    const start = z.string().datetime({ offset: true }).parse(url.searchParams.get('start')), end = z.string().datetime({ offset: true }).parse(url.searchParams.get('end'));
    return reply({ events: await reads.events(auth.userId, start, end), fetchedAt: new Date().toISOString() });
  } catch (error) { return error instanceof z.ZodError ? reply({ error: 'invalid' }, 400) : failure(error); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 8192) return reply({ error: 'invalid' }, 413);
    const auth = await authenticateNativeRequest(request);
    if (!auth) return reply({ error: 'unauthorized' }, 401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) return reply({ error: 'invalid' }, 413);
    let json: unknown; try { json = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
    const input = requestSchema.safeParse(json);
    if (!input.success) return reply({ error: 'invalid' }, 400);
    const connections = googleRuntime(), value = input.data;
    switch (value.action) {
      case 'start': return reply(await connections.start(auth.userId, value.service));
      case 'finish': return reply({ connection: await connections.finish(auth.userId, value.state, value.code) });
      case 'select-calendars': return reply({ connection: await new GoogleReads(connections).selectCalendars(auth.userId, value.ids) });
      case 'disconnect': await connections.disconnect(auth.userId, value.service); break;
      case 'revoke': await connections.revokeAccount(auth.userId, value.service); break;
    }
    return reply({ complete: true });
  } catch (error) { return failure(error); }
}
