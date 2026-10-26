import { z } from 'zod';
import { historyCursor, historyId, historyRecordSchema, type HistoryRecord } from './train-history';
import { priorDefinitionMatchesTarget, priorRequestSchema, priorResponseMatchesRequest, priorResponseSchema,
  type PriorRequest, type PriorResult, type PriorTarget } from './train-prior-results';

/** Web can use current history without changing the frozen native timestamp protocol. */
export const webPriorRequestSchema = z.union([priorRequestSchema, priorRequestSchema.extend({
  protocolVersion: z.literal(2), before: historyCursor.nullable(),
})]);
const base = { protocolVersion: z.literal(2), ownerId: historyId };
const observed = z.array(historyId).max(20).refine(ids => new Set(ids).size === ids.length);
const currentResponse = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('found'), observedWorkoutIds: observed,
    record: historyRecordSchema.refine(row => row.state === 'alive' && row.current?.kind === 'recorded'),
  }).strict(),
  z.object({ ...base, status: z.literal('searching'), observedWorkoutIds: observed, nextCursor: historyCursor }).strict(),
  z.object({ ...base, status: z.literal('exhausted'), observedWorkoutIds: observed }).strict(),
  z.object({ ...base, status: z.literal('unavailable'), reason: z.enum(['meaning_unknown', 'mode_unsupported', 'definition_unavailable', 'service_unavailable']) }).strict(),
]).refine(value => value.status === 'found' ? value.record.ownerId === value.ownerId && value.observedWorkoutIds.at(-1) === value.record.id
  : value.status === 'searching' ? value.observedWorkoutIds.length === 20 && value.observedWorkoutIds.at(-1) === value.nextCursor.id : true);
export const webPriorResponseSchema = z.union([priorResponseSchema, currentResponse]);
export type WebPriorRequest = z.infer<typeof webPriorRequestSchema>;
export type WebPriorResponse = z.infer<typeof webPriorResponseSchema>;
export type WebPriorRead = { request: PriorRequest; page: WebPriorResponse };

/** Only validated, explicitly performed capture facts can authorize reuse. */
export function currentPriorGroups(record: HistoryRecord, target: PriorTarget): PriorResult['groups'] {
  if (record.state !== 'alive' || record.current?.kind !== 'recorded') return [];
  return record.current.document.exercises.filter(entry => priorDefinitionMatchesTarget(entry.definition, target)).map(entry => ({
    exerciseEntryId: entry.id, definition: entry.definition, sets: entry.sets.map(set => ({ setId: set.id,
      performed: 'mode' in set.performed ? set.performed : { mode: 'weight_reps' as const, ...set.performed },
    })),
  }));
}
export function webPriorResponseMatchesRequest(response: WebPriorResponse, request: WebPriorRequest) {
  if (response.ownerId !== request.ownerId) return false;
  if (response.protocolVersion === 1) return priorResponseMatchesRequest(response, { ...request, protocolVersion: 1, before: null });
  return response.status !== 'found' || response.record.id !== request.excludeWorkoutId && currentPriorGroups(response.record, request.target).length > 0;
}
export function webPriorReference(response: WebPriorResponse, target: PriorTarget) {
  if (response.status !== 'found') return null;
  return response.protocolVersion === 1
    ? { workoutDay: response.result.workout.workoutDay, groups: response.result.groups }
    : { workoutDay: response.record.workoutDay, groups: currentPriorGroups(response.record, target) };
}
