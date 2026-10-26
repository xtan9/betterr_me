/** A civil day uses UTC only as a formatting bridge, never as a recorded instant. */
export function formatWorkoutDay(
  workout: { workoutDay?: string | null; started_at: string | null },
  locale?: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string | null {
  if (Object.hasOwn(workout, 'workoutDay')) {
    if (!workout.workoutDay || !/^\d{4}-\d{2}-\d{2}$/.test(workout.workoutDay)) return null;
    const [year, month, day] = workout.workoutDay.split('-').map(Number), bridge = new Date(0);
    bridge.setUTCFullYear(year, month - 1, day);
    if (year < 1 || bridge.getUTCFullYear() !== year || bridge.getUTCMonth() !== month - 1 || bridge.getUTCDate() !== day) return null;
    return bridge.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
  }
  if (!workout.started_at) return null;
  const start = new Date(workout.started_at);
  return Number.isFinite(start.getTime()) ? start.toLocaleDateString(locale, options) : null;
}

export function knownWorkoutDuration(seconds: number | null): seconds is number {
  return seconds !== null && Number.isSafeInteger(seconds) && seconds >= 0;
}
