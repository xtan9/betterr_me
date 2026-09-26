import { GOOGLE_RETURN_URL } from '@/lib/google/contracts';

/** Google codes return only to our installed app; exchange still requires its verified JWT and one-time state. */
export function GET(request: Request) {
  const query = new URL(request.url).searchParams, state = query.get('state');
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return new Response('Invalid connection request.', { status: 400, headers });
  const target = new URL(GOOGLE_RETURN_URL);
  target.searchParams.set('state', state);
  const code = query.get('code');
  if (code && code.length <= 4096 && !query.has('error')) target.searchParams.set('code', code);
  else target.searchParams.set('error', query.get('error') === 'access_denied' ? 'cancelled' : 'unavailable');
  return new Response(null, { status: 302, headers: { ...headers, Location: target.toString() } });
}
