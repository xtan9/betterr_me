import type { SupabaseClient } from '@supabase/supabase-js';
import { acknowledgmentSchema, storedHistoryItemSchema, type HistoryUpload } from './contract';

export class FocusHistoryError extends Error {
  constructor(readonly reason: 'invalid' | 'conflict' | 'unauthorized' | 'unavailable') { super(reason); }
}

/** Only compose this with a verified user's client; SQL independently checks auth.uid(). */
export function createFocusHistoryRepository(client: Pick<SupabaseClient, 'rpc'>) {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error || !data) throw new FocusHistoryError('unavailable');
    if (data.status !== 'complete') throw new FocusHistoryError(
      data.status === 'conflict' || data.status === 'invalid' ? data.status : data.status === 'unauthorized' ? 'unauthorized' : 'unavailable',
    );
    return data;
  }
  return {
    async upload(request: HistoryUpload) {
      const { status: _status, ...body } = await call('focus_history_ingest', { p_request: request });
      const result = acknowledgmentSchema.safeParse(body);
      if (!result.success || result.data.sourceId !== request.source.id
        || result.data.acceptedEventIds.length !== request.events.length
        || new Set(result.data.acceptedEventIds).size !== request.events.length
        || result.data.acceptedEventIds.some(id => !request.events.some(event => event.id === id))) {
        throw new FocusHistoryError('unavailable');
      }
      return result.data;
    },
    async read(after: number, limit: number) {
      const body = await call('focus_history_read', { p_after: after, p_limit: limit + 1 });
      const result = storedHistoryItemSchema.array().max(limit + 1).safeParse(body.items);
      if (!result.success || result.data.some((item, index) => item.position <= (index === 0 ? after : result.data[index - 1].position))) {
        throw new FocusHistoryError('unavailable');
      }
      return result.data;
    },
  };
}
