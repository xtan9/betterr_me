import { createHash } from 'node:crypto';
import { occupiedIntervals, wallInstant, type PlannerEvent } from './planner-intervals';
import { addLocalDays } from '@/lib/recurring-tasks/scheduling';

export type PreparedSleep = { status: string; token: string; effectiveDate: string; rangeStart: string; rangeEnd: string;
  timezone: string; preserved: number; intervals: { nightDate: string; startDate: string; endDate: string; startTime: string; endTime: string; start: string; end: string }[] };

/** Includes concrete recurrence dates. Only the stated bounded horizon is checked. */
export function sleepConflictPreview(prepared: PreparedSleep, events: PlannerEvent[]) {
  const occupied = occupiedIntervals(events, wallInstant(prepared.rangeStart, '00:00', prepared.timezone),
    wallInstant(addLocalDays(prepared.rangeEnd, 1), '00:00', prepared.timezone), prepared.timezone, { timedOnly: true });
  const conflicts = prepared.intervals.flatMap(sleep => occupied.filter(event => event.start < Date.parse(sleep.end) && Date.parse(sleep.start) < event.end)
    .map(event => ({ ...event, start: new Date(event.start).toISOString(), end: new Date(event.end).toISOString(), nightDate: sleep.nightDate })))
    .sort((a, b) => a.nightDate.localeCompare(b.nightDate) || a.id.localeCompare(b.id));
  // Sorting makes equivalent readback stable; a title/date/occupancy change invalidates confirmation.
  const token = createHash('sha256').update(JSON.stringify({ core: prepared.token, conflicts })).digest('hex');
  return { ...prepared, token, conflicts };
}
