/** Nested joins also need owner scoping when the caller is a trusted service client. */
export function visibleExerciseEntries(value: unknown, owner?: string): Record<string, unknown>[] {
  const entries = Array.isArray(value) ? value as Record<string, unknown>[] : [];
  if (!owner) return entries;
  return entries.filter(entry => {
    const definition = entry.exercise as { user_id?: string | null } | null;
    return !definition || definition.user_id == null || definition.user_id === owner;
  });
}
