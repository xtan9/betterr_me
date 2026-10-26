import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/workouts/active/route';
import { POST } from '@/app/api/workouts/prior-results/route';
import { PriorResultsPicker } from '@/components/fitness/workout-logger/prior-results-picker';
import { historyRecordSchema, type HistoryCursor, type HistoryRecord } from '@/lib/validations/train-history';
import { priorRequestSchema, type PriorPerformed } from '@/lib/validations/train-prior-results';
import fixture from '@/tests/fixtures/train-history-contract.json';
import messages from '@/i18n/messages/en.json';
import { mockSupabaseClient } from '../../../setup';

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: mockSupabaseClient.from, rpc, auth: { getUser } }) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const owner = fixture.record.ownerId;
const activeId = '60000000-0000-4000-8000-000000000001';
const exerciseId = '60000000-0000-4000-8000-000000000002';
const reference = { id: exerciseId, user_id: null, catalog_key: 'strength.barbell-bench-press.v1',
  name: 'Current catalog name', equipment: 'barbell', exercise_type: 'weight_reps' };
const request = priorRequestSchema.parse({ protocolVersion: 1, ownerId: owner, excludeWorkoutId: activeId, before: null,
  target: { identity: { kind: 'catalog', catalogKey: reference.catalog_key }, mode: 'weight_reps', equipment: 'barbell', convention: 'barbell-total' } });
const post = (body: unknown = request) => POST(new Request('http://localhost/api/workouts/prior-results', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
let records: HistoryRecord[];
let nextCursor: HistoryCursor | null;

describe('continuing Web reuses current completed history through actual cookie routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [historyRecordSchema.parse(fixture.record)];
    nextCursor = null;
    getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mockSupabaseClient.setMockResponse([]);
    mockSupabaseClient.maybeSingle.mockResolvedValue({ data: reference, error: null });
    mockSupabaseClient.single.mockResolvedValue({ data: { id: activeId, user_id: owner, status: 'in_progress',
      started_at: '2026-10-26T08:00:00Z', completed_at: null, native_completion: null, recorded_completion: null,
      workout_exercises: [{ id: '60000000-0000-4000-8000-000000000003', exercise_id: exerciseId,
        workout_id: activeId, exercise: reference, sets: [] }] }, error: null });
    rpc.mockImplementation(async (name: string) => {
      if (name === 'list_train_history') return { data: { protocolVersion: 1, ownerId: owner, records, nextCursor }, error: null };
      if (name === 'read_train_history_compat') return { data: { status: 'available', workouts: [] }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/workouts/prior-results');
      return post(JSON.parse(String(init?.body)));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('selects a retrospective result, refreshes an unknown-end correction, and removes a deleted reference', async () => {
    const active = await GET(new Request('http://localhost/api/workouts/active'));
    expect(active.status).toBe(200);
    const read = (await active.json()).workout.exercises[0].priorResults;
    expect(read.page).toMatchObject({ protocolVersion: 2, status: 'found', record: fixture.record });
    expect(read.page.record.current.document.time).toEqual({ kind: 'date-only', workoutDay: '2026-10-24', durationSeconds: null });
    const copied: PriorPerformed[] = [];
    render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PriorResultsPicker read={read} weightUnit="kg" disabled={false} onUse={async value => { copied.push(value); }} />
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    expect(screen.getByText('Latest saved reference · 2026-10-24')).toBeVisible();
    expect(screen.getByText('Load: 0.123 kg · 5 reps')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Use these measurements' }));
    await waitFor(() => expect(copied).toEqual([{ mode: 'weight_reps', weightKg: 0.123, reps: 5, kind: 'working' }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const document = { ...fixture.completion, origin: 'live', time: { kind: 'known-instants', startedAt: '2026-10-24T10:00:00.123456Z',
      completedAt: null, timezone: 'UTC', workoutDay: '2026-10-24', durationSeconds: null },
      exercises: [{ ...fixture.completion.exercises[0], sets: [{ ...fixture.completion.exercises[0].sets[0],
        performed: { mode: 'weight_reps', weightKg: 0.456, reps: 7, kind: 'working' } }] }] };
    records = [historyRecordSchema.parse({ ...fixture.record, revision: '2', current: { kind: 'recorded', document } })];
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh reference' }));
    await screen.findByText('Load: 0.456 kg · 7 reps');
    expect(screen.queryByText('Load: 0.123 kg · 5 reps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use these measurements' }));
    await waitFor(() => expect(copied.at(-1)).toEqual({ mode: 'weight_reps', weightKg: 0.456, reps: 7, kind: 'working' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    records = [];
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh reference' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use these measurements' })).not.toBeInTheDocument());
    expect(copied).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('list_train_history', { p_before: null });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'eq', args: ['user_id', owner] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'eq', args: ['status', 'in_progress'] });
  });

  it('drops an old reference while searching current pages and continues with the exact canonical cursor', async () => {
    const page = await (await post()).json();
    render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PriorResultsPicker read={{ request, page }} weightUnit="kg" disabled={false} onUse={async () => {}} />
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    records = Array.from({ length: 20 }, (_, index) => {
      const id = `60000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
      return historyRecordSchema.parse({ ...fixture.record, id,
        order: { ...fixture.record.order, id }, current: { kind: 'unsupported', document: { version: 99 } } });
    });
    nextCursor = records[19].order;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh reference' }));
    await screen.findByRole('button', { name: 'Continue search' });
    expect(screen.queryByRole('button', { name: 'Use these measurements' })).not.toBeInTheDocument();
    records = [historyRecordSchema.parse(fixture.record)];
    const expectedCursor = nextCursor;
    nextCursor = null;
    fireEvent.click(screen.getByRole('button', { name: 'Continue search' }));
    await screen.findByText('Load: 0.123 kg · 5 reps');
    expect(rpc).toHaveBeenLastCalledWith('list_train_history', { p_before: expectedCursor });
  });

  it('replaces cached picker state when an accepted active read has removed its source', async () => {
    const page = await (await post()).json();
    const copy = vi.fn();
    const view = (value: typeof page) => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PriorResultsPicker read={{ request, page: value }} weightUnit="kg" disabled={false} onUse={copy} />
    </NextIntlClientProvider>;
    const rendered = render(view(page));
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    records = [];
    rendered.rerender(view(await (await post()).json()));
    fireEvent.click(screen.getByRole('button', { name: 'Previous results' }));
    expect(screen.queryByRole('button', { name: 'Use these measurements' })).not.toBeInTheDocument();
    expect(copy).not.toHaveBeenCalled();
  });

  it('rejects foreign owners and invalid current cursors before querying history', async () => {
    expect((await post({ ...request, ownerId: exerciseId })).status).toBe(403);
    expect((await post({ ...request, protocolVersion: 2, before: { ...fixture.record.order, instant: 'tomorrow' } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['rpc-error', 'foreign-owner', 'deleted-row'])('fails closed for %s without falling back to old captures', async failure => {
    if (failure === 'rpc-error') rpc.mockResolvedValueOnce({ data: null, error: { message: 'Private database detail' } });
    else if (failure === 'foreign-owner') records = [{ ...records[0], ownerId: exerciseId }];
    else records = [{ ...records[0], state: 'deleted', current: null }];
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'unavailable', reason: 'service_unavailable' });
    expect(mockSupabaseClient.queryLog.filter(query => query.table === 'workouts' || query.table === 'exercises')).toEqual([]);
  });
});
