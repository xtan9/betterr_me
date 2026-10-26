import type { SupabaseClient } from '@supabase/supabase-js';
import { priorRequestSchema } from '@/lib/validations/train-prior-results';
import { log } from '@/lib/logger';
import { readPriorResults } from './prior-results';

export const priorResultHeaders = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const priorResultFailure = (code: string, status: number) => Response.json({ protocolVersion: 1, error: { code } }, { status, headers: priorResultHeaders });
export function priorResultUnavailable(ownerId: string) {
  log.error('[train] Prior result read unavailable', undefined, { classification: 'read_failure' });
  return Response.json({ protocolVersion: 1, ownerId, status: 'unavailable', reason: 'service_unavailable' }, { status: 503, headers: priorResultHeaders });
}
export async function priorResultRoute(request: Request, client: SupabaseClient, ownerId: string) {
  let body: unknown;
  try { body = await request.json(); } catch { return priorResultFailure('invalid_request', 400); }
  const parsed = priorRequestSchema.safeParse(body);
  if (!parsed.success) return priorResultFailure('invalid_request', 400);
  if (parsed.data.ownerId !== ownerId) return priorResultFailure('owner_mismatch', 403);
  try { return Response.json(await readPriorResults(client, parsed.data), { headers: priorResultHeaders }); }
  catch { return priorResultUnavailable(ownerId); }
}
