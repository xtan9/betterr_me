import type { SupabaseClient } from '@supabase/supabase-js';
import { selectRecordedCompletion } from './recorded-definition';
import { priorCursorSchema, priorDefinitionMatchesTarget, priorResponseSchema, type PriorRequest, type PriorResult, type PriorResponse } from '@/lib/validations/train-prior-results';

const pageSize = 20;
export const priorWorkoutSelection = 'id,user_id,status,started_at,completed_at,duration_seconds,routine_id,native_completion,recorded_completion,workout_exercises(id,exercise_id,exercise:exercises(id,user_id,catalog_key),sets:workout_sets(id,is_completed))';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const supportedModes = ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration'];

function resultFromParent(row: Record<string, unknown>, request: PriorRequest, referenceId: string): PriorResult | null {
  const selected = selectRecordedCompletion(row);
  if (selected.status !== 'recorded' || selected.completion.version === 5 || !Array.isArray(row.workout_exercises)) return null;
  const captured = selected.completion;
  const groups: PriorResult['groups'] = [];
  for (const entry of captured.exercises) {
    if (!priorDefinitionMatchesTarget(entry.definition, request.target)) continue;
    const normalized = row.workout_exercises.find(value => object(value) && value.id === entry.id);
    if (!object(normalized) || normalized.exercise_id !== referenceId || !object(normalized.exercise)
      || normalized.exercise.id !== referenceId || !(normalized.exercise.user_id === null || normalized.exercise.user_id === request.ownerId)
      || !Array.isArray(normalized.sets)) continue;
    const sets = entry.sets.flatMap(set => {
      if (!(normalized.sets as unknown[]).some(value => object(value) && value.id === set.id && value.is_completed === true)) return [];
      const performed = 'mode' in set.performed ? set.performed : { mode: 'weight_reps' as const, ...set.performed };
      return [{ setId: set.id, performed }];
    });
    if (sets.length) groups.push({ exerciseEntryId: entry.id, definition: entry.definition, sets });
  }
  return groups.length ? { workout: { id: captured.id, startedAt: row.started_at as string,
    completedAt: row.completed_at as string, workoutDay: captured.workoutDay, timezone: captured.timezone }, groups } : null;
}

/** Parent pagination cannot mistake a page of ineligible children for exhausted history. */
export async function readPriorResults(client: SupabaseClient, request: PriorRequest): Promise<PriorResponse> {
  const base = { protocolVersion: 1 as const, ownerId: request.ownerId };
  const unavailable = (reason: 'meaning_unknown' | 'mode_unsupported' | 'definition_unavailable'): PriorResponse => ({ ...base, status: 'unavailable', reason });
  if (!supportedModes.includes(request.target.mode)) return unavailable('mode_unsupported');
  if (request.target.convention === null) return unavailable('meaning_unknown');
  const identity = request.target.identity;
  if (identity.kind === 'custom' && identity.ownerId !== request.ownerId) return unavailable('definition_unavailable');
  let referenceQuery = client.from('exercises').select('id,user_id,catalog_key');
  referenceQuery = identity.kind === 'catalog' ? referenceQuery.eq('catalog_key', identity.catalogKey).is('user_id', null)
    : identity.kind === 'preset' ? referenceQuery.eq('id', identity.exerciseId).is('user_id', null)
    : referenceQuery.eq('id', identity.exerciseId).eq('user_id', request.ownerId);
  const reference = await referenceQuery.maybeSingle();
  if (reference.error) throw new Error('Prior result reference unavailable');
  if (!object(reference.data) || typeof reference.data.id !== 'string'
    || reference.data.user_id !== (identity.kind === 'custom' ? request.ownerId : null)
    || (identity.kind === 'catalog' ? reference.data.catalog_key !== identity.catalogKey : reference.data.id !== identity.exerciseId)) return unavailable('definition_unavailable');
  let query = client.from('workouts').select(priorWorkoutSelection).eq('user_id', request.ownerId).eq('status', 'completed')
    .order('started_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1);
  if (request.excludeWorkoutId !== null) query = query.neq('id', request.excludeWorkoutId);
  if (request.before) query = query.or(`started_at.lt.${request.before.startedAt},and(started_at.eq.${request.before.startedAt},id.lt.${request.before.id})`);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) throw new Error('Prior result history unavailable');
  const observedWorkoutIds: string[] = [];
  let last: { startedAt: string; id: string } | null = null;
  for (const row of data.slice(0, pageSize)) {
    if (!object(row) || row.user_id !== request.ownerId || row.status !== 'completed' || row.id === request.excludeWorkoutId) throw new Error('Invalid prior result parent');
    const cursor = priorCursorSchema.safeParse({ startedAt: row.started_at, id: row.id });
    if (!cursor.success || observedWorkoutIds.includes(cursor.data.id)) throw new Error('Invalid prior result cursor');
    observedWorkoutIds.push(cursor.data.id); last = cursor.data;
    const result = resultFromParent(row, request, reference.data.id);
    if (result) return priorResponseSchema.parse({ ...base, status: 'found', observedWorkoutIds, result });
  }
  return priorResponseSchema.parse(data.length > pageSize && last
    ? { ...base, status: 'searching', observedWorkoutIds, nextCursor: last }
    : { ...base, status: 'exhausted', observedWorkoutIds });
}
