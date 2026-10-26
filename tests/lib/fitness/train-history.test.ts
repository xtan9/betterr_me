import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/train-history-contract.json';
import { recordedWorkoutSchema } from '@/lib/validations/workout-recording';
import { selectRecordedCompletion } from '@/lib/fitness/recorded-definition';
import { historyRecordSchema } from '@/lib/validations/train-history';

describe('recorded history date-only facts', () => {
  it('reads a five-mode chosen day with unknown duration without manufacturing an instant', () => {
    const document = fixture.completion;
    expect(recordedWorkoutSchema.safeParse(document).success).toBe(true);
    const selected = selectRecordedCompletion({ id: document.id, user_id: document.ownerId, status: 'completed', started_at: null, completed_at: null, duration_seconds: null, routine_id: null, native_completion: null, recorded_completion: document });
    expect(selected).toEqual({ status: 'recorded', completion: document });
    expect(Object.hasOwn(document, 'startedAt')).toBe(false);
  });
  it('distinguishes known zero and rejects fabricated date-only instants or invalid civil dates', () => {
    const document = structuredClone(fixture.completion);
    expect(recordedWorkoutSchema.safeParse({ ...document, time: { ...document.time, durationSeconds: 0 } }).success).toBe(true);
    expect(recordedWorkoutSchema.safeParse({ ...document, time: { ...document.time, startedAt: '2026-10-24T00:00:00Z' } }).success).toBe(false);
    expect(recordedWorkoutSchema.safeParse({ ...document, time: { ...document.time, workoutDay: '2026-02-30' } }).success).toBe(false);
  });
  it('rejects a reversed microsecond endpoint and mismatched current chosen-day authority', () => {
    const document = {...fixture.completion,origin:'live',time:{kind:'known-instants',startedAt:'2026-10-24T10:00:00.123456Z',completedAt:'2026-10-24T10:00:00.123455Z',timezone:'UTC',workoutDay:'2026-10-24',durationSeconds:null}};
    expect(recordedWorkoutSchema.safeParse(document).success).toBe(false);
    expect(recordedWorkoutSchema.safeParse({...document,time:{...document.time,completedAt:null}}).success).toBe(true);
    expect(historyRecordSchema.safeParse({...fixture.record,workoutDay:'2026-10-23'}).success).toBe(false);
    expect(historyRecordSchema.safeParse({...fixture.record,order:{...fixture.record.order,day:'2026-10-23'}}).success).toBe(false);
  });

});
