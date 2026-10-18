// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { PreparedSleep } from '@/lib/calendar/sleep-preview';

const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), events: vi.fn(), provider: vi.fn() }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: m.auth }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.admin }) }));
vi.mock('@/lib/google/runtime', () => ({
  googleConfig: () => ({}),
  googleRuntime: () => ({
    store: { get: async () => ({ status: 'connected' }) },
    read: (_owner: string, _service: string, run: (record: unknown, token: string) => unknown) => run({ selectedCalendars: ['school'] }, 'fixture-token'),
    provider: m.provider,
  }),
}));
import { POST } from '@/app/api/mobile/sleep/route';

const owner = '73000000-0000-4000-8000-000000000001';
const change = { operation: 'setup', expectedVersion: null, timezone: 'America/Los_Angeles', startTime: '21:30', endTime: '05:30' };
const core: PreparedSleep = {
  status: 'complete', token: 'core-token', effectiveDate: '2026-11-10', rangeStart: '2026-11-10', rangeEnd: '2026-11-12', timezone: 'America/Los_Angeles', preserved: 0,
  intervals: [
    { nightDate: '2026-11-10', startDate: '2026-11-10', endDate: '2026-11-11', startTime: '21:30', endTime: '05:30', start: '2026-11-11T05:30:00Z', end: '2026-11-11T13:30:00Z' },
    { nightDate: '2026-11-11', startDate: '2026-11-11', endDate: '2026-11-12', startTime: '21:30', endTime: '05:30', start: '2026-11-12T05:30:00Z', end: '2026-11-12T13:30:00Z' },
  ],
};
const allDay = { id: 'day', summary: 'School calendar day', start: { date: '2026-11-11' }, end: { date: '2026-11-12' } };
const request = (body: unknown) => new Request('https://backend.test/api/mobile/sleep', { method: 'POST', body: JSON.stringify(body) });
function googleEvents(items: unknown[]) {
  m.provider.mockImplementation(async (url: string) => url.includes('/calendarList')
    ? { items: [{ id: 'school', summary: 'School', accessRole: 'reader' }] } : { items });
}
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: () => query, eq: () => query, is: () => query, order: () => query, range: m.events, maybeSingle: async () => ({ data: null }) };
  m.auth.mockResolvedValue({ userId: owner, client: { from: () => query, rpc: async () => ({ data: { status: 'complete' } }) } });
  m.admin.mockImplementation(async name => ({ data: name === 'planner_sleep_prepare' ? core : { status: 'complete' } }));
  m.events.mockResolvedValue({ data: [] });
  googleEvents([allDay]);
});

it('saves sleep without confirmation when one Google all-day event overlaps both adjacent nights', async () => {
  const response = await POST(request({ action: 'preview', change }));
  expect(response.status).toBe(200);
  const preview = await response.json();
  expect(preview.conflicts).toEqual([]);
  const command = { action: 'save', change, operationId: owner, previewToken: preview.token };
  const saved = await POST(request(command));
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({ status: 'complete' });
  expect(m.admin).toHaveBeenCalledWith('planner_sleep_commit', { p_owner: owner, p_request: command, p_token: core.token });
});

it('rechecks a date-only event changed to a timed commitment before saving', async () => {
  const preview = await (await POST(request({ action: 'preview', change }))).json();
  googleEvents([{ ...allDay, start: { dateTime: '2026-11-11T22:00:00-08:00' }, end: { dateTime: '2026-11-11T23:00:00-08:00' } }]);
  expect(await (await POST(request({ action: 'save', change, operationId: owner, previewToken: preview.token }))).json()).toEqual({ status: 'conflict' });
  expect(m.admin.mock.calls.some(([name]) => name === 'planner_sleep_commit')).toBe(false);
  const refreshed = await (await POST(request({ action: 'preview', change }))).json();
  expect(refreshed.conflicts).toEqual([{ id: 'google:school:day', title: 'Google Calendar: School calendar day', nightDate: '2026-11-11', start: '2026-11-12T06:00:00.000Z', end: '2026-11-12T07:00:00.000Z' }]);
});

it('keeps a genuinely timed midnight-to-midnight event in sleep conflict confirmation', async () => {
  googleEvents([{ ...allDay, start: { dateTime: '2026-11-11T00:00:00-08:00' }, end: { dateTime: '2026-11-12T00:00:00-08:00' } }]);
  const preview = await (await POST(request({ action: 'preview', change }))).json();
  expect(preview.conflicts.map((conflict: { nightDate: string }) => conflict.nightDate)).toEqual(['2026-11-10', '2026-11-11']);
});

it('ignores available timed events and permits updates to an all-day event during direct save', async () => {
  const available = { id: 'available', summary: 'Available reminder', transparency: 'transparent', start: { dateTime: '2026-11-11T22:00:00-08:00' }, end: { dateTime: '2026-11-11T23:00:00-08:00' } };
  googleEvents([allDay, available]);
  const preview = await (await POST(request({ action: 'preview', change }))).json();
  expect(preview.conflicts).toEqual([]);
  googleEvents([{ ...allDay, summary: 'Updated school calendar day', end: { date: '2026-11-13' } }, available]);
  expect(await (await POST(request({ action: 'save', change, operationId: owner, previewToken: preview.token }))).json()).toEqual({ status: 'complete' });
});
