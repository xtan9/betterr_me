import { z } from 'zod';

const uuid = z.string().uuid();
const finiteLoad = z.number().finite().min(0);
const reps = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const kind = z.enum(['working', 'warmup']);
const definitionBase = {
  catalogKey: z.string().regex(/^strength\.[a-z0-9-]+\.v[1-9][0-9]*$/),
  name: z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict(),
};
const loadDefinition = z.object({ ...definitionBase, mode: z.literal('weight_reps'),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable']),
  convention: z.enum(['barbell-total', 'per-dumbbell', 'selected-load']),
}).strict().refine(value => value.convention === (value.equipment === 'barbell' ? 'barbell-total' : value.equipment === 'dumbbell' ? 'per-dumbbell' : 'selected-load'));
const definition = z.union([
  loadDefinition,
  z.object({ ...definitionBase, mode: z.literal('bodyweight_reps'), equipment: z.literal('bodyweight'), convention: z.literal('bodyweight-repetitions') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('weighted_bodyweight'), equipment: z.literal('bodyweight'), convention: z.literal('added-load') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('assisted_bodyweight'), equipment: z.literal('machine'), convention: z.literal('assistance') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('duration'), equipment: z.enum(['bodyweight', 'other']), convention: z.literal('seconds') }).strict(),
]);
const performed = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('weight_reps'), weightKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('bodyweight_reps'), reps, kind }).strict(),
  z.object({ mode: z.literal('weighted_bodyweight'), addedWeightKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('assisted_bodyweight'), assistanceKg: finiteLoad, reps, kind }).strict(),
  z.object({ mode: z.literal('duration'), durationSeconds: z.number().int().min(1).max(86400), kind }).strict(),
]);
const instantPattern = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;
function explicitInstant(value: string) {
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

/** Validation only. Readers retain the original document, never a parsed rewrite. */
export const recordedWorkoutSchema = z.union([v1, v2]).refine(value => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: value.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value.startedAt));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    if (`${part('year')}-${part('month')}-${part('day')}` !== value.workoutDay) return false;
    const ids = value.exercises.flatMap(entry => [entry.id, ...entry.sets.map(set => set.id)]);
    return new Set(ids).size === ids.length;
  } catch { return false; }
});
export type RecordedCompletion = z.infer<typeof recordedWorkoutSchema>;
export type CapturedDefinition = z.infer<typeof definition>;
