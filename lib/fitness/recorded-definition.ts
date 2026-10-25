type CapturedDefinition = { catalogKey: string; name: { en: string; zh: string }; equipment: string; mode: string; convention: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Read only the accepted document. Live catalog metadata never fills historical facts. */
export function recordedDefinition(completion: unknown, entryId: unknown): CapturedDefinition | null {
  if (completion == null) return null;
  if (!object(completion) || completion.version !== 1 || !Array.isArray(completion.exercises)) throw new Error('Unsupported recorded workout definition');
  const entry = completion.exercises.find(value => object(value) && value.id === entryId);
  if (!object(entry) || !object(entry.definition)) throw new Error('Unsupported recorded workout definition');
  const value = entry.definition;
  if (!object(value.name) || typeof value.name.en !== 'string' || typeof value.name.zh !== 'string'
    || typeof value.catalogKey !== 'string' || typeof value.equipment !== 'string' || typeof value.mode !== 'string' || typeof value.convention !== 'string') throw new Error('Unsupported recorded workout definition');
  return value as CapturedDefinition;
}

export function recordedExercise(completion: unknown, entry: Record<string, unknown>) {
  const captured = recordedDefinition(completion, entry.id);
  if (!captured) return entry;
  return { ...entry, live_exercise: entry.exercise, recorded_definition: captured,
    exercise: { ...(object(entry.exercise) ? entry.exercise : {}), name: captured.name.en, equipment: captured.equipment, exercise_type: captured.mode } };
}
