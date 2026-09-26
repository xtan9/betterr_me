// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), events: vi.fn() }));
vi.mock('@/lib/google/runtime', () => ({ googleConfig: () => ({}), googleRuntime: () => ({ store: { get: mocks.get } }) }));
vi.mock('@/lib/google/reads', () => ({ GoogleReads: class { events = mocks.events; } }));
import { googlePlanningEvents } from '@/lib/google/planning';
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
