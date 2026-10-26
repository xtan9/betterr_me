import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createWorkoutWrites } from '@/lib/fitness/writes';
import { workoutTools } from '@/lib/ai/tools/workouts';
import type { ToolContext } from '@/lib/ai/tools/types';
import fixture from '@/tests/fixtures/workout-templates.json';
import { mockSupabaseClient } from '../../setup';

const owner = '64190000-0000-4000-8000-000000000001';
const templateId = '64190000-0000-4000-8000-000000000002';
const staleAggregate = { id: templateId, user_id: owner, name: 'Source', notes: null,
  routine_exercises: [{ id: 'entry', exercise_id: 'exercise', target_sets: null, target_reps: null,
    exercise: { user_id: null } }], exercises: [] };
const started = { id: '64190000-0000-4000-8000-000000000003', user_id: owner, title: 'Source', status: 'in_progress',
  exercises: [{ id: 'copied', sets: [{ weight_kg: 0.123, reps: 5, set_type: 'warmup', is_completed: false },
    { weight_kg: null, reps: null, set_type: 'normal', is_completed: false }] }] };

describe('authoritative template starts', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseClient.setMockResponse(staleAggregate); });
  it('starts heterogeneous targets through real workout writes without interpreting stale aggregate targets', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: { status: 'started', workout: started }, error: null });
    expect(await createWorkoutWrites(mockSupabaseClient as unknown as SupabaseClient).start({ userId: owner,
      source: { type: 'routine', routineId: templateId } })).toEqual({ type: 'started', workout: started });
    expect(mockSupabaseClient.rpc).toHaveBeenCalledExactlyOnceWith('start_train_template_workout', { p_user_id: owner, p_template_id: templateId });
    mockSupabaseClient.expectQuery({ table: 'routines', method: 'eq', args: ['user_id', owner] });
  });
  it('reads current per-set template authority for a trusted read-only Assistant principal', async () => {
    const read = { ...fixture.read, template: { ...fixture.read.template, ownerId: owner } };
    mockSupabaseClient.rpc.mockResolvedValue({ data: { status: 'available', protocolVersion: 1, templates: [read], nextCursor: null }, error: null });
    expect(await workoutTools().find(tool => tool.name === 'getRoutines')!.execute({}, {
      userId: owner, supabase: mockSupabaseClient, date: '2026-10-25', timezone: 'UTC',
      principal: { type: 'user', userId: owner, credential: 'mcp' }, permissions: ['read'],
    } as unknown as ToolContext)).toEqual([read]);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledExactlyOnceWith('mcp_read_train_templates', { p_user_id: owner, p_after: null });
  });
  it('keeps the trusted MCP principal and reports authoritative invalid source without making a legacy start', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: { status: 'invalid_source' }, error: null });
    const answer = await workoutTools().find(tool => tool.name === 'startWorkout')!.execute({ routineId: templateId }, {
      userId: owner, supabase: mockSupabaseClient, date: '2026-10-25', timezone: 'UTC',
      principal: { type: 'user', userId: owner, credential: 'mcp' }, permissions: ['read', 'write'],
    } as unknown as ToolContext);
    expect(answer).toMatchObject({ error: expect.stringContaining('template') });
    expect(mockSupabaseClient.rpc).toHaveBeenCalledExactlyOnceWith('mcp_workout_command', {
      p_user_id: owner, p_operation: 'start_train_template_workout', p_request: { p_user_id: owner, p_template_id: templateId },
    });
  });
  it('fails a trusted read on database error or a mismatched owner without falling back to aggregates', async () => {
    const context = { userId: owner, supabase: mockSupabaseClient, date: '2026-10-25', timezone: 'UTC',
      principal: { type: 'user', userId: owner, credential: 'mcp' }, permissions: ['read'] } as unknown as ToolContext;
    const read = workoutTools().find(tool => tool.name === 'getRoutines')!;
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private SQL details' } });
    await expect(read.execute({}, context)).rejects.toThrow('Templates unavailable');
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { status: 'available', protocolVersion: 1, templates: [fixture.read], nextCursor: null }, error: null });
    await expect(read.execute({}, context)).rejects.toThrow('Invalid template response');
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });
});
