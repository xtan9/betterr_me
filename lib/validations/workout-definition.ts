import { z } from 'zod';
import { EQUIPMENT } from '@/lib/constants/enums';
import { exerciseConvention, exerciseConventionSchema, exerciseIdSchema } from './train-exercises';

const definitionBase = {
  catalogKey: z.string().regex(/^strength\.[a-z0-9-]+\.v[1-9][0-9]*$/),
  name: z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict(),
};
export const loadDefinition = z.object({ ...definitionBase, mode: z.literal('weight_reps'),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable']),
  convention: z.enum(['barbell-total', 'per-dumbbell', 'selected-load']),
}).strict().refine(value => value.convention === (value.equipment === 'barbell' ? 'barbell-total' : value.equipment === 'dumbbell' ? 'per-dumbbell' : 'selected-load'));
export const presetWorkoutDefinitionSchema = z.union([
  loadDefinition,
  z.object({ ...definitionBase, mode: z.literal('bodyweight_reps'), equipment: z.literal('bodyweight'), convention: z.literal('bodyweight-repetitions') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('weighted_bodyweight'), equipment: z.literal('bodyweight'), convention: z.literal('added-load') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('assisted_bodyweight'), equipment: z.literal('machine'), convention: z.literal('assistance') }).strict(),
  z.object({ ...definitionBase, mode: z.literal('duration'), equipment: z.enum(['bodyweight', 'other']), convention: z.literal('seconds') }).strict(),
]);
export const customDefinition = z.object({
  reference: z.object({ kind:z.literal('custom'), exerciseId:exerciseIdSchema, ownerId:exerciseIdSchema }).strict(),
  // A historical name is one actual string, including unusual legacy values.
  name:z.string(), equipment:z.enum(EQUIPMENT),
  mode:z.enum(['weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration']),
  convention:exerciseConventionSchema.nullable(),
}).strict().refine(value=>value.convention===null||value.convention===exerciseConvention(value.equipment,value.mode));
export const v3Definition=z.union([presetWorkoutDefinitionSchema,customDefinition]);
export const recordedExerciseDefinitionSchema = z.union([v3Definition, z.object({
  reference: z.object({ kind: z.literal('preset'), exerciseId: exerciseIdSchema }).strict(),
  name: z.string(), equipment: z.enum(EQUIPMENT),
  mode: z.enum(['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration']),
  convention: z.null(),
}).strict()]);
