import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/mobile/train/prior-results/route';
import { POST as cookiePOST } from '@/app/api/workouts/prior-results/route';
import fixture from '@/tests/fixtures/train-prior-results.json';
import measurementFixture from '@/tests/fixtures/train-measurement-contract.json';
import { mockSupabaseClient } from '../../../../../setup';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', async original => ({
  ...await original<typeof import('@supabase/supabase-js')>(),
  createClient: () => ({ from: mockSupabaseClient.from, auth: { getUser } }),
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: mockSupabaseClient.from, auth: { getUser } }) }));
const owner = fixture.request.ownerId;
const exerciseId = '64200000-0000-4000-8000-000000000009';
const result = fixture.responses.found.result;
const completion = { version: 2, ownerId: owner,
  sourceId: '64200000-0000-4000-8000-000000000010', ...result.workout, durationSeconds: 600, planId: null,
  exercises: result.groups.map(group => ({ id: group.exerciseEntryId, definition: group.definition,
    sets: group.sets.map(set => ({ id: set.setId, performed: set.performed })) })) };
const reference = { id: exerciseId, user_id: null, catalog_key: fixture.request.target.identity.catalogKey };
const row = () => ({ id: completion.id, user_id: owner, status: 'completed', started_at: completion.startedAt,
  completed_at: completion.completedAt, duration_seconds: completion.durationSeconds, routine_id: null,
  native_completion: null, recorded_completion: structuredClone(completion),
  workout_exercises: result.groups.map(group => ({ id: group.exerciseEntryId, exercise_id: exerciseId,
    exercise: { ...reference, name: 'Renamed since recording' },
    sets: group.sets.map(set => ({ id: set.setId, is_completed: true })) })) });
const request = (body: unknown = fixture.request, bearer = true) => new Request('https://example.test/api/mobile/train/prior-results', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer fixture-session' } : {}) },
  body: JSON.stringify(body),
});

describe('authenticated prior actual result search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-public-key');
    getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mockSupabaseClient.maybeSingle.mockResolvedValue({ data: reference, error: null });
    mockSupabaseClient.setMockResponse([row()]);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('returns every separately ordered performed occurrence from the latest compatible parent after a rename', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(fixture.responses.found);
    mockSupabaseClient.expectQuery({ table: 'exercises', method: 'eq', args: ['catalog_key', fixture.request.target.identity.catalogKey] });
    mockSupabaseClient.expectQuery({ table: 'exercises', method: 'is', args: ['user_id', null] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'eq', args: ['user_id', owner] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'eq', args: ['status', 'completed'] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'neq', args: ['id', fixture.request.excludeWorkoutId] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'order', args: ['started_at', { ascending: false }] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'order', args: ['id', { ascending: false }] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'limit', args: [21] });
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'select', args: ['id,user_id,status,started_at,completed_at,duration_seconds,routine_id,native_completion,recorded_completion,workout_exercises(id,exercise_id,exercise:exercises(id,user_id,catalog_key),sets:workout_sets(id,is_completed))'] });
  });
  it('continues after twenty ineligible parents using the last raw microsecond cursor, not a filtered entry', async () => {
    const newer = Array.from({ length: 20 }, (_, index) => ({ ...row(),
      id: `64200000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
      started_at: '2026-10-25T07:55:00.123456+00:00', native_completion: null, recorded_completion: null,
    }));
    mockSupabaseClient.setMockResponse([...newer, row()]);
    const page = await (await POST(request())).json();
    expect(page).toEqual({ protocolVersion: 1, ownerId: owner, status: 'searching',
      observedWorkoutIds: newer.map(item => item.id), nextCursor: { startedAt: '2026-10-25T07:55:00.123456+00:00', id: newer[19].id } });
    mockSupabaseClient.setMockResponse([row()]);
    expect(await (await POST(request({ ...fixture.request, before: page.nextCursor }))).json()).toEqual(fixture.responses.found);
    mockSupabaseClient.expectQuery({ table: 'workouts', method: 'or', args: [`started_at.lt.2026-10-25T07:55:00.123456+00:00,and(started_at.eq.2026-10-25T07:55:00.123456+00:00,id.lt.${newer[19].id})`] });
  });
  it('observes unsupported remote IDs without falling back to apparently completed normalized measurements', async () => {
    const unknown = { ...row(), recorded_completion: { ...completion, version: 99 } };
    mockSupabaseClient.setMockResponse([unknown]);
    expect(await (await POST(request())).json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'exhausted', observedWorkoutIds: [completion.id] });
    const unfinished = row();
    unfinished.workout_exercises.forEach(entry => entry.sets.forEach(set => { set.is_completed = false; }));
    mockSupabaseClient.setMockResponse([unfinished]);
    expect(await (await POST(request())).json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'exhausted', observedWorkoutIds: [completion.id] });
  });
  it.each(measurementFixture.completion.exercises)('keeps typed $definition.mode facts and source kind unchanged', async captured => {
    const saved = { ...measurementFixture.completion, ownerId: owner, exercises: [captured] };
    const definition = captured.definition;
    mockSupabaseClient.maybeSingle.mockResolvedValue({ data: { ...reference, catalog_key: definition.catalogKey }, error: null });
    mockSupabaseClient.setMockResponse([{ ...row(), id: saved.id, started_at: saved.startedAt, completed_at: saved.completedAt,
      recorded_completion: saved, workout_exercises: [{ id: captured.id, exercise_id: exerciseId,
        exercise: { ...reference, catalog_key: definition.catalogKey }, sets: captured.sets.map(set => ({ id: set.id, is_completed: true })) }] }]);
    const answer = await (await POST(request({ ...fixture.request, target: { identity: { kind: 'catalog', catalogKey: definition.catalogKey },
      mode: definition.mode, equipment: definition.equipment, convention: definition.convention } }))).json();
    expect(answer).toEqual({ protocolVersion: 1, ownerId: owner, status: 'found', observedWorkoutIds: [saved.id], result: {
      workout: { id: saved.id, startedAt: saved.startedAt, completedAt: saved.completedAt, workoutDay: saved.workoutDay, timezone: saved.timezone },
      groups: [{ exerciseEntryId: captured.id, definition, sets: captured.sets.map(set => ({ setId: set.id, performed: set.performed })) }],
    } });
  });
  it('does not query another owner or interpret malformed cursors as history filters', async () => {
    expect((await POST(request(fixture.request, false))).status).toBe(401);
    expect((await POST(request({ ...fixture.request, ownerId: exerciseId }))).status).toBe(403);
    for (const startedAt of ['tomorrow', '2026-02-30T00:00:00Z', '2026-10-25T06:55:00Z,id.neq.0']) {
      expect((await POST(request({ ...fixture.request, before: { startedAt, id: completion.id } }))).status).toBe(400);
    }
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });
  it('keeps unsupported or unknown target meaning distinct from an exhausted search', async () => {
    for (const [target, reason] of [
      [{ ...fixture.request.target, convention: null }, 'meaning_unknown'],
      [{ ...fixture.request.target, mode: 'duration_weight', convention: null }, 'mode_unsupported'],
    ] as const) expect(await (await POST(request({ ...fixture.request, target }))).json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'unavailable', reason });
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });
  it('reports transport and reference failures as unavailable without reflecting private details or false exhaustion', async () => {
    mockSupabaseClient.setMockResponse(null, { message: 'private history details' });
    const failed = await POST(request());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual(fixture.responses.serviceUnavailable);
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'private reference details' } });
    expect(await (await POST(request())).json()).toEqual(fixture.responses.serviceUnavailable);
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await (await POST(request())).json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'unavailable', reason: 'definition_unavailable' });
  });
  it('does not expose a foreign parent or foreign definition joined to owned-looking children', async () => {
    mockSupabaseClient.setMockResponse([{ ...row(), user_id: exerciseId }]);
    expect((await POST(request())).status).toBe(503);
    const hidden = { ...row(), workout_exercises: row().workout_exercises.map(entry => ({ ...entry,
      exercise: { ...entry.exercise, user_id: exerciseId } })) };
    mockSupabaseClient.setMockResponse([hidden]);
    expect(await (await POST(request())).json()).toEqual({ protocolVersion: 1, ownerId: owner, status: 'exhausted', observedWorkoutIds: [completion.id] });
  });
  it('uses the same typed source through real cookie authentication and rejects a stale account request', async () => {
    const response = await cookiePOST(request(fixture.request, false));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fixture.responses.found);
    expect((await cookiePOST(request({ ...fixture.request, ownerId: exerciseId }, false))).status).toBe(403);
  });
  it('retains frozen v1 values while projecting only the typed read mode', async () => {
    const saved = { ...completion, version: 1, exercises: completion.exercises.map(entry => ({ ...entry,
      sets: entry.sets.map(set => ({ ...set, performed: { weightKg: set.performed.weightKg, reps: set.performed.reps, kind: set.performed.kind } })) })) };
    mockSupabaseClient.setMockResponse([{ ...row(), native_completion: saved, recorded_completion: null }]);
    expect(await (await POST(request())).json()).toEqual(fixture.responses.found);
    expect(saved.exercises[0].sets[0].performed).toEqual({ weightKg: 0.123, reps: 5, kind: 'warmup' });
  });
});
