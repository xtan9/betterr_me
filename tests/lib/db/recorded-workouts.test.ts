import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { workoutTools } from '@/lib/ai/tools/workouts';
import type { ToolContext } from '@/lib/ai/tools/types';
import { WorkoutToRoutineConversion } from '@/lib/fitness/routine-workout-conversion';
import { computePersonalRecords, isNewPR } from '@/lib/fitness/personal-records';
import { WorkoutsDB } from '@/lib/db/workouts';
import contract from '@/tests/fixtures/train-measurement-contract.json';
import customContract from '@/tests/fixtures/train-custom-exercise-contract.json';
import templateContract from '@/tests/fixtures/workout-templates.json';
import { mockSupabaseClient } from '../../setup';

const completion = contract.completion;
const measurements: { weight_kg: number | null; reps: number | null; duration_seconds: number | null; set_type: string }[] = [
  { weight_kg: 0.123, reps: 5, duration_seconds: null, set_type: 'normal' },
  { weight_kg: null, reps: 8, duration_seconds: null, set_type: 'warmup' },
  { weight_kg: 0.45359237, reps: 6, duration_seconds: null, set_type: 'normal' },
  { weight_kg: 0, reps: 5, duration_seconds: null, set_type: 'warmup' },
  { weight_kg: null, reps: null, duration_seconds: 90, set_type: 'normal' },
];
const recordedRow = () => ({
  id: completion.id, user_id: completion.ownerId, title: 'Workout', status: 'completed',
  started_at: completion.startedAt, completed_at: completion.completedAt, duration_seconds: 600,
  notes: null, routine_id: null, native_completion: null, recorded_completion: structuredClone(completion),
  workout_exercises: completion.exercises.map((entry, index) => ({
    id: entry.id, workout_id: completion.id, exercise_id: `reference-${index}`, sort_order: index, notes: null, rest_timer_seconds: null,
    exercise: { id: `reference-${index}`, user_id: null, name: `Renamed ${index}`, equipment: entry.definition.equipment, exercise_type: entry.definition.mode },
    sets: [{ id: entry.sets[0].id, set_number: 1, ...measurements[index], is_completed: true, distance_meters: null, rpe: null }],
  })),
});

describe('recorded workout readback', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseClient.setMockResponse(null); });
  const db = () => new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient);

  it('reads a v3 owned custom snapshot after rename/archive through Web and Assistant without changing its reference', async () => {
    const saved = customContract.completion.completion;
    const captured = saved.exercises[0];
    const row = { ...recordedRow(), id:saved.id, user_id:saved.ownerId, started_at:saved.startedAt, completed_at:saved.completedAt,
      duration_seconds:saved.durationSeconds, recorded_completion:saved,
      workout_exercises:[{...recordedRow().workout_exercises[0], id:captured.id, workout_id:saved.id,
        exercise_id:captured.definition.reference.exerciseId, exercise:{id:captured.definition.reference.exerciseId,user_id:saved.ownerId,
          name:'Renamed and archived later',equipment:'kettlebell',exercise_type:'weight_reps',archived_at:'2026-10-26T10:00:00Z'},
        sets:[{...recordedRow().workout_exercises[0].sets[0],id:captured.sets[0].id}]}] };
    mockSupabaseClient.setMockResponse(row);
    const result = await db().getWorkoutWithExercises(saved.id,saved.ownerId);
    expect(result).toMatchObject({recordedStatus:'recorded',recorded_completion:saved,exercises:[{
      exercise_id:captured.definition.reference.exerciseId,exercise:{name:'My kettlebell press'},live_exercise:{name:'Renamed and archived later'},
      recorded_definition:captured.definition,sets:[{weight_kg:0.123,reps:5}]}]});
    mockSupabaseClient.setMockResponse(row);
    const answer = await workoutTools().find(item=>item.name==='getWorkoutDetails')!.execute({workoutId:saved.id},
      {userId:saved.ownerId,supabase:mockSupabaseClient,date:saved.workoutDay,timezone:'UTC'} as unknown as ToolContext);
    expect(JSON.stringify(answer)).toContain('My kettlebell press');
    expect(answer).toMatchObject({exercises:[{exercise:{name:'My kettlebell press'},recorded_definition:captured.definition}]});
  });

  it('reads a partly performed template workout with its full original targets and source identity', async () => {
    const saved = templateContract.completionEnvelope.completion;
    const captured = saved.exercises[0];
    const row = { ...recordedRow(), id: saved.id, user_id: saved.ownerId, started_at: saved.startedAt,
      completed_at: saved.completedAt, duration_seconds: saved.durationSeconds,
      routine_id: saved.templateOrigin.content.id, recorded_completion: saved,
      workout_exercises: [{ ...recordedRow().workout_exercises[0], id: captured.id, workout_id: saved.id,
        exercise_id: saved.templateOrigin.content.entries[0].exerciseId,
        sets: [{ ...recordedRow().workout_exercises[0].sets[0], id: captured.sets[0].id, set_type: 'warmup' }] }] };
    mockSupabaseClient.setMockResponse(row);
    expect(await db().getWorkoutWithExercises(saved.id, saved.ownerId)).toMatchObject({
      recordedStatus: 'recorded', routine_id: saved.templateOrigin.content.id, recorded_completion: saved,
      exercises: [{ recorded_definition: captured.definition, exercise: { name: 'Barbell Bench Press' }, sets: [{ weight_kg: 0.123 }] }],
    });
    mockSupabaseClient.setMockResponse(row);
    const answer = await workoutTools().find(item => item.name === 'getWorkoutDetails')!.execute({ workoutId: saved.id },
      { userId: saved.ownerId, supabase: mockSupabaseClient, date: saved.workoutDay, timezone: 'UTC' } as unknown as ToolContext);
    expect(answer).toMatchObject({ exercises: [{ recorded_definition: captured.definition }] });
    for (const invalid of [
      { ...row, routine_id: null },
      { ...row, recorded_completion: { ...saved, exercises: [{ ...captured, definition: { ...captured.definition, name: { ...captured.definition.name, en: 'Changed binding' } } }] } },
      { ...row, recorded_completion: { ...saved, templateOrigin: { ...saved.templateOrigin, bindings: [] } } },
    ]) {
      mockSupabaseClient.setMockResponse(invalid);
      expect(await db().getWorkoutWithExercises(saved.id, saved.ownerId)).toMatchObject({ recordedStatus: 'unsupported', exercises: [] });
    }
  });

  it('opens all five captured meanings after their live definitions are renamed', async () => {
    mockSupabaseClient.setMockResponse(recordedRow());
    const result = await db().getWorkoutWithExercises(completion.id, completion.ownerId);
    expect(result).toMatchObject({ id: completion.id, recordedStatus: 'recorded', recorded_completion: completion });
    expect(result?.exercises.map(entry => entry.exercise.name)).toEqual(['Barbell Bench Press', 'Push-up', 'Weighted Pull-up', 'Machine-assisted Pull-up', 'Plank']);
    expect(result?.exercises[3]).toMatchObject({ recorded_definition: { convention: 'assistance' }, live_exercise: { name: 'Renamed 3' }, sets: [{ weight_kg: 0, reps: 5 }] });
    mockSupabaseClient.expectQuery({ method: 'eq', args: ['user_id', completion.ownerId] });
  });

  it('keeps v3 legacy unknown meaning readable without inventing comparison or previous-set authority', async () => {
    const original = customContract.completion.completion;
    const captured = original.exercises[0];
    const saved = { ...original, exercises: [{ ...captured, definition: { ...captured.definition, name: '', convention: null } }] };
    const entry = { ...recordedRow().workout_exercises[0], id: captured.id, workout_id: saved.id,
      exercise_id: captured.definition.reference.exerciseId,
      exercise: { id: captured.definition.reference.exerciseId, user_id: saved.ownerId, name: 'Live legacy name', equipment: 'kettlebell', exercise_type: 'weight_reps' },
      sets: [{ ...recordedRow().workout_exercises[0].sets[0], id: captured.sets[0].id }] };
    const row = { ...recordedRow(), id: saved.id, user_id: saved.ownerId, started_at: saved.startedAt, completed_at: saved.completedAt,
      duration_seconds: saved.durationSeconds, recorded_completion: saved, workout_exercises: [entry] };
    mockSupabaseClient.setMockResponse(row);
    expect(await db().getWorkoutWithExercises(saved.id, saved.ownerId)).toMatchObject({ recordedStatus: 'recorded', exercises: [{ exercise: { name: '' }, sets: [{ weight_kg: 0.123 }] }] });
    mockSupabaseClient.setMockResponse([row]);
    expect((await db().getWorkoutsWithSummary(saved.ownerId))[0]).toMatchObject({ totalVolume: null, totalSets: 1 });
    mockSupabaseClient.setMockResponse([{ ...entry, workout: row }]);
    expect(await db().getPreviousSets(entry.exercise_id, saved.ownerId)).toEqual([]);
    mockSupabaseClient.setMockResponse([{ ...entry, workout: row }]);
    expect(await db().getExerciseSets(entry.exercise_id, saved.ownerId)).toEqual([]);
  });

  it('keeps positive assistance as a fact without reporting lifted load or volume progress', async () => {
    const row = recordedRow();
    row.recorded_completion.exercises[3].sets[0].performed = { mode: 'assisted_bodyweight', assistanceKg: 100, reps: 10, kind: 'working' };
    row.workout_exercises[3].sets[0] = { ...row.workout_exercises[3].sets[0], weight_kg: 100, reps: 10, set_type: 'normal' };
    mockSupabaseClient.setMockResponse([row]);
    const summary = await db().getWorkoutsWithSummary(completion.ownerId);
    expect(summary[0].totalVolume).toBeCloseTo(3.33655422, 12);
    const historyRow = { ...row.workout_exercises[3], workout: row };
    mockSupabaseClient.setMockResponse([historyRow]);
    expect(await db().getExerciseHistory('reference-3', completion.ownerId)).toEqual([{
      workout_id: completion.id, started_at: completion.startedAt, best_set_weight_kg: null, best_set_reps: 10, total_volume: null, total_sets: 1,
    }]);
    mockSupabaseClient.setMockResponse([historyRow]);
    const sets = await db().getExerciseSets('reference-3', completion.ownerId);
    expect(sets[0]).toMatchObject({ weight_kg: 100, reps: 10, measurement_mode: 'assisted_bodyweight' });
    expect(computePersonalRecords('reference-3', sets)).toMatchObject({ best_weight_kg: null, best_volume: null, best_reps: null });
  });

  it('does not rank assisted repetitions across assistance levels and still recognizes bodyweight repetitions', async () => {
    const history = [
      { weight_kg: 10, reps: 5, workout_started_at: '2026-10-24T07:00:00Z' },
      { weight_kg: 100, reps: 10, workout_started_at: '2026-10-25T07:00:00Z' },
    ].map(({ workout_started_at, ...values }) => ({
      id: 'assisted-entry', exercise: { user_id: null, exercise_type: 'assisted_bodyweight' },
      sets: [{ ...recordedRow().workout_exercises[3].sets[0], ...values, set_type: 'normal' }],
      workout: { id: workout_started_at, user_id: completion.ownerId, started_at: workout_started_at,
        status: 'completed', native_completion: null, recorded_completion: null },
    }));
    mockSupabaseClient.setMockResponse(history);
    const sets = await db().getExerciseSets('reference-3', completion.ownerId);
    expect(sets.map(set => [set.weight_kg, set.reps, set.measurement_mode])).toEqual([
      [10, 5, 'assisted_bodyweight'], [100, 10, 'assisted_bodyweight'],
    ]);
    const previous = computePersonalRecords('reference-3', sets.slice(0, 1));
    expect(computePersonalRecords('reference-3', sets)).toMatchObject({ best_weight_kg: null, best_volume: null, best_reps: null, achieved_at: null });
    expect(isNewPR(sets[1], 'assisted_bodyweight', previous)).toEqual({ isWeightPR: false, isVolumePR: false, isRepsPR: false, isDurationPR: false });
    const bodyweight = sets.map(set => ({ ...set, weight_kg: null, measurement_mode: 'bodyweight_reps' }));
    expect(computePersonalRecords('bodyweight', bodyweight).best_reps).toBe(10);
    expect(isNewPR(bodyweight[1], 'bodyweight_reps', computePersonalRecords('bodyweight', bodyweight.slice(0, 1))).isRepsPR).toBe(true);
    mockSupabaseClient.expectQuery({ table: 'workout_exercises', method: 'eq', args: ['workout.user_id', completion.ownerId] });
  });

  it.each([
    { recorded_completion: { version: 99 } },
    { recorded_completion: { ...completion, ownerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
    { native_completion: { version: 1 } },
    { recorded_completion: { ...completion, completedAt: 'tomorrow' } },
  ])('keeps malformed or ambiguous authority unreadable without falling back: %o', async patch => {
    mockSupabaseClient.setMockResponse({ ...recordedRow(), ...patch });
    const result = await db().getWorkoutWithExercises(completion.id, completion.ownerId);
    expect(result).toMatchObject({ id: completion.id, recordedStatus: 'unsupported', exercises: [], workout_exercises: [] });
    mockSupabaseClient.setMockResponse({ ...recordedRow(), ...patch });
    const tool = workoutTools().find(item => item.name === 'getWorkoutDetails')!;
    const answer = await tool.execute({ workoutId: completion.id }, { userId: completion.ownerId, supabase: mockSupabaseClient, date: '2026-10-25', timezone: 'UTC' } as unknown as ToolContext);
    expect(answer).toEqual({ id: completion.id, recordedStatus: 'unsupported', error: 'This recorded workout format cannot be read by this version. Update before interpreting its exercises or sets.' });
  });

  it('does not use unsupported recorded facts as previous-set suggestions', async () => {
    const row = recordedRow();
    const previous = { ...row.workout_exercises[0], workout: { ...row, recorded_completion: { version: 99 } } };
    mockSupabaseClient.setMockResponse([previous]);
    expect(await db().getPreviousSets('reference-0', completion.ownerId)).toEqual([]);
  });

  it('refuses save-as-routine for an unsupported selected authority', async () => {
    mockSupabaseClient.setMockResponse({ ...recordedRow(), recorded_completion: { version: 99 } });
    const result = await db().getWorkoutWithExercises(completion.id, completion.ownerId);
    const writes: unknown[] = [];
    const conversion = new WorkoutToRoutineConversion({ createRoutine: async (_owner, input) => { writes.push(input); return {} as never; } });
    await expect(conversion.save(completion.ownerId, 'Unsafe interpretation', result!)).rejects.toThrow('unsupported');
    expect(writes).toEqual([]);
  });

  it('keeps an unsupported workout between readable rows without interpreting its sets', async () => {
    const unsupported = { ...recordedRow(), id: '66666666-6666-4666-8666-666666666666', recorded_completion: { version: 99 } };
    const legacy = { ...recordedRow(), id: '77777777-7777-4777-8777-777777777777', recorded_completion: null };
    mockSupabaseClient.setMockResponse([recordedRow(), unsupported, legacy]);
    const result = await db().getWorkoutsWithSummary(completion.ownerId, { limit: 3, offset: 0 });
    expect(result.map(row => row.id)).toEqual([completion.id, unsupported.id, legacy.id]);
    expect(result[0]).toMatchObject({ recordedStatus: 'recorded', exerciseNames: ['Barbell Bench Press', 'Push-up', 'Weighted Pull-up', 'Machine-assisted Pull-up', 'Plank'] });
    expect(result[1]).toMatchObject({ recordedStatus: 'unsupported', exerciseNames: [], totalVolume: null, totalSets: null, exerciseCount: null });
    expect(result[2]).toMatchObject({ recordedStatus: 'legacy', exerciseNames: ['Renamed 0', 'Renamed 1', 'Renamed 2', 'Renamed 3', 'Renamed 4'] });
    mockSupabaseClient.expectQuery({ method: 'range', args: [0, 2] });
  });
});
