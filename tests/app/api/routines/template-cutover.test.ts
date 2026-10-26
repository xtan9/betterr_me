import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as routines from '@/app/api/routines/route';
import * as routine from '@/app/api/routines/[id]/route';
import * as exercises from '@/app/api/routines/[id]/exercises/route';
import * as exercise from '@/app/api/routines/[id]/exercises/[reId]/route';
import { POST as save } from '@/app/api/workouts/[id]/save-as-routine/route';

const { rpc, getUser, from } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({ rpc, from, auth: { getUser } })) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const id = '64190000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ id, reId: id }) };
const paths = [
  { name: 'list', method: 'GET', call: routines.GET },
  { name: 'create', method: 'POST', call: routines.POST },
  { name: 'detail', method: 'GET', call: routine.GET },
  { name: 'update', method: 'PATCH', call: routine.PATCH },
  { name: 'delete', method: 'DELETE', call: routine.DELETE },
  { name: 'list entries', method: 'GET', call: exercises.GET },
  { name: 'add entry', method: 'POST', call: exercises.POST },
  { name: 'update entry', method: 'PATCH', call: exercise.PATCH },
  { name: 'remove entry', method: 'DELETE', call: exercise.DELETE },
  { name: 'old conversion', method: 'POST', call: save },
];
describe('continuing aggregate routine routes at the template cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    rpc.mockResolvedValue({ data: { protocolVersion: 1, templates: { contractVersion: 1, ready: true } }, error: null });
  });
  it.each(paths)('requires the current editor for $name without reading or overwriting stale aggregate facts', async ({ method, call }) => {
    const request = new NextRequest('https://example.test/api/routines', { method,
      ...(method === 'GET' ? {} : { body: JSON.stringify({ name: 'Retained proposal' }) }) });
    const response = await call(request, params);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Refresh the routine editor to continue.', code: 'refresh_required' });
    expect(rpc).toHaveBeenCalledWith('train_template_capabilities');
    expect(from.mock.calls.every(([table]) => table === 'profiles')).toBe(true);
  });
  it('retains the old request when capability verification fails, without attempting a legacy write', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'untrusted database details' } });
    const response = await routines.POST(new NextRequest('https://example.test/api/routines', { method: 'POST', body: JSON.stringify({ name: 'Retained proposal' }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    expect(from.mock.calls.every(([table]) => table === 'profiles')).toBe(true);
  });
});
