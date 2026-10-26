import type { Exercise } from '@/lib/db/types';
import { exerciseConvention } from '@/lib/validations/train-exercises';
import { priorRequestSchema, type PriorRequest } from '@/lib/validations/train-prior-results';

/** Continuing Web records against its current accepted exercise definition. */
export function priorRequestForExercise(ownerId: string, workoutId: string, exercise?: Exercise): PriorRequest | null {
  if (!exercise) return null;
  const identity = exercise.user_id === null
    ? exercise.catalog_key ? { kind: 'catalog', catalogKey: exercise.catalog_key } : { kind: 'preset', exerciseId: exercise.id }
    : { kind: 'custom', ownerId: exercise.user_id, exerciseId: exercise.id };
  const value = priorRequestSchema.safeParse({ protocolVersion: 1, ownerId, excludeWorkoutId: workoutId, before: null,
    target: { identity, mode: exercise.exercise_type, equipment: exercise.equipment,
      convention: exercise.user_id === null ? exercise.catalog_key ? exerciseConvention(exercise.equipment, exercise.exercise_type) : null
        : exercise.measurement_convention ?? null } });
  return value.success ? value.data : null;
}
