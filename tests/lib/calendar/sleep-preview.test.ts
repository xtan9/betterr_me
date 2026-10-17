import { describe, expect, it } from 'vitest';
import { sleepConflictPreview, type PreparedSleep } from '@/lib/calendar/sleep-preview';
import type { PlannerEvent } from '@/lib/calendar/planner-intervals';

const prepared: PreparedSleep = { status: 'complete', token: 'core', effectiveDate: '2026-10-17', rangeStart: '2026-10-17', rangeEnd: '2026-10-18', timezone: 'UTC', preserved: 0,
  intervals: [{ nightDate: '2026-10-17', startDate: '2026-10-17', endDate: '2026-10-18', startTime: '23:00', endTime: '07:00', start: '2026-10-17T23:00:00Z', end: '2026-10-18T07:00:00Z' }] };
const meeting: PlannerEvent = { id: 'meeting', title: 'Late meeting', start_date: '2026-10-01', end_date: '2026-10-01', start_time: '23:30', end_time: '23:45', timezone: 'UTC', is_recurring: true, recurrence_rule: { frequency: 'daily', interval: 1 } };
describe('sleep conflict confirmation', () => {
  it('expands recurring commitments to the real conflicting date', () => {
    const result = sleepConflictPreview(prepared, [meeting]);
    expect(result.conflicts).toEqual([{ id: 'meeting_2026-10-17', title: 'Late meeting', nightDate: '2026-10-17', start: '2026-10-17T23:30:00.000Z', end: '2026-10-17T23:45:00.000Z' }]);
  });
  it('invalidates confirmation for a changed external commitment and preserves exact boundary adjacency', () => {
    const before = sleepConflictPreview(prepared, [meeting]);
    expect(sleepConflictPreview(prepared, [{ ...meeting, title: 'Changed external meeting' }]).token).not.toBe(before.token);
    expect(sleepConflictPreview(prepared, [{ ...meeting, start_time: '22:00', end_time: '23:00' }]).conflicts).toEqual([]);
  });
});
