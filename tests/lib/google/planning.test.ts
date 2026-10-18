// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), events: vi.fn() }));
vi.mock('@/lib/google/runtime', () => ({ googleConfig: () => ({}), googleRuntime: () => ({ store: { get: mocks.get } }) }));
vi.mock('@/lib/google/reads', () => ({ GoogleReads: class { events = mocks.events; } }));
import { googlePlanningEvents } from '@/lib/google/planning';
import { occupiedIntervals } from '@/lib/calendar/planner-intervals';
beforeEach(() => { vi.clearAllMocks(); mocks.events.mockResolvedValue([]); });
it.each(['connected', 'reconnect', 'select-calendars'])('rejects unknown background occupancy for %s without any provider read', async status => {
  mocks.get.mockResolvedValue({ status });
  await expect(googlePlanningEvents('owner', 0, 3600000, 'UTC', 'background')).rejects.toMatchObject({ reason: 'unavailable' });
  expect(mocks.events).not.toHaveBeenCalled();
});
it.each([null, { status: 'disconnected' }])('allows local-only background planning without an active connection', async record => {
  mocks.get.mockResolvedValue(record);
  await expect(googlePlanningEvents('owner', 0, 3600000, 'UTC', 'background')).resolves.toEqual([]);
  expect(mocks.events).not.toHaveBeenCalled();
});
it('still reads selected Google calendars for foreground planning', async () => {
  mocks.get.mockResolvedValue({ status: 'connected' });
  await googlePlanningEvents('owner', 0, 3600000, 'UTC');
  expect(mocks.events).toHaveBeenCalledWith('owner', new Date(0).toISOString(), new Date(3600000).toISOString());
});

it.each([
  ['2026-11-11', '2026-11-12', '2026-11-11', '2026-11-11T08:00:00Z', '2026-11-12T08:00:00Z'],
  ['2026-03-08', '2026-03-09', '2026-03-08', '2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'],
  ['2026-11-01', '2026-11-02', '2026-11-01', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z'],
  ['2026-11-10', '2026-11-13', '2026-11-12', '2026-11-10T08:00:00Z', '2026-11-13T08:00:00Z'],
])('preserves all-day identity and ordinary planning occupancy for %s through exclusive %s', async (startDate, exclusiveEnd, inclusiveEnd, start, end) => {
  mocks.get.mockResolvedValue({ status: 'connected' });
  mocks.events.mockResolvedValue([{ id: 'google:day', title: 'Away', allDay: true, busy: true, start: startDate, end: exclusiveEnd }]);
  const events = await googlePlanningEvents('owner', Date.parse(start), Date.parse(end), 'America/Los_Angeles');
  expect(events).toEqual([expect.objectContaining({ start_date: startDate, end_date: inclusiveEnd, start_time: null, end_time: null, timezone: 'America/Los_Angeles' })]);
  expect(occupiedIntervals(events, Date.parse(start), Date.parse(end), 'America/Los_Angeles')).toEqual([
    { id: 'google:day', title: 'Google Calendar: Away', start: Date.parse(start), end: Date.parse(end) },
  ]);
  expect(occupiedIntervals(events, Date.parse(end), Date.parse(end) + 3600000, 'America/Los_Angeles')).toEqual([]);
});
