import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { continuationContextSchema, continuationReadSchema, contextQuerySchema, receiptQuerySchema, type ContinuationConfirm } from './contract';
export const continuationErrors = { invalid: 400, unauthorized: 401, not_found: 404, operation_conflict: 409, source_changed: 409, source_incomplete: 409,
  destination_changed: 409, destination_incomplete: 409, destination_not_pristine: 409, source_missing: 422, source_ended: 422, settings_loosened: 422, unavailable: 503 } as const;
export class ContinuationError extends Error { constructor(readonly reason: keyof typeof continuationErrors) { super(reason); } }
export function createContinuationRepository(client: Pick<SupabaseClient, 'rpc'>) {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error || !data) throw new ContinuationError('unavailable');
    const { status, ...body } = data;
    if (status !== 'complete') throw new ContinuationError(Object.hasOwn(continuationErrors, status) ? status as keyof typeof continuationErrors : 'unavailable');
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ContinuationError('unavailable');
    return parsed.data;
  }
  return {
    confirm: (request: ContinuationConfirm) => call('app_limit_continuation_confirm', { p_request: request }, continuationReadSchema),
    context: (query: z.infer<typeof contextQuerySchema>) => call('app_limit_continuation_context', { p_source: query.sourceId, p_rule: query.sourceRuleId,
      p_destination: query.destinationSourceId, p_destination_rule: query.destinationRuleId }, continuationContextSchema),
    read: (query: z.infer<typeof receiptQuerySchema>) => call('app_limit_continuation_read', 'operationId' in query
      ? { p_operation: query.operationId, p_destination: null, p_event: null }
      : { p_operation: null, p_destination: query.destinationSourceId, p_event: query.applyEventId }, continuationReadSchema),
  };
}
