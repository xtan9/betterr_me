import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { ExerciseProgressChart } from '@/components/fitness/progress/exercise-progress-chart';
import { ComparableProgress } from '@/components/fitness/progress/comparable-progress';
import { comparableHistory } from '@/lib/fitness/history-progress';
import { historyRecordSchema } from '@/lib/validations/train-history';
import type { PersonalRecord } from '@/lib/db/types';
import fixture from '@/tests/fixtures/train-history-contract.json';
import messages from '@/i18n/messages/en.json';

function sampleRecords() {
  const first = structuredClone(fixture.record);
  first.current.document.exercises.forEach(entry => { entry.sets[0].performed.kind = 'working'; });
  const second = structuredClone(first);
  second.id = second.current.document.id = '44444444-4444-4444-8444-444444444445';
  second.order.id = second.id;
  second.workoutDay = second.order.day = second.current.document.time.workoutDay = '2026-10-25';
  return [historyRecordSchema.parse(first), historyRecordSchema.parse(second)];
}

describe('comparable history presentation through existing exercise surfaces', () => {
  it('keeps all five meanings, exact comparison conditions and every tied source through kg/lb changes', () => {
    const rows = sampleRecords(), groups = comparableHistory(rows), original = JSON.stringify(rows);
    const ui = (unit: 'kg' | 'lbs') => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ComparableProgress groups={groups} weightUnit={unit} mode="records" />
    </NextIntlClientProvider>;
    const { rerender } = render(ui('kg'));
    const weighted = screen.getByText('Weighted Pull-up').closest('section')!;
    expect(within(weighted).getByText('6 reps at 0.45359237 kg added load')).toBeInTheDocument();
    expect(screen.getByText('5 reps at 0 kg assistance')).toBeInTheDocument();
    expect(screen.getByText('Recording convention: total barbell load')).toBeInTheDocument();
    const initialLinks = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(new Set(initialLinks)).toEqual(new Set(rows.map(row => `/workouts/${row.id}`)));
    rerender(ui('lbs'));
    expect(within(screen.getByText('Weighted Pull-up').closest('section')!).getByText('6 reps at 1 lbs added load')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(initialLinks);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('renders current histories, retains unsupported/unavailable distinction and omits warm-up results', () => {
    const record = historyRecordSchema.parse(fixture.record);
    const groups = comparableHistory([record]);
    const records: PersonalRecord = { exercise_id: 'exercise-1', comparisonCoverage: 'current', comparableGroups: groups,
      best_reps: null, best_weight_kg: null, best_volume: null, best_duration_seconds: null, achieved_at: null };
    const ui = (value: PersonalRecord) => <SWRConfig value={{ provider: () => new Map(), revalidateOnMount: false,
      fallback: { '/api/exercises/exercise-1/records': value } }}><NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExerciseProgressChart exerciseId="exercise-1" exerciseName="Captured history" weightUnit="kg" />
    </NextIntlClientProvider></SWRConfig>;
    const { unmount } = render(ui(records));
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument();
    expect(screen.queryByText('Push-up')).not.toBeInTheDocument();
    expect(screen.queryByText('Machine-assisted Pull-up')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').every(link => link.getAttribute('href') === `/workouts/${record.id}`)).toBe(true);
    unmount();
    render(ui({ ...records, comparisonCoverage: 'unavailable', comparableGroups: undefined, best_weight_kg: 999 }));
    expect(screen.getByRole('status')).toHaveTextContent('Comparable progress unavailable');
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });
});
