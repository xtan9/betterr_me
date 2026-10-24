import type { SupabaseClient } from '@supabase/supabase-js';
import { historyHeaders, readHistoryQuery, readHistoryBody, encodeCursor } from '@/lib/focus-history/http';
import { FocusHistoryError } from '@/lib/focus-history/repository';
import { appLimitUploadSchema } from './contract';
import { createAppLimitHistoryRepository } from './repository';

export async function readAppLimitHistory(request: Request, client: SupabaseClient, headers = historyHeaders) {
  const query = readHistoryQuery(request);
  const rows = await createAppLimitHistoryRepository(client).read(query.after, query.limit);
  const page = rows.slice(0, query.limit);
  return Response.json({ schemaVersion: 1, items: page.map(({ position: _position, ...item }) => item),
    nextCursor: rows.length > query.limit ? encodeCursor(page[page.length - 1].position) : null }, { headers });
}
export async function uploadAppLimitHistory(request: Request, client: SupabaseClient, headers = historyHeaders) {
  const raw = await readHistoryBody(request, headers);
  if (raw instanceof Response) return raw;
  const parsed = appLimitUploadSchema.safeParse(raw);
  if (!parsed.success) throw new FocusHistoryError('invalid');
  return Response.json(await createAppLimitHistoryRepository(client).upload(parsed.data), { headers });
}
