import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { historyUploadSchema, MAX_UPLOAD_BYTES } from './contract';
import { createFocusHistoryRepository, FocusHistoryError } from './repository';

const querySchema = z.object({ after: z.string().min(1).max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const encodeCursor = (position: number) => Buffer.from(`v1:${position}`).toString('base64url');
function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const value = /^v1:[1-9][0-9]*$/.test(decoded) ? Number(decoded.slice(3)) : NaN;
  if (!Number.isSafeInteger(value) || value <= 0 || encodeCursor(value) !== cursor) throw new FocusHistoryError('invalid');
  return value;
}
export const historyHeaders = { 'Cache-Control': 'no-store' };
export function historyFailure(error: unknown, headers: Record<string, string> = historyHeaders) {
  const reason = error instanceof FocusHistoryError ? error.reason : 'unavailable';
  return Response.json({ error: reason }, { status: { invalid: 400, conflict: 409, unauthorized: 401, unavailable: 503 }[reason], headers });
}
export async function readFocusHistory(request: Request, client: SupabaseClient, headers = historyHeaders) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new FocusHistoryError('invalid');
  const query = querySchema.safeParse(Object.fromEntries(params));
  if (!query.success) throw new FocusHistoryError('invalid');
  const rows = await createFocusHistoryRepository(client).read(decodeCursor(query.data.after), query.data.limit);
  const page = rows.slice(0, query.data.limit);
  return Response.json({
    schemaVersion: 1,
    items: page.map(({ position: _position, ...item }) => item),
    nextCursor: rows.length > query.data.limit ? encodeCursor(page[page.length - 1].position) : null,
  }, { headers });
}
export async function uploadFocusHistory(request: Request, client: SupabaseClient, headers = historyHeaders) {
  if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES) return Response.json({ error: 'invalid' }, { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) throw new FocusHistoryError('invalid');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); return Response.json({ error: 'invalid' }, { status: 413, headers }); }
    chunks.push(value);
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new FocusHistoryError('invalid'); }
  const parsed = historyUploadSchema.safeParse(raw);
  if (!parsed.success) throw new FocusHistoryError('invalid');
  return Response.json(await createFocusHistoryRepository(client).upload(parsed.data), { headers });
}
