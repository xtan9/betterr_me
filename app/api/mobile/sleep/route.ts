import { z } from 'zod';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { googleDayRange } from '@/lib/google/planning';
import { sleepConflictPreview, type PreparedSleep } from '@/lib/calendar/sleep-preview';
import type { PlannerEvent } from '@/lib/calendar/planner-intervals';
import { addLocalDays, isValidLocalDate } from '@/lib/recurring-tasks/scheduling';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const day = z.string().refine(isValidLocalDate), clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const changeSchema = z.object({ operation: z.enum(['setup', 'revise', 'night']), expectedVersion: z.string().uuid().nullable(),
  startTime: clock, endTime: clock, timezone: z.string().max(100).optional(), effectiveDate: day.optional(), nightDate: day.optional(), startDate: day.optional(), eventId: z.string().uuid().optional(), expectedEventVersion: z.string().uuid().optional() }).strict();
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), change: changeSchema }).strict(),
  z.object({ action: z.literal('save'), change: changeSchema, operationId: z.string().uuid(), previewToken: z.string().length(64) }).strict(),
]);
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return reply({ error: 'unauthorized' }, 401);
    const result = await auth.client.rpc('planner_sleep_snapshot');
    return result.error ? reply({ error: 'unavailable' }, 503) : reply(result.data);
  } catch { return reply({ error: 'unavailable' }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return reply({ error: 'unauthorized' }, 401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4096) return reply({ error: 'invalid' }, 413);
    const input = requestSchema.parse(JSON.parse(raw)), admin = createAdminClient();
    if (input.action === 'save') {
      // Resolve an uncertain successful save before requiring another external-calendar read.
      const receipt = await auth.client.from('planner_command_receipts').select('request,outcome').eq('user_id', auth.userId).eq('operation_id', input.operationId).maybeSingle();
      if (receipt.error) throw new Error('Receipt unavailable');
      if (receipt.data) {
        const { isDeepStrictEqual } = await import('node:util');
        return isDeepStrictEqual(receipt.data.request, input) ? reply({ ...receipt.data.outcome, status: 'already-applied' }) : reply({ status: 'conflict' });
      }
    }
    let prepared = await admin.rpc('planner_sleep_prepare', { p_owner: auth.userId, p_change: input.change });
    if (prepared.error) throw new Error('Prepare unavailable');
    if (prepared.data.status !== 'complete') return reply(prepared.data);
    // Each routine snapshot covers the requested date; extend the actual preview range.
    const coverage = await auth.client.rpc('planner_sleep_routine_coverage', { p_start: addLocalDays(prepared.data.rangeStart, -1), p_end: prepared.data.rangeEnd });
    if (coverage.error) throw new Error('Routine coverage unavailable');
    prepared = await admin.rpc('planner_sleep_prepare', { p_owner: auth.userId, p_change: input.change });
    if (prepared.error) throw new Error('Prepare unavailable');
    if (prepared.data.status !== 'complete') return reply(prepared.data);
    const core = prepared.data as PreparedSleep, events: PlannerEvent[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await auth.client.from('calendar_events').select('*').eq('user_id', auth.userId).is('sleep_schedule_id', null).order('id').range(offset, offset + 499);
      if (result.error) throw new Error('Calendar unavailable');
      events.push(...result.data);
      if (result.data.length < 500) break;
    }
    events.push(...await googleDayRange(auth.userId, core.rangeStart, core.rangeEnd, core.timezone));
    const preview = sleepConflictPreview(core, events);
    if (input.action === 'preview') return reply(preview);
    if (preview.token !== input.previewToken) return reply({ status: 'conflict' });
    const saved = await admin.rpc('planner_sleep_commit', { p_owner: auth.userId, p_request: input, p_token: core.token });
    if (saved.error) throw new Error('Save unavailable');
    return reply(saved.data);
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return reply({ error: invalid ? 'invalid' : 'unavailable' }, invalid ? 400 : 503);
  }
}
