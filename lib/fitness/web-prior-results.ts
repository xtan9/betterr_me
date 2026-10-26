import type { SupabaseClient } from '@supabase/supabase-js';
import { currentPriorGroups, webPriorResponseSchema, type WebPriorRequest, type WebPriorResponse } from '@/lib/validations/web-prior-results';
import { readCurrentHistory } from './train-history';
import { readPriorResults } from './prior-results';

/** Current order includes date-only workouts; ordering instants are never presented as actual time. */
export async function readWebPriorResults(client: SupabaseClient, request: WebPriorRequest): Promise<WebPriorResponse> {
  const base = { protocolVersion: 2 as const, ownerId: request.ownerId };
  const unavailable = (reason: 'meaning_unknown' | 'mode_unsupported' | 'definition_unavailable'): WebPriorResponse => ({ ...base, status: 'unavailable', reason });
  if (!['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration'].includes(request.target.mode)) return unavailable('mode_unsupported');
  if (request.target.convention === null) return unavailable('meaning_unknown');
  if (request.target.identity.kind === 'custom' && request.target.identity.ownerId !== request.ownerId) return unavailable('definition_unavailable');
  const page = await readCurrentHistory(client, request.ownerId, request.protocolVersion === 2 ? request.before : null);
  if (page === null) return readPriorResults(client, { ...request, protocolVersion: 1, before: request.protocolVersion === 1 ? request.before : null });
  const observedWorkoutIds: string[] = [];
  for (const record of page.records) {
    observedWorkoutIds.push(record.id);
    if (record.id !== request.excludeWorkoutId && currentPriorGroups(record, request.target).length)
      return webPriorResponseSchema.parse({ ...base, status: 'found', observedWorkoutIds, record });
  }
  return webPriorResponseSchema.parse(page.nextCursor
    ? { ...base, status: 'searching', observedWorkoutIds, nextCursor: page.nextCursor }
    : { ...base, status: 'exhausted', observedWorkoutIds });
}
