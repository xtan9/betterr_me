import { type PlannerEvent, wallInstant } from '@/lib/calendar/planner-intervals';
import { addLocalDays } from '@/lib/recurring-tasks/scheduling';
import { googleConfig, googleRuntime } from './runtime';
import { GoogleReads } from './reads';
import { GoogleConnectionError } from './contracts';

/** Read-through occupancy; external events never become editable planner records. */
export async function googlePlanningEvents(userId: string, start: number, end: number, timezone: string): Promise<PlannerEvent[]> {
  if (!googleConfig()) return [];
  const connections = googleRuntime(), record = await connections.store.get(userId, 'calendar');
  if (!record || record.status === 'disconnected') return [];
  if (record.status !== 'connected') throw new GoogleConnectionError(record.status);
  const events = await new GoogleReads(connections).events(userId, new Date(start).toISOString(), new Date(end).toISOString());
  return events.filter(event => event.busy).map(event => {
    const a = event.allDay ? new Date(wallInstant(event.start, '00:00', timezone)).toISOString() : new Date(event.start).toISOString();
    const b = event.allDay ? new Date(wallInstant(event.end, '00:00', timezone)).toISOString() : new Date(event.end).toISOString();
    return { id: event.id, title: `Google Calendar: ${event.title}`, start_date: a.slice(0, 10), end_date: b.slice(0, 10), start_time: a.slice(11, 19), end_time: b.slice(11, 19), timezone: 'UTC', app_owned: false, is_protected: true, is_recurring: false, is_exception: false, recurrence_rule: null };
  });
}
export async function googleDayRange(userId: string, startDate: string, endDate: string, timezone: string) {
  return googlePlanningEvents(userId, wallInstant(startDate, '00:00', timezone), wallInstant(addLocalDays(endDate, 1), '00:00', timezone), timezone);
}
