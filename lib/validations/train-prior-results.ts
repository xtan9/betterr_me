import { z } from 'zod';
import { EQUIPMENT, EXERCISE_TYPES } from '@/lib/constants/enums';
import { exerciseConvention, exerciseConventionSchema, exerciseIdSchema as id } from './train-exercises';
import { recordedExerciseDefinitionSchema } from './workout-definition';
import { explicitInstant, recordedPerformedSchema } from './workout-recording';

export const priorCursorSchema = z.object({ startedAt: z.string().refine(explicitInstant), id }).strict();
export const priorTargetSchema = z.object({
  identity: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('catalog'), catalogKey: z.string().regex(/^strength\.[a-z0-9-]+\.v[1-9][0-9]*$/) }).strict(),
    z.object({ kind: z.literal('preset'), exerciseId: id }).strict(),
    z.object({ kind: z.literal('custom'), ownerId: id, exerciseId: id }).strict(),
  ]),
  mode: z.enum(EXERCISE_TYPES), equipment: z.enum(EQUIPMENT), convention: exerciseConventionSchema.nullable(),
}).strict().refine(value => value.convention === null || value.convention === exerciseConvention(value.equipment, value.mode));
export const priorRequestSchema = z.object({ protocolVersion: z.literal(1), ownerId: id, target: priorTargetSchema,
  excludeWorkoutId: id.nullable(), before: priorCursorSchema.nullable(),
}).strict();
const workout = z.object({ id, startedAt: z.string().refine(explicitInstant), completedAt: z.string().refine(explicitInstant),
  workoutDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string(),
}).strict().refine(value => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value.startedAt));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    return value.workoutDay === `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return false; }
});
export const priorResultSchema = z.object({ workout, groups: z.array(z.object({
  exerciseEntryId: id, definition: recordedExerciseDefinitionSchema.refine(value => value.convention !== null),
  sets: z.array(z.object({ setId: id, performed: recordedPerformedSchema }).strict()).min(1),
}).strict().refine(group => group.sets.every(set => set.performed.mode === group.definition.mode))).min(1),
}).strict().refine(value => {
  const ids = value.groups.flatMap(group => [group.exerciseEntryId, ...group.sets.map(set => set.setId)]);
  return new Set(ids).size === ids.length;
});
const base = { protocolVersion: z.literal(1), ownerId: id };
const observed = z.array(id).max(20).refine(ids => new Set(ids).size === ids.length);
export const priorResponseSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('found'), observedWorkoutIds: observed, result: priorResultSchema }).strict(),
  z.object({ ...base, status: z.literal('searching'), observedWorkoutIds: observed, nextCursor: priorCursorSchema }).strict(),
  z.object({ ...base, status: z.literal('exhausted'), observedWorkoutIds: observed }).strict(),
  z.object({ ...base, status: z.literal('unavailable'), reason: z.enum(['meaning_unknown', 'mode_unsupported', 'definition_unavailable', 'service_unavailable']) }).strict(),
]).refine(value => value.status === 'found' ? value.observedWorkoutIds.at(-1) === value.result.workout.id
  : value.status === 'searching' ? value.observedWorkoutIds.length === 20 && value.observedWorkoutIds.at(-1) === value.nextCursor.id : true);
export type PriorRequest = z.infer<typeof priorRequestSchema>;
export type PriorTarget = z.infer<typeof priorTargetSchema>;
export type PriorResult = z.infer<typeof priorResultSchema>;
export type PriorResponse = z.infer<typeof priorResponseSchema>;

export type PriorRead = { request: PriorRequest; page: PriorResponse };
export type PriorPerformed = z.infer<typeof recordedPerformedSchema>;

export function priorDefinitionMatchesTarget(definition: z.infer<typeof recordedExerciseDefinitionSchema>, target: PriorTarget) {
  if (definition.mode !== target.mode || definition.equipment !== target.equipment || definition.convention === null
    || definition.convention !== target.convention) return false;
  if (target.identity.kind === 'catalog') return 'catalogKey' in definition && definition.catalogKey === target.identity.catalogKey;
  return target.identity.kind === 'custom' && 'reference' in definition && definition.reference.kind === 'custom'
    && definition.reference.exerciseId === target.identity.exerciseId && definition.reference.ownerId === target.identity.ownerId;
}
export function priorResponseMatchesRequest(response: PriorResponse, request: PriorRequest) {
  return response.ownerId === request.ownerId && (response.status !== 'found'
    || response.result.workout.id !== request.excludeWorkoutId
      && response.result.groups.every(group => priorDefinitionMatchesTarget(group.definition, request.target)));
}
