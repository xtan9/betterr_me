import { z } from 'zod';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { googleDayRange } from '@/lib/google/planning';
import { occupiedIntervals, wallInstant, type PlannerEvent } from '@/lib/calendar/planner-intervals';
import { addLocalDays, getOccurrencesInRange } from '@/lib/recurring-tasks/scheduling';
import type { RecurrenceRule } from '@/lib/db/types';
import { log } from '@/lib/logger';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const commandSchema = z.object({ operation: z.enum(['accept', 'reject', 'undo']), operationId: z.string().uuid(), proposalId: z.string().uuid().optional(), changeId: z.string().uuid().optional(), expectedVersion: z.string().uuid() }).strict();
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return reply({ error: 'unauthorized' }, 401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4096) return reply({ error: 'invalid' }, 413);
    const command = commandSchema.parse(JSON.parse(raw));
    if (command.operation === 'accept') {
      if (!command.proposalId) return reply({ error: 'invalid' }, 400);
      const { data, error } = await auth.client.from('planner_ai_proposals').select('body,state,version,proposal_type').eq('user_id', auth.userId).eq('id', command.proposalId).maybeSingle();
      if (error) return reply({ error: 'unavailable' }, 503);
      if (!data || data.proposal_type !== 'schedule' || data.state === 'pending' && data.version !== command.expectedVersion) return reply({ error: 'conflict' }, 409);
      // A retry of an applied command uses the existing database idempotency path.
      if (data.state === 'pending') {
        const body = data.body, first = body.horizon?.startDate ?? body.date, last = body.horizon?.endDate ?? body.date;
        const external = await googleDayRange(auth.userId, first, last, body.timezone);
        const start = wallInstant(first, '00:00', body.timezone), end = wallInstant(addLocalDays(last, 1), '00:00', body.timezone);
        const existing = occupiedIntervals(external, start, end, body.timezone);
        if (existing.length) {
          const proposed: PlannerEvent[] = body.events.filter((event: {kind:string}) => event.kind !== 'event-remove').map((event: {id:string;changes:PlannerEvent}) => ({ ...event.changes, id: event.id, is_recurring: false }));
          for (const item of body.capture.items) if (item.kind === 'routine-create') {
            const c = item.changes;
            for (const date of getOccurrencesInRange(c.rule as RecurrenceRule, c.date, first, last)) proposed.push({ id: `${item.id}:${date}`, title: c.title, start_date: date, end_date: date, start_time: c.startTime, end_time: c.endTime, timezone: c.timezone, is_recurring: false });
          }
          if (occupiedIntervals(proposed, start, end, body.timezone).some(event => existing.some(other => event.start < other.end && other.start < event.end))) return reply({ error: 'conflict' }, 409);
        }
      }
    }
    const result = await auth.client.rpc('planner_schedule_command', { p_request: command });
    if (result.error) return reply({ error: 'unavailable' }, 503);
    return reply(result.data);
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    if (!invalid) log.error('[mobile-planning-command] Request failed', undefined, { reason: 'unavailable' });
    return reply({ error: invalid ? 'invalid' : 'unavailable' }, invalid ? 400 : 503);
  }
}
