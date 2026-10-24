import { logHistoryFailure, type HistoryFailureScope } from '@/lib/focus-history/diagnostics';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { historyHeaders, readHistoryBody } from '@/lib/focus-history/http';
import { FocusHistoryError } from '@/lib/focus-history/repository';
import { continuationConfirmSchema, contextQuerySchema, receiptQuerySchema } from './contract';
import { ContinuationError, continuationErrors, createContinuationRepository } from './repository';
export const continuationHeaders = { ...historyHeaders, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
export function continuationFailure(error: unknown, headers = historyHeaders, scope: HistoryFailureScope = 'app-limit-continuations.read') {
  const reason = error instanceof ContinuationError ? error.reason : error instanceof FocusHistoryError && ['invalid', 'unauthorized'].includes(error.reason) ? error.reason as 'invalid' | 'unauthorized' : 'unavailable';
  if (reason === 'unavailable') logHistoryFailure(scope, error instanceof ContinuationError ? error.diagnostic : undefined);
  return Response.json({ error: reason }, { status: continuationErrors[reason], headers });
}
function query<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new ContinuationError('invalid');
  const parsed = schema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new ContinuationError('invalid');
  return parsed.data;
}
export async function readContinuationContext(request: Request, client: SupabaseClient, headers = historyHeaders) {
  return Response.json(await createContinuationRepository(client).context(query(request, contextQuerySchema)), { headers });
}
export async function readContinuation(request: Request, client: SupabaseClient, headers = historyHeaders) {
  return Response.json(await createContinuationRepository(client).read(query(request, receiptQuerySchema)), { headers });
}
export async function confirmContinuation(request: Request, client: SupabaseClient, headers = historyHeaders) {
  const raw = await readHistoryBody(request, headers, 16384);
  if (raw instanceof Response) return raw;
  const parsed = continuationConfirmSchema.safeParse(raw);
  if (!parsed.success) throw new ContinuationError('invalid');
  return Response.json(await createContinuationRepository(client).confirm(parsed.data), { headers });
}
