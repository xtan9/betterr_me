import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcFailureDiagnostic } from '@/lib/focus-history/diagnostics';
import { acknowledgmentSchema } from '@/lib/focus-history/contract';
import { FocusHistoryError } from '@/lib/focus-history/repository';
import { storedAppLimitItemSchema, type AppLimitUpload } from './contract';

export function createAppLimitHistoryRepository(client: Pick<SupabaseClient, 'rpc'>) {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new FocusHistoryError('unavailable', rpcFailureDiagnostic(error));
    if (!data) throw new FocusHistoryError('unavailable', { category: 'invalid_response' });
    if (data.status !== 'complete') throw new FocusHistoryError(
      data.status === 'conflict' || data.status === 'invalid' ? data.status : data.status === 'unauthorized' ? 'unauthorized' : 'unavailable',
      { category: data.status === 'unavailable' ? 'unavailable' : 'invalid_response' },
    );
    return data;
  }
  return {
    async upload(request: AppLimitUpload) {
      const { status: _status, ...body } = await call('app_limit_history_ingest', { p_request: request });
      const result = acknowledgmentSchema.safeParse(body);
      if (!result.success || result.data.sourceId !== request.source.id
        || result.data.acceptedEventIds.length !== request.events.length
        || new Set(result.data.acceptedEventIds).size !== request.events.length
        || result.data.acceptedEventIds.some(id => !request.events.some(event => event.id === id))) {
        throw new FocusHistoryError('unavailable', { category: 'invalid_response' });
      }
      return result.data;
    },
    async read(after: number, limit: number) {
      const body = await call('app_limit_history_read', { p_after: after, p_limit: limit + 1 });
      const result = storedAppLimitItemSchema.array().max(limit + 1).safeParse(body.items);
      if (!result.success || result.data.some((item, index) => item.position <= (index === 0 ? after : result.data[index - 1].position))) {
        throw new FocusHistoryError('unavailable', { category: 'invalid_response' });
      }
      return result.data;
    },
  };
}
