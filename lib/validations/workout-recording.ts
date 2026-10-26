import { z } from 'zod';
import { loadDefinition, presetWorkoutDefinitionSchema as definition, v3Definition, recordedExerciseDefinitionSchema } from './workout-definition';
import { templateOriginSchema } from './train-templates';

const uuid = z.string().uuid();
const finiteLoad = z.number().finite().min(0);
const reps = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const kind = z.enum(['working', 'warmup']);
const performed = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('weight_reps'), weightKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('bodyweight_reps'), reps, kind }).strict(),
  z.object({ mode: z.literal('weighted_bodyweight'), addedWeightKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('assisted_bodyweight'), assistanceKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('duration'), durationSeconds: z.number().int().min(1).max(86400), kind }).strict(),
]);
const instantPattern = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;
export function explicitInstant(value: string) {
  if (!instantPattern.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return year > 0 && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
}
const header = {
  id: uuid, ownerId: uuid, sourceId: uuid, startedAt: z.string().refine(explicitInstant), completedAt: z.string().refine(explicitInstant),
  durationSeconds: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), timezone: z.string(),
  workoutDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), planId: z.string().nullable(),
};
const v1 = z.object({ ...header, version: z.literal(1), exercises: z.array(z.object({
  id: uuid, definition: loadDefinition, sets: z.array(z.object({ id: uuid,
    performed: z.object({ weightKg: finiteLoad, reps, kind }).strict(),
  }).strict()).min(1),
}).strict()).min(1) }).strict();
const v2 = z.object({ ...header, version: z.literal(2), exercises: z.array(z.object({
  id: uuid, definition, sets: z.array(z.object({ id: uuid, performed }).strict()).min(1),
}).strict().refine(entry => entry.sets.every(set => set.performed.mode === entry.definition.mode))).min(1) }).strict();
const v3 = z.object({ ...header, version: z.literal(3), exercises: z.array(z.object({
  id:uuid,definition:v3Definition,sets:z.array(z.object({id:uuid,performed}).strict()).min(1),
}).strict().refine(entry=>entry.sets.every(set=>set.performed.mode===entry.definition.mode))).min(1) }).strict()
  .refine(value=>value.exercises.every(entry=>!('reference' in entry.definition)||entry.definition.reference.ownerId===value.ownerId));

const v4 = z.object({ ...header, version: z.literal(4), templateOrigin: templateOriginSchema,
  exercises: z.array(z.object({ id: uuid, definition: recordedExerciseDefinitionSchema,
    sets: z.array(z.object({ id: uuid, performed }).strict()).min(1),
  }).strict().refine(entry => entry.sets.every(set => set.performed.mode === entry.definition.mode))).min(1),
}).strict().refine(value => value.templateOrigin.content.ownerId === value.ownerId
  && value.exercises.every(entry => !('reference' in entry.definition) || entry.definition.reference.kind !== 'custom' || entry.definition.reference.ownerId === value.ownerId))
  .refine(value => {
    const origin = value.templateOrigin;
    const ids = [origin.content.id, ...origin.content.entries.flatMap(entry => [entry.id, entry.exerciseId,
      ...(entry.targets.kind === 'sets' ? entry.targets.items.map(target => target.id) : [])]),
      ...origin.bindings.flatMap(binding => [binding.workoutEntryId, ...binding.targets.map(target => target.workoutSetId)])];
    if (ids.includes(value.id)) return false;
    return value.exercises.every(entry => {
      const binding = origin.bindings.find(binding => binding.workoutEntryId === entry.id);
      if (binding && JSON.stringify(entry.definition) !== JSON.stringify(origin.definitions.find(capture => capture.entryId === binding.entryId)!.definition)) return false;
      return entry.sets.every(set => !origin.bindings.some(source => source.workoutEntryId !== entry.id && source.targets.some(target => target.workoutSetId === set.id)));
    });
  });

/** Validation only. Readers retain the original document, never a parsed rewrite. */
export const recordedWorkoutSchema = z.union([v1, v2, v3, v4]).refine(value => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value.startedAt));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    if (`${part('year')}-${part('month')}-${part('day')}` !== value.workoutDay) return false;
    const ids = value.exercises.flatMap(entry => [entry.id, ...entry.sets.map(set => set.id)]);
    return new Set(ids).size === ids.length;
  } catch { return false; }
});
export type RecordedCompletion = z.infer<typeof recordedWorkoutSchema>;
export type CapturedDefinition = z.infer<typeof recordedExerciseDefinitionSchema>;

export { performed as recordedPerformedSchema };
